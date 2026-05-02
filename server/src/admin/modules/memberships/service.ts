import type { Pool, RowDataPacket } from 'mysql2/promise';

import { buildSerial, generateUniqueCodes } from '../../../common/utils/code.js';
import { normalizePagination } from '../../../common/utils/pagination.js';
import { executeStatement, queryFirst, queryRows, withTransaction } from '../../../common/db/query.js';
import { AppError, assertFound } from '../../../common/errors/app-error.js';

type CountRow = RowDataPacket & {
  total: string | number;
};

type MembershipPackageRow = RowDataPacket & {
  id: string;
  package_code: string;
  package_name: string;
  package_type: string;
  package_tone: string;
  duration_days: number | null;
  is_permanent: number;
  rights_desc: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ActivationCodeBatchRow = RowDataPacket & {
  id: string;
  batch_no: string;
  package_id: string;
  package_name: string;
  quantity: number;
  used_count: number;
  expired_count: number;
  status: string;
  expired_at: string | null;
  source_channel: string | null;
  remark: string | null;
  created_admin_id: string | null;
  created_admin_name: string | null;
  created_at: string;
  updated_at: string;
};

type ActivationCodeRow = RowDataPacket & {
  id: string;
  batch_id: string;
  batch_no: string;
  code: string;
  package_id: string;
  package_name: string;
  status: string;
  expired_at: string | null;
  used_by_user_id: string | null;
  used_by_user_nickname: string | null;
  used_at: string | null;
  source_channel: string | null;
  invalid_reason: string | null;
  created_at: string;
  updated_at: string;
};

type ActivationRedeemLogRow = RowDataPacket & {
  id: string;
  user_id: string;
  user_nickname: string | null;
  phone: string | null;
  code_id: string | null;
  batch_id: string | null;
  batch_no: string | null;
  code_snapshot: string;
  package_id: string | null;
  package_name: string | null;
  result_status: string;
  failure_reason: string | null;
  previous_expired_at: string | null;
  current_expired_at: string | null;
  request_id: string | null;
  source_platform: string;
  operator_admin_id: string | null;
  operator_admin_name: string | null;
  created_at: string;
};

type UserMembershipRow = RowDataPacket & {
  id: string;
  user_id: string;
  current_package_id: string | null;
  membership_status: string;
  started_at: string | null;
  expired_at: string | null;
  is_permanent: number;
};

type UserRow = RowDataPacket & {
  id: string;
  nickname: string;
};

export async function listMembershipPackages(
  db: Pool,
  query: {
    keyword?: string;
    status?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['1 = 1'];

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push('(package_name LIKE :keyword OR package_code LIKE :keyword)');
  }

  if (query.status) {
    params.status = query.status;
    conditions.push('status = :status');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<MembershipPackageRow>(
      db,
      `
        SELECT
          id,
          package_code,
          package_name,
          package_type,
          package_tone,
          duration_days,
          is_permanent,
          rights_desc,
          status,
          sort_order,
          created_at,
          updated_at
        FROM membership_packages
        WHERE ${whereClause}
        ORDER BY sort_order DESC, id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(db, `SELECT COUNT(*) AS total FROM membership_packages WHERE ${whereClause}`, params),
  ]);

  return {
    list: list.map(serializeMembershipPackage),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function createMembershipPackage(
  db: Pool,
  input: {
    package_name: string;
    package_type: string;
    package_tone?: string | null;
    duration_days?: number | null;
    is_permanent?: boolean;
    rights_desc?: string | null;
    status?: string;
    sort_order?: number;
  },
) {
  const packageCode = buildSerial('PKG', 6);
  const isPermanent = Boolean(input.is_permanent || input.package_type === 'permanent');
  const durationDays = isPermanent ? null : input.duration_days ?? 0;
  const packageTone = resolvePackageTone(input.package_tone, input.package_type, isPermanent);

  const result = await executeStatement(
    db,
    `
      INSERT INTO membership_packages (
        package_code,
        package_name,
        package_type,
        package_tone,
        duration_days,
        is_permanent,
        rights_desc,
        status,
        sort_order
      )
      VALUES (
        :packageCode,
        :packageName,
        :packageType,
        :packageTone,
        :durationDays,
        :isPermanent,
        :rightsDesc,
        :status,
        :sortOrder
      )
    `,
    {
      packageCode,
      packageName: input.package_name,
      packageType: input.package_type,
      packageTone,
      durationDays,
      isPermanent: isPermanent ? 1 : 0,
      rightsDesc: input.rights_desc ?? null,
      status: input.status ?? 'enabled',
      sortOrder: input.sort_order ?? 0,
    },
  );

  return getMembershipPackageById(db, String(result.insertId));
}

export async function updateMembershipPackage(
  db: Pool,
  packageId: string,
  input: {
    package_name: string;
    package_type: string;
    package_tone?: string | null;
    duration_days?: number | null;
    is_permanent?: boolean;
    rights_desc?: string | null;
    status?: string;
    sort_order?: number;
  },
) {
  const current = await getMembershipPackageRowById(db, packageId);
  const isPermanent = Boolean(input.is_permanent || input.package_type === 'permanent');
  const durationDays = isPermanent ? null : input.duration_days ?? current.duration_days ?? 0;
  const packageTone = resolvePackageTone(input.package_tone, input.package_type, isPermanent, current.package_tone);

  await executeStatement(
    db,
    `
      UPDATE membership_packages
      SET
        package_name = :packageName,
        package_type = :packageType,
        package_tone = :packageTone,
        duration_days = :durationDays,
        is_permanent = :isPermanent,
        rights_desc = :rightsDesc,
        status = :status,
        sort_order = :sortOrder
      WHERE id = :packageId
    `,
    {
      packageId,
      packageName: input.package_name,
      packageType: input.package_type,
      packageTone,
      durationDays,
      isPermanent: isPermanent ? 1 : 0,
      rightsDesc: input.rights_desc ?? null,
      status: input.status ?? current.status,
      sortOrder: input.sort_order ?? current.sort_order,
    },
  );

  return getMembershipPackageById(db, packageId);
}

export async function listActivationCodeBatches(
  db: Pool,
  query: {
    keyword?: string;
    status?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['1 = 1'];

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push('(b.batch_no LIKE :keyword OR p.package_name LIKE :keyword)');
  }

  if (query.status) {
    params.status = query.status;
    conditions.push('b.status = :status');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<ActivationCodeBatchRow>(
      db,
      `
        SELECT
          b.id,
          b.batch_no,
          b.package_id,
          p.package_name,
          b.quantity,
          b.used_count,
          b.expired_count,
          b.status,
          b.expired_at,
          b.source_channel,
          b.remark,
          b.created_admin_id,
          a.real_name AS created_admin_name,
          b.created_at,
          b.updated_at
        FROM activation_code_batches b
        INNER JOIN membership_packages p ON p.id = b.package_id
        LEFT JOIN admins a ON a.id = b.created_admin_id
        WHERE ${whereClause}
        ORDER BY b.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM activation_code_batches b
        INNER JOIN membership_packages p ON p.id = b.package_id
        WHERE ${whereClause}
      `,
      params,
    ),
  ]);

  return {
    list: list.map(serializeActivationCodeBatch),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function createActivationCodeBatch(
  db: Pool,
  input: {
    package_id: string;
    quantity: number;
    expired_at?: string | null;
    source_channel?: string | null;
    remark?: string | null;
  },
  adminId: string,
) {
  if (input.quantity <= 0 || input.quantity > 1000) {
    throw new AppError(400, 40001, '激活码数量必须在 1 到 1000 之间');
  }

  const membershipPackage = await getMembershipPackageRowById(db, input.package_id);

  if (membershipPackage.status !== 'enabled') {
    throw new AppError(422, 42200, '仅可为启用中的会员套餐生成激活码');
  }

  const batchNo = buildSerial('B', 6);
  const codes = generateUniqueCodes(input.quantity, 12);

  await withTransaction(db, async (connection) => {
    const batchResult = await executeStatement(
      connection,
      `
        INSERT INTO activation_code_batches (
          batch_no,
          package_id,
          quantity,
          used_count,
          expired_count,
          status,
          expired_at,
          source_channel,
          remark,
          created_admin_id
        )
        VALUES (
          :batchNo,
          :packageId,
          :quantity,
          0,
          0,
          'enabled',
          :expiredAt,
          :sourceChannel,
          :remark,
          :adminId
        )
      `,
      {
        batchNo,
        packageId: input.package_id,
        quantity: input.quantity,
        expiredAt: input.expired_at ?? null,
        sourceChannel: input.source_channel ?? null,
        remark: input.remark ?? null,
        adminId,
      },
    );

    const batchId = String(batchResult.insertId);

    for (let start = 0; start < codes.length; start += 200) {
      const chunk = codes.slice(start, start + 200);
      const placeholders = chunk.map((_, index) => {
        const base = index * 5;
        return `(:batchId${base}, :code${base}, :packageId${base}, :expiredAt${base}, :sourceChannel${base})`;
      });
      const params: Record<string, unknown> = {};

      chunk.forEach((code, index) => {
        const base = index * 5;
        params[`batchId${base}`] = batchId;
        params[`code${base}`] = code;
        params[`packageId${base}`] = input.package_id;
        params[`expiredAt${base}`] = input.expired_at ?? null;
        params[`sourceChannel${base}`] = input.source_channel ?? null;
      });

      await executeStatement(
        connection,
        `
          INSERT INTO activation_codes (
            batch_id,
            code,
            package_id,
            expired_at,
            source_channel
          )
          VALUES ${placeholders.join(', ')}
        `,
        params,
      );
    }
  });

  return {
    batch_no: batchNo,
    generated_count: input.quantity,
  };
}

export async function listActivationCodes(
  db: Pool,
  query: {
    batch_no?: string;
    code?: string;
    status?: string;
    user_id?: string;
    expired_start?: string;
    expired_end?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['1 = 1'];

  if (query.batch_no) {
    params.batchNo = query.batch_no;
    conditions.push('b.batch_no = :batchNo');
  }

  if (query.code) {
    params.code = `%${query.code}%`;
    conditions.push('c.code LIKE :code');
  }

  if (query.status) {
    params.status = query.status;
    conditions.push('c.status = :status');
  }

  if (query.user_id) {
    params.userId = query.user_id;
    conditions.push('c.used_by_user_id = :userId');
  }

  if (query.expired_start) {
    params.expiredStart = query.expired_start;
    conditions.push('c.expired_at >= :expiredStart');
  }

  if (query.expired_end) {
    params.expiredEnd = query.expired_end;
    conditions.push('c.expired_at <= :expiredEnd');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<ActivationCodeRow>(
      db,
      `
        SELECT
          c.id,
          c.batch_id,
          b.batch_no,
          c.code,
          c.package_id,
          p.package_name,
          c.status,
          c.expired_at,
          c.used_by_user_id,
          u.nickname AS used_by_user_nickname,
          c.used_at,
          c.source_channel,
          c.invalid_reason,
          c.created_at,
          c.updated_at
        FROM activation_codes c
        INNER JOIN activation_code_batches b ON b.id = c.batch_id
        INNER JOIN membership_packages p ON p.id = c.package_id
        LEFT JOIN users u ON u.id = c.used_by_user_id
        WHERE ${whereClause}
        ORDER BY c.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM activation_codes c
        INNER JOIN activation_code_batches b ON b.id = c.batch_id
        WHERE ${whereClause}
      `,
      params,
    ),
  ]);

  return {
    list: list.map(serializeActivationCode),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function invalidateActivationCode(
  db: Pool,
  codeId: string,
  reason: string,
) {
  const code = assertFound(
    await queryFirst<ActivationCodeRow>(
      db,
      `
        SELECT
          c.id,
          c.batch_id,
          b.batch_no,
          c.code,
          c.package_id,
          p.package_name,
          c.status,
          c.expired_at,
          c.used_by_user_id,
          u.nickname AS used_by_user_nickname,
          c.used_at,
          c.source_channel,
          c.invalid_reason,
          c.created_at,
          c.updated_at
        FROM activation_codes c
        INNER JOIN activation_code_batches b ON b.id = c.batch_id
        INNER JOIN membership_packages p ON p.id = c.package_id
        LEFT JOIN users u ON u.id = c.used_by_user_id
        WHERE c.id = :codeId
        LIMIT 1
      `,
      { codeId },
    ),
    '激活码不存在',
  );

  if (code.status !== 'unused') {
    throw new AppError(409, 40900, '仅未使用激活码可作废');
  }

  await executeStatement(
    db,
    `
      UPDATE activation_codes
      SET
        status = 'invalid',
        invalid_reason = :reason
      WHERE id = :codeId
    `,
    {
      codeId,
      reason,
    },
  );

  return {
    success: true,
    code_id: codeId,
    reason,
  };
}

export async function exportActivationCodesByBatch(db: Pool, batchNo: string) {
  const rows = await queryRows<ActivationCodeRow>(
    db,
    `
      SELECT
        c.id,
        c.batch_id,
        b.batch_no,
        c.code,
        c.package_id,
        p.package_name,
        c.status,
        c.expired_at,
        c.used_by_user_id,
        u.nickname AS used_by_user_nickname,
        c.used_at,
        c.source_channel,
        c.invalid_reason,
        c.created_at,
        c.updated_at
      FROM activation_codes c
      INNER JOIN activation_code_batches b ON b.id = c.batch_id
      INNER JOIN membership_packages p ON p.id = c.package_id
      LEFT JOIN users u ON u.id = c.used_by_user_id
      WHERE b.batch_no = :batchNo
      ORDER BY c.id ASC
    `,
    { batchNo },
  );

  if (rows.length === 0) {
    throw new AppError(404, 40400, '批次不存在或无激活码数据');
  }

  const header = [
    'code_id',
    'batch_no',
    'code',
    'package_name',
    'status',
    'expired_at',
    'used_by_user_id',
    'used_by_user_nickname',
    'used_at',
    'source_channel',
    'invalid_reason',
  ];

  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.id,
        row.batch_no,
        row.code,
        row.package_name,
        row.status,
        row.expired_at ?? '',
        row.used_by_user_id ?? '',
        row.used_by_user_nickname ?? '',
        row.used_at ?? '',
        row.source_channel ?? '',
        row.invalid_reason ?? '',
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];

  return {
    filename: `activation-codes-${batchNo}.csv`,
    content: lines.join('\n'),
  };
}

export async function listActivationRedeemLogs(
  db: Pool,
  query: {
    result_status?: string;
    user_id?: string;
    batch_no?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['1 = 1'];

  if (query.result_status) {
    params.resultStatus = query.result_status;
    conditions.push('l.result_status = :resultStatus');
  }

  if (query.user_id) {
    params.userId = query.user_id;
    conditions.push('l.user_id = :userId');
  }

  if (query.batch_no) {
    params.batchNo = query.batch_no;
    conditions.push('b.batch_no = :batchNo');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<ActivationRedeemLogRow>(
      db,
      `
        SELECT
          l.id,
          l.user_id,
          u.nickname AS user_nickname,
          u.phone,
          l.code_id,
          l.batch_id,
          b.batch_no,
          l.code_snapshot,
          l.package_id,
          p.package_name,
          l.result_status,
          l.failure_reason,
          l.previous_expired_at,
          l.current_expired_at,
          l.request_id,
          l.source_platform,
          l.operator_admin_id,
          a.real_name AS operator_admin_name,
          l.created_at
        FROM activation_redeem_logs l
        LEFT JOIN users u ON u.id = l.user_id
        LEFT JOIN activation_code_batches b ON b.id = l.batch_id
        LEFT JOIN membership_packages p ON p.id = l.package_id
        LEFT JOIN admins a ON a.id = l.operator_admin_id
        WHERE ${whereClause}
        ORDER BY l.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(db, `SELECT COUNT(*) AS total FROM activation_redeem_logs l LEFT JOIN activation_code_batches b ON b.id = l.batch_id WHERE ${whereClause}`, params),
  ]);

  return {
    list: list.map(serializeActivationRedeemLog),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function compensateMembership(
  db: Pool,
  input: {
    user_id: string;
    days?: number | null;
    is_permanent?: boolean;
    reason: string;
    package_id?: string | null;
  },
  adminId: string,
) {
  const user = assertFound(
    await queryFirst<UserRow>(
      db,
      `
        SELECT id, nickname
        FROM users
        WHERE id = :userId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { userId: input.user_id },
    ),
    '用户不存在',
  );

  const membershipPackage = input.package_id
    ? await getMembershipPackageRowById(db, input.package_id)
    : null;

  const isPermanent = Boolean(input.is_permanent || membershipPackage?.is_permanent);
  const deltaDays = isPermanent ? null : Math.max(input.days ?? membershipPackage?.duration_days ?? 0, 0);

  if (!isPermanent && (!deltaDays || deltaDays <= 0)) {
    throw new AppError(400, 40001, '补偿天数必须大于 0');
  }

  return withTransaction(db, async (connection) => {
    const currentMembership = await queryFirst<UserMembershipRow>(
      connection,
      `
        SELECT
          id,
          user_id,
          current_package_id,
          membership_status,
          started_at,
          expired_at,
          is_permanent
        FROM user_memberships
        WHERE user_id = :userId
        LIMIT 1
      `,
      { userId: user.id },
    );

    const oldExpiredAt = currentMembership?.expired_at ?? null;
    let newExpiredAt: string | null = null;
    let membershipStatus = 'active';

    if (isPermanent) {
      membershipStatus = 'permanent';
      newExpiredAt = null;
    } else {
      const base = currentMembership?.expired_at && currentMembership.expired_at > nowDateTimeString()
        ? new Date(currentMembership.expired_at.replace(' ', 'T'))
        : new Date();
      base.setDate(base.getDate() + (deltaDays ?? 0));
      newExpiredAt = formatDateTime(base);
    }

    await executeStatement(
      connection,
      `
        INSERT INTO user_memberships (
          user_id,
          current_package_id,
          membership_status,
          started_at,
          expired_at,
          is_permanent,
          source_type,
          source_ref_id
        )
        VALUES (
          :userId,
          :packageId,
          :membershipStatus,
          NOW(),
          :expiredAt,
          :isPermanent,
          'manual',
          NULL
        )
        ON DUPLICATE KEY UPDATE
          current_package_id = VALUES(current_package_id),
          membership_status = VALUES(membership_status),
          expired_at = VALUES(expired_at),
          is_permanent = VALUES(is_permanent),
          source_type = VALUES(source_type),
          source_ref_id = VALUES(source_ref_id)
      `,
      {
        userId: user.id,
        packageId: membershipPackage?.id ?? currentMembership?.current_package_id ?? null,
        membershipStatus,
        expiredAt: newExpiredAt,
        isPermanent: isPermanent ? 1 : 0,
      },
    );

    await executeStatement(
      connection,
      `
        INSERT INTO membership_change_logs (
          user_id,
          package_id,
          change_type,
          delta_days,
          old_expired_at,
          new_expired_at,
          is_permanent,
          operator_admin_id,
          remark
        )
        VALUES (
          :userId,
          :packageId,
          'manual_compensation',
          :deltaDays,
          :oldExpiredAt,
          :newExpiredAt,
          :isPermanent,
          :adminId,
          :remark
        )
      `,
      {
        userId: user.id,
        packageId: membershipPackage?.id ?? currentMembership?.current_package_id ?? null,
        deltaDays,
        oldExpiredAt,
        newExpiredAt,
        isPermanent: isPermanent ? 1 : 0,
        adminId,
        remark: input.reason,
      },
    );

    return {
      success: true,
      user_id: user.id,
      nickname: user.nickname,
      previous_expired_at: oldExpiredAt,
      current_expired_at: newExpiredAt,
      is_permanent: isPermanent,
    };
  });
}

async function getMembershipPackageById(db: Pool, packageId: string) {
  const row = await getMembershipPackageRowById(db, packageId);
  return serializeMembershipPackage(row);
}

async function getMembershipPackageRowById(db: Pool, packageId: string) {
  return assertFound(
    await queryFirst<MembershipPackageRow>(
      db,
      `
        SELECT
          id,
          package_code,
          package_name,
          package_type,
          package_tone,
          duration_days,
          is_permanent,
          rights_desc,
          status,
          sort_order,
          created_at,
          updated_at
        FROM membership_packages
        WHERE id = :packageId
        LIMIT 1
      `,
      { packageId },
    ),
    '会员套餐不存在',
  );
}

function serializeMembershipPackage(row: MembershipPackageRow) {
  return {
    package_id: row.id,
    package_code: row.package_code,
    package_name: row.package_name,
    package_type: row.package_type,
    package_tone: row.package_tone,
    duration_days: row.duration_days,
    is_permanent: Boolean(row.is_permanent),
    rights_desc: row.rights_desc,
    status: row.status,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function resolvePackageTone(
  packageTone: string | null | undefined,
  packageType: string,
  isPermanent: boolean,
  fallbackTone?: string,
) {
  const normalizedTone = (packageTone ?? fallbackTone ?? '').trim().toLowerCase();

  if (normalizedTone && ['blue', 'green', 'gold', 'red', 'slate', 'violet'].includes(normalizedTone)) {
    return normalizedTone;
  }

  if (isPermanent || packageType === 'permanent') {
    return 'gold';
  }

  if (packageType === 'year_card') {
    return 'violet';
  }

  if (packageType === 'term_card') {
    return 'green';
  }

  return 'blue';
}

function serializeActivationCodeBatch(row: ActivationCodeBatchRow) {
  return {
    batch_id: row.id,
    batch_no: row.batch_no,
    package_id: row.package_id,
    package_name: row.package_name,
    quantity: row.quantity,
    used_count: row.used_count,
    expired_count: row.expired_count,
    unused_count: row.quantity - row.used_count - row.expired_count,
    status: row.status,
    expired_at: row.expired_at,
    source_channel: row.source_channel,
    remark: row.remark,
    created_admin_id: row.created_admin_id,
    created_admin_name: row.created_admin_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeActivationCode(row: ActivationCodeRow) {
  return {
    code_id: row.id,
    batch_id: row.batch_id,
    batch_no: row.batch_no,
    code: row.code,
    package_id: row.package_id,
    package_name: row.package_name,
    status: row.status,
    expired_at: row.expired_at,
    used_by_user_id: row.used_by_user_id,
    used_by_user_nickname: row.used_by_user_nickname,
    used_at: row.used_at,
    source_channel: row.source_channel,
    invalid_reason: row.invalid_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeActivationRedeemLog(row: ActivationRedeemLogRow) {
  return {
    log_id: row.id,
    user_id: row.user_id,
    user_nickname: row.user_nickname,
    phone: row.phone,
    code_id: row.code_id,
    batch_id: row.batch_id,
    batch_no: row.batch_no,
    code_snapshot: row.code_snapshot,
    package_id: row.package_id,
    package_name: row.package_name,
    result_status: row.result_status,
    failure_reason: row.failure_reason,
    previous_expired_at: row.previous_expired_at,
    current_expired_at: row.current_expired_at,
    request_id: row.request_id,
    source_platform: row.source_platform,
    operator_admin_id: row.operator_admin_id,
    operator_admin_name: row.operator_admin_name,
    created_at: row.created_at,
  };
}

async function readCount(
  db: Pool,
  sql: string,
  params?: Record<string, unknown>,
) {
  const row = await queryFirst<CountRow>(db, sql, params);
  const total = row?.total ?? 0;
  return typeof total === 'number' ? total : Number(total);
}

function csvEscape(value: string) {
  const normalized = value.replaceAll('"', '""');
  return `"${normalized}"`;
}

function nowDateTimeString() {
  return formatDateTime(new Date());
}

function formatDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
