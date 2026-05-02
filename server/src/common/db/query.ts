import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type SqlExecutor = Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>;
type SqlParams = Record<string, unknown> | readonly unknown[] | undefined;

export async function queryRows<T extends RowDataPacket>(
  executor: SqlExecutor,
  sql: string,
  params?: SqlParams,
): Promise<T[]> {
  const [rows] = await executor.execute<RowDataPacket[]>(sql, params as never);
  return rows as T[];
}

export async function queryFirst<T extends RowDataPacket>(
  executor: SqlExecutor,
  sql: string,
  params?: SqlParams,
): Promise<T | null> {
  const rows = await queryRows<T>(executor, sql, params);
  return rows[0] ?? null;
}

export async function executeStatement(
  executor: SqlExecutor,
  sql: string,
  params?: SqlParams,
): Promise<ResultSetHeader> {
  const [result] = await executor.execute<ResultSetHeader>(sql, params as never);
  return result;
}

export async function withTransaction<T>(
  pool: Pool,
  handler: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
