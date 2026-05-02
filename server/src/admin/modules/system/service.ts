import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { queryFirst, queryRows, executeStatement, withTransaction } from '../../../common/db/query.js';
import { AppError } from '../../../common/errors/app-error.js';
import {
  maskStorageConfig,
  readStorageConfig,
  resolveStorageConfigInput,
  testStorageConnection,
  writeStorageConfig,
} from '../../../common/storage/service.js';

const SETTING_CATEGORIES = ['basic', 'display', 'upload'] as const;
const STORAGE_PROVIDERS = ['local', 's3', 'tencent_cos', 'ftp'] as const;
const DICTIONARY_SCOPES = ['all', 'general'] as const;
const CORE_DICTIONARY_TYPES = ['version', 'subject', 'grade', 'term'] as const;

type SettingCategory = (typeof SETTING_CATEGORIES)[number];
type StorageProvider = (typeof STORAGE_PROVIDERS)[number];
type DictionaryScope = (typeof DICTIONARY_SCOPES)[number];
type SqlExecutor = Pool | PoolConnection;

type CountRow = RowDataPacket & {
  total: string | number;
};

type SettingRow = RowDataPacket & {
  id: string;
  setting_key: string;
  setting_name: string;
  value_type: string;
  setting_value: string | null;
  is_encrypted: number;
  updated_at: string;
};

type StorageConfigRow = RowDataPacket & {
  id: string;
  provider: StorageProvider;
  is_enabled: number;
  is_default: number;
  config_json: string | Record<string, unknown> | null;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  updated_at: string;
};

type DictTypeRow = RowDataPacket & {
  type_id: string;
  type_code: string;
  type_name: string;
  type_status: string;
  type_remark: string | null;
};

