import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { executeStatement, queryFirst, queryRows, withTransaction } from '../../../common/db/query.js';
import { AppError } from '../../../common/errors/app-error.js';

const CONTENT_DIMENSION_TYPES = ['version', 'subject', 'grade', 'term'] as const;
const CONTENT_DIMENSION_LABELS: Record<ContentDimensionType, string> = {
  version: '教材版本',
  subject: '学科导航',
  grade: '年级',
  term: '学期',
};
const CONTENT_DIMENSION_DESCRIPTIONS: Record<ContentDimensionType, string> = {
  version: '控制前台左上角切换的整站内容范围，可关联学科与年级。',
  subject: '控制首页主导航的学科入口，并决定是否在前台首页显示。',
  grade: '作为课程筛选维度，用于区分适用年级和教材范围。',
  term: '作为更低层的筛选维度，用于区分上下学期内容。',
};

type SqlExecutor = Pool | PoolConnection;
export type ContentDimensionType = (typeof CONTENT_DIMENSION_TYPES)[number];

type DictTypeRow = RowDataPacket & {
  type_id: string;
  type_code: string;
  type_name: string;
  type_status: string;
  type_remark: string | null;
};

type DictItemRow = RowDataPacket & {
  id: string;
  type_id: string;
  type_code: string;
  type_name: string;
  type_status: string;
  type_remark: string | null;
  item_code: string;
  item_name: string;
  parent_id: string | null;
  sort_order: number;
  status: string;
  extra_json: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CountRow = RowDataPacket & {
  total: string | number;
};

type GroupCountRow = RowDataPacket & {
  dimension_code: string | null;
  total: string | number;
};

type SerializedDictItem = {
  id: string;
  type_id: string;
  type: string;
  type_name: string;
  type_status: string;
  type_remark: string | null;
  item_code: string;
  item_name: string;
  parent_id: string | null;
  sort_order: number;
  status: string;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type RelationOption = {
  id: string;
  item_code: string;
  item_name: string;
  status: string;
};

type SerializedContentDimensionItem = SerializedDictItem & {
  flags: {
    is_default: boolean;
    home_visible: boolean;
  };
  relations: Record<ContentDimensionType, RelationOption[]>;
  metrics: {
    course_count: number;
  };
};

type ContentDimensionInput = {
  type: ContentDimensionType;
  item_code: string;
  item_name: string;
  sort_order?: number;
  status?: string;
  is_default?: boolean;
  home_visible?: boolean;
  version_codes?: string[];
  grade_codes?: string[];
  subject_codes?: string[];
};

type RelationLookup = {
  byCode: Map<string, SerializedDictItem>;
  byName: Map<string, SerializedDictItem>;
};

export async function listContentDimensions(db: Pool) {
  const [rows, courseCounts] = await Promise.all([
    listContentDimensionRows(db),
    readContentDimensionCourseCounts(db),
  ]);

  return serializeContentDimensionPayload(rows, courseCounts);
}

export async function createContentDimension(db: Pool, input: ContentDimensionInput) {
  validateDimensionStatus(input.status);

  return withTransaction(db, async (connection) => {
    const type = ensureContentDimensionType(input.type);
    const typeData = await ensureDictionaryType(connection, type);
    await assertItemCodeUnique(connection, typeData.type_id, input.item_code);

    const nextExtra = await buildNextDimensionExtra(connection, type, {}, input);
    const result = await executeStatement(
      connection,
      `
        INSERT INTO dict_items (
          type_id,
          item_code,
          item_name,
          parent_id,
          sort_order,
          status,
          extra_json
        )
        VALUES (
          :typeId,
          :itemCode,
          :itemName,
          NULL,
          :sortOrder,
          :status,
          :extraJson
        )
      `,
      {
        typeId: typeData.type_id,
        itemCode: input.item_code.trim(),
        itemName: input.item_name.trim(),
        sortOrder: input.sort_order ?? 0,
        status: input.status ?? 'enabled',
        extraJson: JSON.stringify(nextExtra),
      },
    );

    const itemId = String(result.insertId);

    if (type === 'version' && readBoolean(nextExtra.is_default)) {
      await clearOtherDefaultVersions(connection, itemId);
    }

    await syncDimensionRelations(connection, type, input.item_code.trim(), nextExtra);

    return getSerializedDictionaryItem(connection, itemId);
  });
}

export async function updateContentDimension(db: Pool, itemId: string, input: ContentDimensionInput) {
  validateDimensionStatus(input.status);

  return withTransaction(db, async (connection) => {
    const current = await getDictionaryItemRowById(connection, itemId);
    const type = ensureContentDimensionType(current.type_code);

    if (input.type !== type) {
      throw new AppError(422, 42200, '内容维度类型不允许跨类修改');
    }

    if (input.item_code.trim() !== current.item_code) {
      throw new AppError(422, 42200, '内容维度编码创建后不可修改');
    }

    await assertItemCodeUnique(connection, current.type_id, input.item_code, itemId);

    const nextExtra = await buildNextDimensionExtra(connection, type, parseJsonObject(current.extra_json), input);
    await executeStatement(
      connection,
      `
        UPDATE dict_items
        SET
          item_code = :itemCode,
          item_name = :itemName,
          sort_order = :sortOrder,
          status = :status,
          extra_json = :extraJson
        WHERE id = :itemId
      `,
      {
        itemId,
        itemCode: input.item_code.trim(),
        itemName: input.item_name.trim(),
        sortOrder: input.sort_order ?? current.sort_order,
        status: input.status ?? current.status,
        extraJson: JSON.stringify(nextExtra),
      },
    );

    if (type === 'version' && readBoolean(nextExtra.is_default)) {
      await clearOtherDefaultVersions(connection, itemId);
    }

    await syncDimensionRelations(connection, type, current.item_code, nextExtra);

    return getSerializedDictionaryItem(connection, itemId);
  });
}

export async function deleteContentDimension(db: Pool, itemId: string) {
  return withTransaction(db, async (connection) => {
    const current = await getDictionaryItemRowById(connection, itemId);
    const type = ensureContentDimensionType(current.type_code);

    await assertDeleteAllowed(connection, current, type);

    const childCount = await readCount(
      connection,
      `
        SELECT COUNT(*) AS total
        FROM dict_items
        WHERE parent_id = :itemId
      `,
      { itemId },
    );

    if (childCount > 0) {
      throw new AppError(409, 40900, '当前维度存在子级，暂不支持删除');
    }

    await executeStatement(connection, `DELETE FROM dict_items WHERE id = :itemId`, { itemId });

    const remainCount = await readCount(
      connection,
      `
        SELECT COUNT(*) AS total
        FROM dict_items
        WHERE type_id = :typeId
      `,
      { typeId: current.type_id },
    );

    if (remainCount === 0) {
      await executeStatement(connection, `DELETE FROM dict_types WHERE id = :typeId`, { typeId: current.type_id });
    }

    return {
      success: true,
      id: itemId,
    };
  });
}

export function getContentDimensionTypeMeta() {
  return CONTENT_DIMENSION_TYPES.map((type) => ({
    type,
    label: CONTENT_DIMENSION_LABELS[type],
    description: CONTENT_DIMENSION_DESCRIPTIONS[type],
  }));
}

function ensureContentDimensionType(value: string): ContentDimensionType {
  if ((CONTENT_DIMENSION_TYPES as readonly string[]).includes(value)) {
    return value as ContentDimensionType;
  }

  throw new AppError(400, 40001, '不支持的内容维度类型');
}

async function listContentDimensionRows(db: SqlExecutor) {
  return queryRows<DictItemRow>(
    db,
    `
      SELECT
        i.id,
        t.id AS type_id,
        t.type_code,
        t.type_name,
        t.status AS type_status,
        t.remark AS type_remark,
        i.item_code,
        i.item_name,
        i.parent_id,
        i.sort_order,
        i.status,
        i.extra_json,
        i.created_at,
        i.updated_at
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE t.type_code IN ('version', 'subject', 'grade', 'term')
      ORDER BY
        FIELD(t.type_code, 'version', 'subject', 'grade', 'term'),
        i.sort_order DESC,
        i.id ASC
    `,
  );
}

async function readContentDimensionCourseCounts(db: SqlExecutor) {
  const entries = await Promise.all(
    (
      [
        ['version', 'version_code'],
        ['subject', 'subject_code'],
        ['grade', 'grade_code'],
        ['term', 'term_code'],
      ] as const
    ).map(async ([type, column]) => {
      const rows = await queryRows<GroupCountRow>(
        db,
        `
          SELECT ${column} AS dimension_code, COUNT(*) AS total
          FROM courses
          WHERE deleted_at IS NULL
            AND ${column} IS NOT NULL
            AND ${column} <> ''
          GROUP BY ${column}
        `,
      );

      return [
        type,
        new Map(rows.map((row) => [String(row.dimension_code), normalizeCount(row.total)])),
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<ContentDimensionType, Map<string, number>>;
}

function serializeContentDimensionPayload(
  rows: DictItemRow[],
  courseCounts: Record<ContentDimensionType, Map<string, number>>,
) {
  const serialized = rows.map(serializeDictionaryItem);
  const lookups = buildRelationLookups(serialized);

  const grouped = Object.fromEntries(
    CONTENT_DIMENSION_TYPES.map((type) => [type, [] as SerializedContentDimensionItem[]]),
  ) as Record<ContentDimensionType, SerializedContentDimensionItem[]>;

  for (const item of serialized) {
    const type = ensureContentDimensionType(item.type);
    grouped[type].push(serializeContentDimensionItem(item, lookups, courseCounts[type]));
  }

  grouped.version.sort(compareDimensionItems);
  grouped.subject.sort(compareDimensionItems);
  grouped.grade.sort(compareDimensionItems);
  grouped.term.sort(compareDimensionItems);

  for (const version of grouped.version) {
    version.relations.subject = mergeRelationItems(
      version.relations.subject,
      grouped.subject
        .filter((item) => item.relations.version.some((entry) => entry.item_code === version.item_code))
        .map(toRelationOption),
    );
    version.relations.grade = mergeRelationItems(
      version.relations.grade,
      grouped.grade
        .filter((item) => item.relations.version.some((entry) => entry.item_code === version.item_code))
        .map(toRelationOption),
    );
  }

  for (const subject of grouped.subject) {
    subject.relations.version = mergeRelationItems(
      subject.relations.version,
      grouped.version
        .filter((item) => item.relations.subject.some((entry) => entry.item_code === subject.item_code))
        .map(toRelationOption),
    );
  }

  for (const grade of grouped.grade) {
    grade.relations.version = mergeRelationItems(
      grade.relations.version,
      grouped.version
        .filter((item) => item.relations.grade.some((entry) => entry.item_code === grade.item_code))
        .map(toRelationOption),
    );
    grade.relations.term = mergeRelationItems(
      grade.relations.term,
      grouped.term
        .filter((item) => item.relations.grade.some((entry) => entry.item_code === grade.item_code))
        .map(toRelationOption),
    );
  }

  return {
    dimension_types: getContentDimensionTypeMeta(),
    dimensions: grouped,
  };
}

function compareDimensionItems(left: SerializedContentDimensionItem, right: SerializedContentDimensionItem) {
  if (left.type === 'version' || right.type === 'version') {
    const defaultDiff = Number(right.flags.is_default) - Number(left.flags.is_default);

    if (defaultDiff !== 0) {
      return defaultDiff;
    }
  }

  return right.sort_order - left.sort_order || left.id.localeCompare(right.id);
}

function buildRelationLookups(items: SerializedDictItem[]) {
  const result = Object.fromEntries(
    CONTENT_DIMENSION_TYPES.map((type) => [
      type,
      {
        byCode: new Map<string, SerializedDictItem>(),
        byName: new Map<string, SerializedDictItem>(),
      } satisfies RelationLookup,
    ]),
  ) as Record<ContentDimensionType, RelationLookup>;

  for (const item of items) {
    const type = ensureContentDimensionType(item.type);
    result[type].byCode.set(item.item_code, item);
    result[type].byName.set(item.item_name, item);
  }

  return result;
}

function serializeContentDimensionItem(
  item: SerializedDictItem,
  lookups: Record<ContentDimensionType, RelationLookup>,
  courseCountMap: Map<string, number>,
): SerializedContentDimensionItem {
  return {
    ...item,
    flags: {
      is_default: readBoolean(item.extra.is_default),
      home_visible: item.type === 'subject' ? readBoolean(item.extra.home_visible, true) : false,
    },
    relations: {
      version: resolveRelationItems('version', readRelationValues(item.extra, 'version'), lookups.version),
      subject: resolveRelationItems('subject', readRelationValues(item.extra, 'subject'), lookups.subject),
      grade: resolveRelationItems('grade', readRelationValues(item.extra, 'grade'), lookups.grade),
      term: resolveRelationItems('term', readRelationValues(item.extra, 'term'), lookups.term),
    },
    metrics: {
      course_count: courseCountMap.get(item.item_code) ?? 0,
    },
  };
}

function resolveRelationItems(
  _targetType: ContentDimensionType,
  values: string[],
  lookup: RelationLookup,
) {
  const resolved = new Map<string, RelationOption>();

  for (const value of values) {
    const matched = lookup.byCode.get(value) ?? lookup.byName.get(value);

    if (!matched) {
      resolved.set(`raw:${value}`, {
        id: `raw:${value}`,
        item_code: value,
        item_name: value,
        status: 'enabled',
      });
      continue;
    }

    resolved.set(matched.id, {
      id: matched.id,
      item_code: matched.item_code,
      item_name: matched.item_name,
      status: matched.status,
    });
  }

  return Array.from(resolved.values());
}

function mergeRelationItems(
  current: RelationOption[],
  incoming: RelationOption[],
) {
  const merged = new Map(current.map((item) => [item.id, item]));

  for (const item of incoming) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}

function toRelationOption(item: SerializedContentDimensionItem): RelationOption {
  return {
    id: item.id,
    item_code: item.item_code,
    item_name: item.item_name,
    status: item.status,
  };
}

async function buildNextDimensionExtra(
  connection: SqlExecutor,
  type: ContentDimensionType,
  currentExtra: Record<string, unknown>,
  input: ContentDimensionInput,
) {
  const nextExtra = { ...currentExtra };
  const versionCodes = normalizeCodeList(input.version_codes);
  const gradeCodes = normalizeCodeList(input.grade_codes);
  const subjectCodes = normalizeCodeList(input.subject_codes);

  if (versionCodes.length > 0) {
    await assertRelationCodesExist(connection, 'version', versionCodes);
  }

  if (gradeCodes.length > 0) {
    await assertRelationCodesExist(connection, 'grade', gradeCodes);
  }

  if (subjectCodes.length > 0) {
    await assertRelationCodesExist(connection, 'subject', subjectCodes);
  }

  clearRelationKeys(nextExtra, 'version');
  clearRelationKeys(nextExtra, 'grade');
  clearRelationKeys(nextExtra, 'subject');

  switch (type) {
    case 'version':
      nextExtra.is_default = Boolean(input.is_default);
      nextExtra.subject_codes = subjectCodes;
      nextExtra.grade_codes = gradeCodes;
      break;
    case 'subject':
      nextExtra.home_visible = input.home_visible === undefined ? true : Boolean(input.home_visible);
      nextExtra.version_codes = versionCodes;
      break;
    case 'grade':
      nextExtra.version_codes = versionCodes;
      break;
    case 'term':
      nextExtra.grade_codes = gradeCodes;
      break;
  }

  return nextExtra;
}

function clearRelationKeys(target: Record<string, unknown>, key: 'version' | 'grade' | 'subject' | 'term') {
  delete target[key];
  delete target[`${key}_codes`];
  delete target[`${key}_names`];
  delete target[`${key}_values`];
}

async function assertRelationCodesExist(
  connection: SqlExecutor,
  type: ContentDimensionType,
  codes: string[],
) {
  const rows = await queryRows<RowDataPacket & { item_code: string }>(
    connection,
    `
      SELECT i.item_code
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE t.type_code = :typeCode
    `,
    {
      typeCode: type,
    },
  );

  const existingCodes = new Set(rows.map((row) => row.item_code));
  const missing = codes.filter((code) => !existingCodes.has(code));

  if (missing.length > 0) {
    throw new AppError(422, 42200, `${CONTENT_DIMENSION_LABELS[type]}关联配置不存在：${missing.join('、')}`);
  }
}

async function syncDimensionRelations(
  connection: SqlExecutor,
  type: ContentDimensionType,
  sourceCode: string,
  nextExtra: Record<string, unknown>,
) {
  switch (type) {
    case 'version':
      await syncReverseMembership(connection, 'subject', 'version', sourceCode, readRelationValues(nextExtra, 'subject'));
      await syncReverseMembership(connection, 'grade', 'version', sourceCode, readRelationValues(nextExtra, 'grade'));
      break;
    case 'subject':
      await syncReverseMembership(connection, 'version', 'subject', sourceCode, readRelationValues(nextExtra, 'version'));
      break;
    case 'grade':
      await syncReverseMembership(connection, 'version', 'grade', sourceCode, readRelationValues(nextExtra, 'version'));
      break;
    case 'term':
      break;
  }
}

async function syncReverseMembership(
  connection: SqlExecutor,
  targetType: ContentDimensionType,
  reverseRelationKey: 'version' | 'subject' | 'grade',
  sourceCode: string,
  targetCodes: string[],
) {
  const rows = await queryRows<DictItemRow>(
    connection,
    `
      SELECT
        i.id,
        t.id AS type_id,
        t.type_code,
        t.type_name,
        t.status AS type_status,
        t.remark AS type_remark,
        i.item_code,
        i.item_name,
        i.parent_id,
        i.sort_order,
        i.status,
        i.extra_json,
        i.created_at,
        i.updated_at
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE t.type_code = :typeCode
    `,
    { typeCode: targetType },
  );

  const targetCodeSet = new Set(targetCodes);

  for (const row of rows) {
    const extra = parseJsonObject(row.extra_json);
    const currentCodes = readRelationValues(extra, reverseRelationKey);
    const hasCurrentCode = currentCodes.includes(sourceCode);
    const shouldInclude = targetCodeSet.has(row.item_code);

    if (hasCurrentCode === shouldInclude) {
      continue;
    }

    const nextCodes = shouldInclude
      ? Array.from(new Set([...currentCodes, sourceCode]))
      : currentCodes.filter((code) => code !== sourceCode);

    clearRelationKeys(extra, reverseRelationKey);
    extra[`${reverseRelationKey}_codes`] = nextCodes;

    await executeStatement(
      connection,
      `
        UPDATE dict_items
        SET extra_json = :extraJson
        WHERE id = :itemId
      `,
      {
        itemId: row.id,
        extraJson: JSON.stringify(extra),
      },
    );
  }
}

async function ensureDictionaryType(connection: SqlExecutor, type: ContentDimensionType) {
  const existing = await queryFirst<DictTypeRow>(
    connection,
    `
      SELECT
        id AS type_id,
        type_code,
        type_name,
        status AS type_status,
        remark AS type_remark
      FROM dict_types
      WHERE type_code = :typeCode
      LIMIT 1
    `,
    { typeCode: type },
  );

  if (existing) {
    if (existing.type_name !== CONTENT_DIMENSION_LABELS[type] || existing.type_status !== 'enabled') {
      await executeStatement(
        connection,
        `
          UPDATE dict_types
          SET
            type_name = :typeName,
            status = 'enabled'
          WHERE id = :typeId
        `,
        {
          typeId: existing.type_id,
          typeName: CONTENT_DIMENSION_LABELS[type],
        },
      );
    }

    return {
      ...existing,
      type_name: CONTENT_DIMENSION_LABELS[type],
      type_status: 'enabled',
    };
  }

  const result = await executeStatement(
    connection,
    `
      INSERT INTO dict_types (
        type_code,
        type_name,
        status,
        remark
      )
      VALUES (
        :typeCode,
        :typeName,
        'enabled',
        :remark
      )
    `,
    {
      typeCode: type,
      typeName: CONTENT_DIMENSION_LABELS[type],
      remark: `内容维度：${CONTENT_DIMENSION_LABELS[type]}`,
    },
  );

  return {
    type_id: String(result.insertId),
    type_code: type,
    type_name: CONTENT_DIMENSION_LABELS[type],
    type_status: 'enabled',
    type_remark: `内容维度：${CONTENT_DIMENSION_LABELS[type]}`,
  };
}

async function assertItemCodeUnique(
  connection: SqlExecutor,
  typeId: string,
  itemCode: string,
  excludeItemId?: string,
) {
  const row = await queryFirst<RowDataPacket & { id: string }>(
    connection,
    `
      SELECT id
      FROM dict_items
      WHERE type_id = :typeId
        AND item_code = :itemCode
        ${excludeItemId ? 'AND id <> :excludeItemId' : ''}
      LIMIT 1
    `,
    {
      typeId,
      itemCode: itemCode.trim(),
      excludeItemId,
    },
  );

  if (row) {
    throw new AppError(409, 40900, '当前维度编码已存在，请更换后重试');
  }
}

async function clearOtherDefaultVersions(connection: SqlExecutor, currentItemId: string) {
  const rows = await queryRows<DictItemRow>(
    connection,
    `
      SELECT
        i.id,
        t.id AS type_id,
        t.type_code,
        t.type_name,
        t.status AS type_status,
        t.remark AS type_remark,
        i.item_code,
        i.item_name,
        i.parent_id,
        i.sort_order,
        i.status,
        i.extra_json,
        i.created_at,
        i.updated_at
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE t.type_code = 'version'
        AND i.id <> :currentItemId
    `,
    { currentItemId },
  );

  for (const row of rows) {
    const extra = parseJsonObject(row.extra_json);

    if (!readBoolean(extra.is_default)) {
      continue;
    }

    extra.is_default = false;
    await executeStatement(
      connection,
      `
        UPDATE dict_items
        SET extra_json = :extraJson
        WHERE id = :itemId
      `,
      {
        itemId: row.id,
        extraJson: JSON.stringify(extra),
      },
    );
  }
}

async function assertDeleteAllowed(
  connection: SqlExecutor,
  current: DictItemRow,
  type: ContentDimensionType,
) {
  const usageCount = await readDimensionUsageCount(connection, type, current.item_code);

  if (usageCount > 0) {
    throw new AppError(409, 40900, '当前内容维度已被课程、用户或专题使用，无法删除');
  }

  const relationRows = await listContentDimensionRows(connection);
  const referenced = relationRows.some((row) => {
    if (row.id === current.id) {
      return false;
    }

    const extra = parseJsonObject(row.extra_json);
    const relationValues = [
      ...readRelationValues(extra, 'version'),
      ...readRelationValues(extra, 'subject'),
      ...readRelationValues(extra, 'grade'),
      ...readRelationValues(extra, 'term'),
    ];

    return relationValues.includes(current.item_code) || relationValues.includes(current.item_name);
  });

  if (referenced) {
    throw new AppError(409, 40900, '当前内容维度仍被其它维度关联，无法删除');
  }
}

async function readDimensionUsageCount(
  connection: SqlExecutor,
  type: ContentDimensionType,
  itemCode: string,
) {
  switch (type) {
    case 'version': {
      const [courseCount, profileCount] = await Promise.all([
        readCount(
          connection,
          `
            SELECT COUNT(*) AS total
            FROM courses
            WHERE deleted_at IS NULL
              AND version_code = :itemCode
          `,
          { itemCode },
        ),
        readCount(
          connection,
          `
            SELECT COUNT(*) AS total
            FROM user_profiles
            WHERE version_code = :itemCode
          `,
          { itemCode },
        ),
      ]);

      return courseCount + profileCount;
    }
    case 'subject': {
      const [courseCount, tagCount] = await Promise.all([
        readCount(
          connection,
          `
            SELECT COUNT(*) AS total
            FROM courses
            WHERE deleted_at IS NULL
              AND subject_code = :itemCode
          `,
          { itemCode },
        ),
        readCount(
          connection,
          `
            SELECT COUNT(*) AS total
            FROM topic_tags
            WHERE subject_code = :itemCode
          `,
          { itemCode },
        ),
      ]);

      return courseCount + tagCount;
    }
    case 'grade': {
      const [courseCount, profileCount] = await Promise.all([
        readCount(
          connection,
          `
            SELECT COUNT(*) AS total
            FROM courses
            WHERE deleted_at IS NULL
              AND grade_code = :itemCode
          `,
          { itemCode },
        ),
        readCount(
          connection,
          `
            SELECT COUNT(*) AS total
            FROM user_profiles
            WHERE grade_code = :itemCode
          `,
          { itemCode },
        ),
      ]);

      return courseCount + profileCount;
    }
    case 'term':
      return readCount(
        connection,
        `
          SELECT COUNT(*) AS total
          FROM courses
          WHERE deleted_at IS NULL
            AND term_code = :itemCode
        `,
        { itemCode },
      );
  }
}

async function getSerializedDictionaryItem(db: SqlExecutor, itemId: string) {
  return serializeDictionaryItem(await getDictionaryItemRowById(db, itemId));
}

async function getDictionaryItemRowById(db: SqlExecutor, itemId: string) {
  const row = await queryFirst<DictItemRow>(
    db,
    `
      SELECT
        i.id,
        t.id AS type_id,
        t.type_code,
        t.type_name,
        t.status AS type_status,
        t.remark AS type_remark,
        i.item_code,
        i.item_name,
        i.parent_id,
        i.sort_order,
        i.status,
        i.extra_json,
        i.created_at,
        i.updated_at
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE i.id = :itemId
      LIMIT 1
    `,
    { itemId },
  );

  if (!row) {
    throw new AppError(404, 40400, '内容维度不存在');
  }

  return row;
}

function serializeDictionaryItem(row: DictItemRow): SerializedDictItem {
  return {
    id: row.id,
    type_id: row.type_id,
    type: row.type_code,
    type_name: row.type_name,
    type_status: row.type_status,
    type_remark: row.type_remark,
    item_code: row.item_code,
    item_name: row.item_name,
    parent_id: row.parent_id,
    sort_order: row.sort_order,
    status: row.status,
    extra: parseJsonObject(row.extra_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateDimensionStatus(status?: string) {
  if (status && !['enabled', 'disabled'].includes(status)) {
    throw new AppError(400, 40001, '维度状态仅支持 enabled 或 disabled');
  }
}

function readRelationValues(extra: Record<string, unknown>, key: 'version' | 'grade' | 'subject' | 'term') {
  return Array.from(
    new Set([
      ...readStringList(extra[key]),
      ...readStringList(extra[`${key}_codes`]),
      ...readStringList(extra[`${key}_names`]),
      ...readStringList(extra[`${key}_values`]),
    ]),
  );
}

function normalizeCodeList(values?: string[]) {
  if (!values || values.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function parseJsonObject(value: string | Record<string, unknown> | null) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readStringList(value: unknown) {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

async function readCount(
  db: SqlExecutor,
  sql: string,
  params?: Record<string, unknown>,
) {
  const row = await queryFirst<CountRow>(db, sql, params);
  return normalizeCount(row?.total ?? 0);
}

function normalizeCount(value: string | number) {
  return typeof value === 'number' ? value : Number(value);
}
