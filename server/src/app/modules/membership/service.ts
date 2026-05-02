import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { executeStatement, queryFirst, withTransaction } from '../../../common/db/query.js';
import { AppError } from '../../../common/errors/app-error.js';
import { assertFound } from '../../../common/errors/app-error.js';
import { getMembershipSnapshot, type MembershipSnapshot } from '../../shared/user-service.js';

type SqlExecutor = Pool | PoolConnection;

type CodeRow = RowDataPacket & {
  code_id: string;
  batch_id: string;
  batch_no: string;
  batch_status: string;
  batch_expired_at: string | null;
  code: string;
  code_status: string;
  code_expired_at: string | null;
  used_by_user_id: string | null;
  package_id: string;
  package_name: string;
  duration_days: number | null;
  package_is_permanent: number;
};

type UserMembershipRow = RowDataPacket & {
  user_id: string;
  current_package_id: string | null;
  membership_status: string;
  started_at: string | null;
  expired_at: string | null;
  is_permanent: number;
};

type RedeemLogRow = RowDataPacket & {
  id: string;
  result_status: string;
  failure_reason: string | null;
  previous_expired_at: string | null;
  current_expired_at: string | null;
  package_name: string | null;
  is_permanent: number | null;
};

type RedeemTransactionResult =
  | {
      ok: true;
      data: {
        success: true;
        package_name: string | null;
        previous_expired_at: string | null;
        current_expired_at: string | null;
        is_permanent: boolean;
        repeated?: boolean;
      };
    }
  | {
      ok: false;
      error: {
        httpStatus: number;
        code: number;
        message: string;
      };
    };

export async function getCurrentMembership(db: Pool, userId: string) {
  const membership = await getMembershipSnapshot(db, userId);
  return serializeMembership(membership);
}

export async function redeemActivationCode(
  db: Pool,
  input: {
    userId: string;
    code: string;
    requestId?: string | null;
  },
) {
  const normalizedCode = input.code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new AppError(400, 40001, '请输入激活码');
  }

  if (input.requestId) {
    const existing = await getRedeemLogByRequestId(db, input.userId, input.requestId);
    if (existing) {
      return buildRedeemResponseFromLog(existing);
    }
  }

  try {
    const result = await withTransaction(db, async (connection) =>
      processRedeemInTransaction(connection, {
        userId: input.userId,
        code: normalizedCode,
        requestId: input.requestId ?? null,
      }),
    );

    if (!result.ok) {
      throw new AppError(result.error.httpStatus, result.error.code, result.error.message);
    }

    return result.data;
  } catch (error) {
    if (input.requestId && isDuplicateEntryError(error)) {
      const existing = await getRedeemLogByRequestId(db, input.userId, input.requestId);
      if (existing) {
        return buildRedeemResponseFromLog(existing);
      }
    }

    throw error;
  }
}

