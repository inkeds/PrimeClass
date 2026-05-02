import mysql, { type Pool } from 'mysql2/promise';

import { env } from '../config/env.js';

let pool: Pool | undefined;

export function getMySqlPool(): Pool {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    connectionLimit: env.MYSQL_CONNECTION_LIMIT,
    waitForConnections: true,
    queueLimit: 0,
    decimalNumbers: true,
    namedPlaceholders: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
  });

  return pool;
}

export async function verifyMySqlConnection(): Promise<void> {
  const connection = await getMySqlPool().getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
