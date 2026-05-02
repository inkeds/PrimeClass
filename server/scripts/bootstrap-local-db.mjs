import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';

import mysql from 'mysql2/promise';

const host = process.env.MYSQL_HOST ?? '127.0.0.1';
const port = Number(process.env.MYSQL_PORT ?? 3306);
const user = process.env.MYSQL_USER ?? 'root';
const password = process.env.MYSQL_PASSWORD ?? '';
const database = process.env.MYSQL_DATABASE ?? 'primeclass';
const adminUsername = 'admin';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? generatePassword();
const appAccount = 'student_demo';
const appPassword = process.env.SEED_APP_PASSWORD ?? generatePassword();

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  multipleStatements: true,
  connectTimeout: 5000,
});

try {
  const schemaPath = new URL('../../docs/schema.mysql.sql', import.meta.url);
  const seedPath = new URL('../sql/seed.mysql.sql', import.meta.url);
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const seedSql = await fs.readFile(seedPath, 'utf8');

  const normalizedSchema = normalizeSchemaSql(schemaSql, database);
  const normalizedSeed = normalizeSeedSql(seedSql, {
    database,
    adminPasswordHash: hashPassword(adminPassword),
    appPasswordHash: hashPassword(appPassword),
  });

  await connection.query(normalizedSchema);
  await connection.query(normalizedSeed);

  const [tables] = await connection.query(`SHOW TABLES FROM \`${database}\``);
  const [adminRows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${database}\`.\`admins\``);
  const [userRows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${database}\`.\`users\``);

  console.log(
    JSON.stringify(
      {
        database,
        table_count: tables.length,
        admins: adminRows[0]?.total ?? 0,
        users: userRows[0]?.total ?? 0,
        seeded_accounts: {
          admin: {
            username: adminUsername,
            password: adminPassword,
            generated: !process.env.SEED_ADMIN_PASSWORD,
          },
          app: {
            account: appAccount,
            password: appPassword,
            generated: !process.env.SEED_APP_PASSWORD,
          },
        },
      },
      null,
      2,
    ),
  );
} finally {
  await connection.end();
}

function normalizeSchemaSql(sql, databaseName) {
  return sql.replace(
    /CREATE DATABASE IF NOT EXISTS `(?:youxue_classroom|primeclass)`[\s\S]*?USE `(?:youxue_classroom|primeclass)`;/,
    `USE \`${databaseName}\`;`,
  );
}

function normalizeSeedSql(sql, { database, adminPasswordHash, appPasswordHash }) {
  return sql
    .replace(/USE `(?:youxue_classroom|primeclass)`;/, `USE \`${database}\`;`)
    .replace('scrypt$bootstrap_admin$00', adminPasswordHash)
    .replace('scrypt$bootstrap_app$00', appPasswordHash);
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(value, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function generatePassword() {
  return `pc_${randomBytes(12).toString('base64url')}`;
}