async function processRedeemInTransaction(
  connection: PoolConnection,
  input: {
    userId: string;
    code: string;
    requestId: string | null;
  },
): Promise<RedeemTransactionResult> {
  const codeRow = await queryFirst<CodeRow>(
    connection,
    `
      SELECT
        c.id AS code_id,
        c.batch_id,
        b.batch_no,
        b.status AS batch_status,
        b.expired_at AS batch_expired_at,
        c.code,
        c.status AS code_status,
        c.expired_at AS code_expired_at,
        c.used_by_user_id,
        p.id AS package_id,
        p.package_name,
        p.duration_days,
        p.is_permanent AS package_is_permanent
      FROM activation_codes c
      INNER JOIN activation_code_batches b ON b.id = c.batch_id
      INNER JOIN membership_packages p ON p.id = c.package_id
      WHERE c.code = :code
      LIMIT 1
      FOR UPDATE
    `,
    { code: input.code },
  );

  if (!codeRow) {
    await insertRedeemLog(connection, {
      userId: input.userId,
      codeId: null,
      batchId: null,
      codeSnapshot: input.code,
      packageId: null,
      resultStatus: 'failed',
      failureReason: '激活码不存在',
      previousExpiredAt: null,
      currentExpiredAt: null,
      requestId: input.requestId,
    });

    return {
      ok: false,
      error: {
        httpStatus: 404,
        code: 40400,
        message: '激活码不存在',
      },
    };
  }

  if (codeRow.batch_status !== 'enabled') {
    await insertRedeemLog(connection, {
      userId: input.userId,
      codeId: codeRow.code_id,
      batchId: codeRow.batch_id,
      codeSnapshot: input.code,
      packageId: codeRow.package_id,
      resultStatus: 'failed',
      failureReason: '激活码批次已停用',
      previousExpiredAt: null,
      currentExpiredAt: null,
      requestId: input.requestId,
    });

    return {
      ok: false,
      error: {
        httpStatus: 409,
        code: 40900,
        message: '激活码批次已停用',
      },
    };
  }

  const isExpired = isDateTimeExpired(codeRow.code_expired_at) || isDateTimeExpired(codeRow.batch_expired_at);
  if (isExpired) {
    await executeStatement(
      connection,
      `
        UPDATE activation_codes
        SET status = 'expired'
        WHERE id = :codeId
          AND status = 'unused'
      `,
      { codeId: codeRow.code_id },
    );

    await insertRedeemLog(connection, {
      userId: input.userId,
      codeId: codeRow.code_id,
      batchId: codeRow.batch_id,
      codeSnapshot: input.code,
      packageId: codeRow.package_id,
      resultStatus: 'failed',
      failureReason: '激活码已过期',
      previousExpiredAt: null,
      currentExpiredAt: null,
      requestId: input.requestId,
    });

    return {
      ok: false,
      error: {
        httpStatus: 409,
        code: 40900,
        message: '激活码已过期',
      },
    };
  }

  const currentMembership = await queryFirst<UserMembershipRow>(
    connection,
    `
      SELECT
        user_id,
        current_package_id,
        membership_status,
        started_at,
        expired_at,
        is_permanent
      FROM user_memberships
      WHERE user_id = :userId
      LIMIT 1
      FOR UPDATE
    `,
    { userId: input.userId },
  );

  if (codeRow.code_status === 'used') {
    if (codeRow.used_by_user_id === input.userId) {
      const currentSnapshot = await getMembershipSnapshot(connection, input.userId);
      await insertRedeemLog(connection, {
        userId: input.userId,
        codeId: codeRow.code_id,
        batchId: codeRow.batch_id,
        codeSnapshot: input.code,
        packageId: codeRow.package_id,
        resultStatus: 'repeated',
        failureReason: null,
        previousExpiredAt: currentMembership?.expired_at ?? null,
        currentExpiredAt: currentSnapshot.expired_at,
        requestId: input.requestId,
      });

      return {
        ok: true,
        data: {
          success: true,
          package_name: currentSnapshot.package_name,
          previous_expired_at: currentMembership?.expired_at ?? null,
          current_expired_at: currentSnapshot.expired_at,
          is_permanent: currentSnapshot.is_permanent,
          repeated: true,
        },
      };
    }

    await insertRedeemLog(connection, {
      userId: input.userId,
      codeId: codeRow.code_id,
      batchId: codeRow.batch_id,
      codeSnapshot: input.code,
      packageId: codeRow.package_id,
      resultStatus: 'failed',
      failureReason: '激活码已被使用',
      previousExpiredAt: currentMembership?.expired_at ?? null,
      currentExpiredAt: currentMembership?.expired_at ?? null,
      requestId: input.requestId,
    });

    return {
      ok: false,
      error: {
        httpStatus: 409,
        code: 40900,
        message: '激活码已被使用',
      },
    };
  }

  if (codeRow.code_status === 'invalid') {
    await insertRedeemLog(connection, {
      userId: input.userId,
      codeId: codeRow.code_id,
      batchId: codeRow.batch_id,
      codeSnapshot: input.code,
      packageId: codeRow.package_id,
      resultStatus: 'failed',
      failureReason: '激活码已作废',
      previousExpiredAt: currentMembership?.expired_at ?? null,
      currentExpiredAt: currentMembership?.expired_at ?? null,
      requestId: input.requestId,
    });

    return {
      ok: false,
      error: {
        httpStatus: 409,
        code: 40900,
        message: '激活码已作废',
      },
    };
  }

  const previousExpiredAt = currentMembership?.expired_at ?? null;
  const permanentAlreadyActive = Boolean(currentMembership?.is_permanent);
  const packageIsPermanent = Boolean(codeRow.package_is_permanent);
  const { membershipStatus, currentExpiredAt, isPermanent, deltaDays } = computeMembershipAfterRedeem({
    currentMembership,
    packageIsPermanent,
    durationDays: codeRow.duration_days,
  });

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
        'redeem',
        :sourceRefId
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
      userId: input.userId,
      packageId: codeRow.package_id,
      membershipStatus,
      expiredAt: currentExpiredAt,
      isPermanent: isPermanent ? 1 : 0,
      sourceRefId: codeRow.code_id,
    },
  );

  await executeStatement(
    connection,
    `
      UPDATE activation_codes
      SET
        status = 'used',
        used_by_user_id = :userId,
        used_at = NOW()
      WHERE id = :codeId
        AND status = 'unused'
    `,
    {
      codeId: codeRow.code_id,
      userId: input.userId,
    },
  );

  await executeStatement(
    connection,
    `
      UPDATE activation_code_batches
      SET
        used_count = used_count + 1
      WHERE id = :batchId
    `,
    { batchId: codeRow.batch_id },
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
        source_batch_id,
        source_code_id,
        remark
      )
      VALUES (
        :userId,
        :packageId,
        'redeem',
        :deltaDays,
        :oldExpiredAt,
        :newExpiredAt,
        :isPermanent,
        :batchId,
        :codeId,
        :remark
      )
    `,
    {
      userId: input.userId,
      packageId: codeRow.package_id,
      deltaDays: permanentAlreadyActive ? null : deltaDays,
      oldExpiredAt: previousExpiredAt,
      newExpiredAt: currentExpiredAt,
      isPermanent: isPermanent ? 1 : 0,
      batchId: codeRow.batch_id,
      codeId: codeRow.code_id,
      remark: `App redeem ${codeRow.batch_no}`,
    },
  );

  await insertRedeemLog(connection, {
    userId: input.userId,
    codeId: codeRow.code_id,
    batchId: codeRow.batch_id,
    codeSnapshot: input.code,
    packageId: codeRow.package_id,
    resultStatus: 'success',
    failureReason: null,
    previousExpiredAt,
    currentExpiredAt,
    requestId: input.requestId,
  });

  return {
    ok: true,
    data: {
      success: true,
      package_name: codeRow.package_name,
      previous_expired_at: previousExpiredAt,
      current_expired_at: currentExpiredAt,
      is_permanent: isPermanent,
    },
  };
}

async function insertRedeemLog(
  connection: PoolConnection,
  payload: {
    userId: string;
    codeId: string | null;
    batchId: string | null;
    codeSnapshot: string;
    packageId: string | null;
    resultStatus: 'success' | 'failed' | 'repeated';
    failureReason: string | null;
    previousExpiredAt: string | null;
    currentExpiredAt: string | null;
    requestId: string | null;
  },
) {
  await executeStatement(
    connection,
    `
      INSERT INTO activation_redeem_logs (
        user_id,
        code_id,
        batch_id,
        code_snapshot,
        package_id,
        result_status,
        failure_reason,
        previous_expired_at,
        current_expired_at,
        request_id,
        source_platform,
        operator_admin_id
      )
      VALUES (
        :userId,
        :codeId,
        :batchId,
        :codeSnapshot,
        :packageId,
        :resultStatus,
        :failureReason,
        :previousExpiredAt,
        :currentExpiredAt,
        :requestId,
        'app',
        NULL
      )
    `,
    payload,
  );
}

async function getRedeemLogByRequestId(db: SqlExecutor, userId: string, requestId: string) {
  return queryFirst<RedeemLogRow>(
    db,
    `
      SELECT
        l.id,
        l.result_status,
        l.failure_reason,
        l.previous_expired_at,
        l.current_expired_at,
        p.package_name,
        p.is_permanent
      FROM activation_redeem_logs l
      LEFT JOIN membership_packages p ON p.id = l.package_id
      WHERE l.user_id = :userId
        AND l.request_id = :requestId
      LIMIT 1
    `,
    {
      userId,
      requestId,
    },
  );
}

function buildRedeemResponseFromLog(log: RedeemLogRow) {
  if (log.result_status === 'failed') {
    throw new AppError(409, 40900, log.failure_reason ?? '激活码兑换失败');
  }

  return {
    success: true,
    package_name: log.package_name,
    previous_expired_at: log.previous_expired_at,
    current_expired_at: log.current_expired_at,
    is_permanent: Boolean(log.is_permanent),
    repeated: log.result_status === 'repeated',
  };
}

function computeMembershipAfterRedeem(input: {
  currentMembership: UserMembershipRow | null;
  packageIsPermanent: boolean;
  durationDays: number | null;
}) {
  if (input.currentMembership?.is_permanent || input.packageIsPermanent) {
    return {
      membershipStatus: 'permanent',
      currentExpiredAt: null,
      isPermanent: true,
      deltaDays: null,
    };
  }

  const durationDays = input.durationDays ?? 0;
  const baseDate =
    input.currentMembership?.expired_at && !isDateTimeExpired(input.currentMembership.expired_at)
      ? new Date(input.currentMembership.expired_at.replace(' ', 'T'))
      : new Date();

  baseDate.setDate(baseDate.getDate() + durationDays);

  return {
    membershipStatus: 'active',
    currentExpiredAt: formatDateTime(baseDate),
    isPermanent: false,
    deltaDays: durationDays,
  };
}

function serializeMembership(membership: MembershipSnapshot) {
  return {
    status: membership.status,
    package_name: membership.package_name,
    package_tone: membership.package_tone,
    started_at: membership.started_at,
    expired_at: membership.expired_at,
    is_permanent: membership.is_permanent,
  };
}

function isDateTimeExpired(value: string | null) {
  if (!value) {
    return false;
  }

  return new Date(value.replace(' ', 'T')).getTime() < Date.now();
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

function isDuplicateEntryError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