type DictTypeData = {
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

type SystemNotificationRow = RowDataPacket & {
  notification_id: string;
  title: string;
  content: string;
  tone: 'info' | 'warning' | 'success' | 'vip';
  status: 'draft' | 'published' | 'disabled';
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getDashboardOverview(db: Pool) {
  const [userTotal, activeUserToday, courseTotal, publishedCourseTotal, vipActiveTotal, redeemTodayTotal] =
    await Promise.all([
      readCount(db, `SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`),
      readCount(
        db,
        `
          SELECT COUNT(*) AS total
          FROM users
          WHERE deleted_at IS NULL
            AND DATE(COALESCE(last_login_at, created_at)) = CURRENT_DATE()
        `,
      ),
      readCount(db, `SELECT COUNT(*) AS total FROM courses WHERE deleted_at IS NULL`),
      readCount(
        db,
        `
          SELECT COUNT(*) AS total
          FROM courses
          WHERE deleted_at IS NULL
            AND status = 'published'
        `,
      ),
      readCount(
        db,
        `
          SELECT COUNT(*) AS total
          FROM user_memberships
          WHERE membership_status IN ('active', 'permanent')
        `,
      ),
      readCount(
        db,
        `
          SELECT COUNT(*) AS total
          FROM activation_redeem_logs
          WHERE result_status = 'success'
            AND DATE(created_at) = CURRENT_DATE()
        `,
      ),
    ]);

  return {
    user_total: userTotal,
    active_user_today: activeUserToday,
    course_total: courseTotal,
    published_course_total: publishedCourseTotal,
    vip_active_total: vipActiveTotal,
    redeem_today_total: redeemTodayTotal,
  };
}

export async function getDashboardTodos(db: Pool) {
  const [draftCourses, expiringCodeBatches, disabledStorageProviders] = await Promise.all([
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM courses
        WHERE deleted_at IS NULL
          AND status = 'draft'
      `,
    ),
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM activation_code_batches
        WHERE status = 'enabled'
          AND expired_at IS NOT NULL
          AND expired_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
      `,
    ),
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM storage_configs
        WHERE is_enabled = 0
      `,
    ),
  ]);

  return [
    {
      code: 'draft_courses',
      title: '待发布课程',
      count: draftCourses,
    },
    {
      code: 'expiring_code_batches',
      title: '7天内到期激活码批次',
      count: expiringCodeBatches,
    },
    {
      code: 'disabled_storage_providers',
      title: '未启用存储通道',
      count: disabledStorageProviders,
    },
  ];
}

export async function getSettingsByCategory(db: Pool, category: SettingCategory) {
  const rows = await queryRows<SettingRow>(
    db,
    `
      SELECT id, setting_key, setting_name, value_type, setting_value, is_encrypted, updated_at
      FROM system_settings
      WHERE category = :category
      ORDER BY sort_order DESC, id ASC
    `,
    { category },
  );

  const settings: Record<string, unknown> = {};

  for (const row of rows) {
    settings[row.setting_key] = deserializeSettingValue(row.value_type, row.setting_value);
  }

  return {
    settings,
    items: rows.map((row) => ({
      id: row.id,
      key: row.setting_key,
      name: row.setting_name,
      value_type: row.value_type,
      value: deserializeSettingValue(row.value_type, row.setting_value),
      is_encrypted: Boolean(row.is_encrypted),
      updated_at: row.updated_at,
    })),
  };
}

export async function listSystemNotifications(db: Pool) {
  const rows = await queryRows<SystemNotificationRow>(
    db,
    `
      SELECT
        id AS notification_id,
        title,
        content,
        tone,
        status,
        published_at,
        created_at,
        updated_at
      FROM system_notifications
      ORDER BY
        CASE status
          WHEN 'published' THEN 3
          WHEN 'draft' THEN 2
          ELSE 1
        END DESC,
        COALESCE(published_at, updated_at, created_at) DESC,
        id DESC
    `,
  );

  return rows.map((row) => ({
    notification_id: row.notification_id,
    title: row.title,
    content: row.content,
    tone: row.tone,
    status: row.status,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function createSystemNotification(
  db: Pool,
  input: {
    title: string;
    content: string;
    tone: 'info' | 'warning' | 'success' | 'vip';
    status: 'draft' | 'published' | 'disabled';
  },
  adminId: string,
) {
  await executeStatement(
    db,
    `
      INSERT INTO system_notifications (
        title,
        content,
        tone,
        status,
        published_at,
        created_by_admin_id,
        updated_by_admin_id
      )
      VALUES (
        :title,
        :content,
        :tone,
        :status,
        ${input.status === 'published' ? 'NOW()' : 'NULL'},
        :adminId,
        :adminId
      )
    `,
    {
      title: input.title.trim(),
      content: input.content.trim(),
      tone: input.tone,
      status: input.status,
      adminId,
    },
  );

  return listSystemNotifications(db);
}

export async function updateSystemNotification(
  db: Pool,
  notificationId: string,
  input: {
    title: string;
    content: string;
    tone: 'info' | 'warning' | 'success' | 'vip';
    status: 'draft' | 'published' | 'disabled';
  },
  adminId: string,
) {
  const current = await queryFirst<SystemNotificationRow>(
    db,
    `
      SELECT
        id AS notification_id,
        title,
        content,
        tone,
        status,
        published_at,
        created_at,
        updated_at
      FROM system_notifications
      WHERE id = :notificationId
      LIMIT 1
    `,
    { notificationId },
  );

  if (!current) {
    throw new AppError(404, 40400, '通知不存在');
  }

  const publishedAtSql =
    input.status === 'published'
      ? current.status === 'published' && current.published_at
        ? 'published_at'
        : 'NOW()'
      : 'published_at';

  await executeStatement(
    db,
    `
      UPDATE system_notifications
      SET
        title = :title,
        content = :content,
        tone = :tone,
        status = :status,
        published_at = ${publishedAtSql},
        updated_by_admin_id = :adminId
      WHERE id = :notificationId
    `,
    {
      notificationId,
      title: input.title.trim(),
      content: input.content.trim(),
      tone: input.tone,
      status: input.status,
      adminId,
    },
  );

  return listSystemNotifications(db);
}

export async function updateSettingsByCategory(
  db: Pool,
  category: SettingCategory,
  settings: Record<string, unknown>,
  adminId: string,
) {
  const entries = Object.entries(settings);

  if (entries.length === 0) {
    return getSettingsByCategory(db, category);
  }

  await withTransaction(db, async (connection) => {
    for (const [settingKey, rawValue] of entries) {
      const serialized = serializeSettingValue(rawValue);

      await executeStatement(
        connection,
        `
          INSERT INTO system_settings (
            category,
            setting_key,
            setting_name,
            value_type,
            setting_value,
            is_encrypted,
            sort_order,
            updated_by_admin_id
          )
          VALUES (
            :category,
            :settingKey,
            :settingName,
            :valueType,
            :settingValue,
            0,
            0,
            :adminId
          )
          ON DUPLICATE KEY UPDATE
            setting_name = VALUES(setting_name),
            value_type = VALUES(value_type),
            setting_value = VALUES(setting_value),
            updated_by_admin_id = VALUES(updated_by_admin_id)
        `,
        {
          category,
          settingKey,
          settingName: settingKey,
          valueType: serialized.valueType,
          settingValue: serialized.settingValue,
          adminId,
        },
      );
    }
  });

  return getSettingsByCategory(db, category);
}

export async function getStorageSettings(db: Pool) {
  const rows = await queryRows<StorageConfigRow>(
    db,
    `
      SELECT
        id,
        provider,
        is_enabled,
        is_default,
        config_json,
        last_test_at,
        last_test_status,
        last_test_message,
        updated_at
      FROM storage_configs
      ORDER BY id ASC
    `,
  );

  const rowMap = new Map(rows.map((row) => [row.provider, row]));
  let defaultProvider: StorageProvider = 'local';
  const providers: Record<StorageProvider, Record<string, unknown>> = {
    local: emptyProviderConfig('local'),
    s3: emptyProviderConfig('s3'),
    tencent_cos: emptyProviderConfig('tencent_cos'),
    ftp: emptyProviderConfig('ftp'),
  };

  for (const provider of STORAGE_PROVIDERS) {
    const row = rowMap.get(provider);

    if (!row) {
      continue;
    }

    if (Boolean(row.is_default)) {
      defaultProvider = provider;
    }

    providers[provider] = {
      provider,
      is_enabled: Boolean(row.is_enabled),
      is_default: Boolean(row.is_default),
      config: maskStorageConfig(provider, readStorageConfig(provider, row.config_json)),
      last_test_at: row.last_test_at,
      last_test_status: row.last_test_status,
      last_test_message: row.last_test_message,
      updated_at: row.updated_at,
    };
  }

  return {
    default_provider: defaultProvider,
    providers,
  };
}

export async function updateStorageSettings(
  db: Pool,
  input: {
    default_provider?: StorageProvider;
    providers: Partial<Record<StorageProvider, { is_enabled?: boolean; config?: Record<string, unknown> }>>;
  },
  adminId: string,
) {
  if (!input.default_provider && Object.keys(input.providers).length === 0) {
    return getStorageSettings(db);
  }

  await withTransaction(db, async (connection) => {
    if (input.default_provider) {
      await executeStatement(connection, `UPDATE storage_configs SET is_default = 0`);
    }

    for (const provider of STORAGE_PROVIDERS) {
      const item = input.providers[provider];

      if (!item && input.default_provider !== provider) {
        continue;
      }

      const current = await queryFirst<StorageConfigRow>(
        connection,
        `
          SELECT
            id,
            provider,
            is_enabled,
            is_default,
            config_json,
            last_test_at,
            last_test_status,
            last_test_message,
            updated_at
          FROM storage_configs
          WHERE provider = :provider
          LIMIT 1
        `,
        { provider },
      );

      const currentConfig = readStorageConfig(provider, current?.config_json ?? null);
      const mergedConfig = item?.config
        ? resolveStorageConfigInput(provider, item.config, currentConfig)
        : currentConfig;
      const isEnabled = item?.is_enabled ?? Boolean(current?.is_enabled);

      await executeStatement(
        connection,
        `
          INSERT INTO storage_configs (
            provider,
            is_enabled,
            is_default,
            config_json,
            updated_by_admin_id
          )
          VALUES (
            :provider,
            :isEnabled,
            :isDefault,
            :configJson,
            :adminId
          )
          ON DUPLICATE KEY UPDATE
            is_enabled = VALUES(is_enabled),
            is_default = VALUES(is_default),
            config_json = VALUES(config_json),
            updated_by_admin_id = VALUES(updated_by_admin_id)
        `,
        {
          provider,
          isEnabled: isEnabled ? 1 : 0,
          isDefault: input.default_provider === provider ? 1 : 0,
          configJson: JSON.stringify(writeStorageConfig(provider, mergedConfig)),
          adminId,
        },
      );
    }
  });

  return getStorageSettings(db);
}

export async function testStorageConfig(
  db: Pool,
  input: {
    provider: StorageProvider;
    config?: Record<string, unknown>;
  },
  adminId: string,
) {
  const current = await queryFirst<StorageConfigRow>(
    db,
    `
      SELECT
        id,
        provider,
        is_enabled,
        is_default,
        config_json,
        last_test_at,
        last_test_status,
        last_test_message,
        updated_at
      FROM storage_configs
      WHERE provider = :provider
      LIMIT 1
    `,
    { provider: input.provider },
  );

  const currentConfig = readStorageConfig(input.provider, current?.config_json ?? null);
  const config = input.config
    ? resolveStorageConfigInput(input.provider, input.config, currentConfig)
    : currentConfig;
  const testResult = await testStorageConnection(input.provider, config);

  await executeStatement(
    db,
    `
      INSERT INTO storage_configs (
        provider,
        is_enabled,
        is_default,
        config_json,
        last_test_at,
        last_test_status,
        last_test_message,
        updated_by_admin_id
      )
      VALUES (
        :provider,
        0,
        0,
        :configJson,
        NOW(),
        :testStatus,
        :testMessage,
        :adminId
      )
      ON DUPLICATE KEY UPDATE
        config_json = VALUES(config_json),
        last_test_at = VALUES(last_test_at),
        last_test_status = VALUES(last_test_status),
        last_test_message = VALUES(last_test_message),
        updated_by_admin_id = VALUES(updated_by_admin_id)
    `,
    {
      provider: input.provider,
      configJson: JSON.stringify(writeStorageConfig(input.provider, config)),
      testStatus: testResult.success ? 'success' : 'failed',
      testMessage: testResult.message,
      adminId,
    },
  );

  return {
    success: testResult.success,
    message: testResult.message,
    provider: input.provider,
  };
}

export async function listDictionaries(
  db: Pool,
  query: {
    type?: string;
    status?: string;
    scope?: DictionaryScope;
  },
) {
  const params: Record<string, unknown> = {};
  const conditions = ['1 = 1'];

  if (query.scope === 'general') {
    conditions.push(`t.type_code NOT IN ('version', 'subject', 'grade', 'term')`);
  }

  if (query.type) {
    params.typeCode = query.type;
    conditions.push('t.type_code = :typeCode');
  }

  if (query.status) {
    params.itemStatus = query.status;
    conditions.push('i.status = :itemStatus');
  }

  const rows = await queryRows<DictItemRow>(
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
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.type_code ASC, i.sort_order DESC, i.id ASC
    `,
    params,
  );

  return rows.map(serializeDictionaryItem);
}

export async function createDictionaryItem(
  db: Pool,
  input: {
    type: string;
    type_name?: string;
    type_status?: string;
    type_remark?: string | null;
    item_code: string;
    item_name: string;
    parent_id?: string | null;
    sort_order?: number;
    status?: string;
    extra?: Record<string, unknown> | null;
  },
) {
  validateDictionaryStatus(input.status);
  validateDictionaryStatus(input.type_status);
  assertGeneralDictionaryType(input.type);

  return withTransaction(db, async (connection) => {
    const type = await ensureDictionaryType(connection, {
      typeCode: input.type,
      typeName: input.type_name,
      typeStatus: input.type_status,
      typeRemark: input.type_remark,
    });

    await assertParentItem(connection, type.type_id, input.parent_id ?? null);

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
          :parentId,
          :sortOrder,
          :status,
          :extraJson
        )
      `,
      {
        typeId: type.type_id,
        itemCode: input.item_code,
        itemName: input.item_name,
        parentId: input.parent_id ?? null,
        sortOrder: input.sort_order ?? 0,
        status: input.status ?? 'enabled',
        extraJson: input.extra ? JSON.stringify(input.extra) : null,
      },
    );

    return getDictionaryItemById(connection, String(result.insertId));
  });
}

export async function updateDictionaryItem(
  db: Pool,
  itemId: string,
  input: {
    type?: string;
    type_name?: string;
    type_status?: string;
    type_remark?: string | null;
    item_code: string;
    item_name: string;
    parent_id?: string | null;
    sort_order?: number;
    status?: string;
    extra?: Record<string, unknown> | null;
  },
) {
  validateDictionaryStatus(input.status);
  validateDictionaryStatus(input.type_status);

  return withTransaction(db, async (connection) => {
    const current = await getDictionaryItemRowById(connection, itemId);
    assertGeneralDictionaryType(current.type_code, '当前字典项属于内容维度，请前往“内容维度”页面维护');

    if (input.type) {
      assertGeneralDictionaryType(input.type);
    }

    const type = input.type
      ? await ensureDictionaryType(connection, {
          typeCode: input.type,
          typeName: input.type_name,
          typeStatus: input.type_status,
          typeRemark: input.type_remark,
        })
      : {
          type_id: current.type_id,
          type_code: current.type_code,
          type_name: current.type_name,
          type_status: current.type_status,
          type_remark: current.type_remark,
        };
    const nextParentId =
      input.parent_id !== undefined ? input.parent_id ?? null : type.type_id === current.type_id ? current.parent_id : null;
    const nextExtra = input.extra === undefined ? parseJsonObject(current.extra_json) : input.extra;

    if (input.parent_id && input.parent_id === itemId) {
      throw new AppError(422, 42200, '字典项不能将自己设为父级');
    }

    await assertParentItem(connection, type.type_id, nextParentId);

    await executeStatement(
      connection,
      `
        UPDATE dict_items
        SET
          type_id = :typeId,
          item_code = :itemCode,
          item_name = :itemName,
          parent_id = :parentId,
          sort_order = :sortOrder,
          status = :status,
          extra_json = :extraJson
        WHERE id = :itemId
      `,
      {
        itemId,
        typeId: type.type_id,
        itemCode: input.item_code,
        itemName: input.item_name,
        parentId: nextParentId,
        sortOrder: input.sort_order ?? current.sort_order,
        status: input.status ?? current.status,
        extraJson: nextExtra === null ? null : JSON.stringify(nextExtra),
      },
    );

    return getDictionaryItemById(connection, itemId);
  });
}

export async function deleteDictionaryItem(db: Pool, itemId: string) {
  return withTransaction(db, async (connection) => {
    const current = await getDictionaryItemRowById(connection, itemId);
    assertGeneralDictionaryType(current.type_code, '当前字典项属于内容维度，请前往“内容维度”页面删除');

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
      throw new AppError(409, 40900, '当前字典项存在子级，无法删除');
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
      await executeStatement(connection, `DELETE FROM dict_types WHERE id = :typeId`, {
        typeId: current.type_id,
      });
    }

    return {
      success: true,
      id: itemId,
    };
  });
}

export function ensureSettingCategory(value: string): SettingCategory {
  if ((SETTING_CATEGORIES as readonly string[]).includes(value)) {
    return value as SettingCategory;
  }

  throw new AppError(400, 40001, '不支持的系统设置分类');
}

export function ensureStorageProvider(value: string): StorageProvider {
  if ((STORAGE_PROVIDERS as readonly string[]).includes(value)) {
    return value as StorageProvider;
  }

  throw new AppError(400, 40001, '不支持的存储类型');
}

function validateDictionaryStatus(status?: string) {
  if (status && !['enabled', 'disabled'].includes(status)) {
    throw new AppError(400, 40001, '字典状态仅支持 enabled 或 disabled');
  }
}

function assertGeneralDictionaryType(typeCode: string, message = '教材版本、学科、年级、学期属于内容维度，请前往“内容维度”页面维护') {
  if (CORE_DICTIONARY_TYPES.includes(typeCode.trim().toLowerCase() as (typeof CORE_DICTIONARY_TYPES)[number])) {
    throw new AppError(422, 42200, message);
  }
}

function serializeSettingValue(value: unknown) {
  if (typeof value === 'boolean') {
    return {
      valueType: 'bool',
      settingValue: value ? 'true' : 'false',
    };
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return {
      valueType: 'int',
      settingValue: String(value),
    };
  }

  if (typeof value === 'string') {
    return {
      valueType: 'string',
      settingValue: value,
    };
  }

  return {
    valueType: 'json',
    settingValue: JSON.stringify(value ?? null),
  };
}

function deserializeSettingValue(valueType: string, settingValue: string | null) {
  if (settingValue == null) {
    return null;
  }

  switch (valueType) {
    case 'bool':
      return settingValue === 'true';
    case 'int':
      return Number(settingValue);
    case 'json':
      return parseJsonObject(settingValue);
    default:
      return settingValue;
  }
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

function emptyProviderConfig(provider: StorageProvider) {
  return {
    provider,
    is_enabled: false,
    is_default: false,
    config: {},
    last_test_at: null,
    last_test_status: null,
    last_test_message: null,
    updated_at: null,
  };
}

async function readCount(
  db: SqlExecutor,
  sql: string,
  params?: Record<string, unknown>,
) {
  const row = await queryFirst<CountRow>(db, sql, params);
  const total = row?.total ?? 0;
  return typeof total === 'number' ? total : Number(total);
}

async function ensureDictionaryType(
  connection: SqlExecutor,
  input: {
    typeCode: string;
    typeName?: string;
    typeStatus?: string;
    typeRemark?: string | null;
  },
): Promise<DictTypeData> {
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
    { typeCode: input.typeCode },
  );

  if (existing) {
    if (input.typeName || input.typeStatus || input.typeRemark !== undefined) {
      await executeStatement(
        connection,
        `
          UPDATE dict_types
          SET
            type_name = :typeName,
            status = :typeStatus,
            remark = :typeRemark
          WHERE id = :typeId
        `,
        {
          typeId: existing.type_id,
          typeName: input.typeName ?? existing.type_name,
          typeStatus: input.typeStatus ?? existing.type_status,
          typeRemark: input.typeRemark ?? existing.type_remark,
        },
      );

      return {
        ...existing,
        type_name: input.typeName ?? existing.type_name,
        type_status: input.typeStatus ?? existing.type_status,
        type_remark: input.typeRemark ?? existing.type_remark,
      };
    }

    return existing;
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
        :typeStatus,
        :typeRemark
      )
    `,
    {
      typeCode: input.typeCode,
      typeName: input.typeName ?? input.typeCode,
      typeStatus: input.typeStatus ?? 'enabled',
      typeRemark: input.typeRemark ?? null,
    },
  );

  return {
    type_id: String(result.insertId),
    type_code: input.typeCode,
    type_name: input.typeName ?? input.typeCode,
    type_status: input.typeStatus ?? 'enabled',
    type_remark: input.typeRemark ?? null,
  };
}

async function getDictionaryItemById(db: SqlExecutor, itemId: string) {
  const row = await getDictionaryItemRowById(db, itemId);
  return serializeDictionaryItem(row);
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
    throw new AppError(404, 40400, '字典项不存在');
  }

  return row;
}

async function assertParentItem(db: SqlExecutor, typeId: string, parentId: string | null) {
  if (!parentId) {
    return;
  }

  const parent = await queryFirst<RowDataPacket & { id: string }>(
    db,
    `
      SELECT id
      FROM dict_items
      WHERE id = :parentId
        AND type_id = :typeId
      LIMIT 1
    `,
    {
      parentId,
      typeId,
    },
  );

  if (!parent) {
    throw new AppError(422, 42200, '父级字典项不存在或类型不匹配');
  }
}

function serializeDictionaryItem(row: DictItemRow) {
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
