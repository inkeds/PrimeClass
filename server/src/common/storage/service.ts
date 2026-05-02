import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { access, copyFile, mkdir, unlink } from 'node:fs/promises';
import { constants as fsConstants, createReadStream } from 'node:fs';
import path from 'node:path';
import { posix as posixPath } from 'node:path';
import { PassThrough } from 'node:stream';

import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import COS from 'cos-nodejs-sdk-v5';
import * as ftp from 'basic-ftp';

import { env } from '../config/env.js';
import { buildSerial } from '../utils/code.js';
import { AppError } from '../errors/app-error.js';
import { queryFirst } from '../db/query.js';

export const STORAGE_PROVIDERS = ['local', 's3', 'tencent_cos', 'ftp'] as const;
export const STORAGE_SECRET_PLACEHOLDER = '********';

export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

type SqlExecutor = Pool | PoolConnection;

type StorageConfigRow = RowDataPacket & {
  provider: StorageProvider;
  is_enabled: number;
  is_default: number;
  config_json: string | Record<string, unknown> | null;
};

type StorageSnapshot = {
  provider: StorageProvider;
  isEnabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
};

const STORAGE_SECRET_FIELDS: Record<StorageProvider, string[]> = {
  local: [],
  s3: ['access_key', 'secret_key'],
  tencent_cos: ['secret_id', 'secret_key'],
  ftp: ['password'],
};

const STORAGE_SECRET_PREFIX = 'enc$';

type UploadInput = {
  preferredProvider?: string | null;
  assetType: string;
  businessType?: string | null;
  originName: string;
  mimeType?: string | null;
  ext?: string | null;
  localFilePath: string;
  etagHash?: string | null;
};

type UploadResult = {
  provider: StorageProvider;
  bucketOrRoot: string | null;
  objectKey: string;
  storedName: string;
  publicUrl: string | null;
  etagHash: string | null;
};

type DeleteResult = {
  deleted: boolean;
  message: string;
};

type TestResult = {
  success: boolean;
  message: string;
};

export type StorageFileDelivery =
  | {
      kind: 'path';
      filePath: string;
    }
  | {
      kind: 'stream';
      stream: PassThrough;
    }
  | {
      kind: 'redirect';
      url: string;
    };

export async function uploadFileByStorageConfig(
  db: Pool,
  input: UploadInput,
): Promise<UploadResult> {
  const snapshot = await resolveStorageSnapshot(db, input.preferredProvider ?? undefined);
  const validationErrors = validateStorageConfig(snapshot.provider, snapshot.config);

  if (validationErrors.length > 0) {
    throw new AppError(422, 42200, validationErrors.join('；'));
  }

  const objectKey = buildObjectKey({
    assetType: input.assetType,
    businessType: input.businessType ?? null,
    ext: input.ext ?? null,
    prefix: readOptionalString(snapshot.config, 'prefix'),
  });

  const uploaded = await uploadByProvider(snapshot, {
    localFilePath: input.localFilePath,
    objectKey,
    mimeType: input.mimeType ?? null,
    etagHash: input.etagHash ?? null,
  });

  return {
    provider: snapshot.provider,
    bucketOrRoot: uploaded.bucketOrRoot,
    objectKey,
    storedName: posixPath.basename(objectKey),
    publicUrl: uploaded.publicUrl,
    etagHash: uploaded.etagHash ?? input.etagHash ?? null,
  };
}

export async function deleteFileByStorageConfig(
  db: Pool,
  input: {
    provider: string;
    objectKey: string;
    bucketOrRoot?: string | null;
  },
): Promise<DeleteResult> {
  let snapshot: StorageSnapshot;

  try {
    snapshot = await resolveStorageSnapshot(db, input.provider, { requireEnabled: false });
  } catch (error) {
    return {
      deleted: false,
      message: error instanceof Error ? error.message : '存储配置不存在',
    };
  }

  const validationErrors = validateStorageConfig(snapshot.provider, snapshot.config);
  if (validationErrors.length > 0) {
    return {
      deleted: false,
      message: validationErrors.join('；'),
    };
  }

  try {
    await deleteByProvider(snapshot, {
      objectKey: input.objectKey,
      bucketOrRoot: input.bucketOrRoot ?? null,
    });
    return {
      deleted: true,
      message: '源文件已删除',
    };
  } catch (error) {
    return {
      deleted: false,
      message: error instanceof Error ? error.message : '删除源文件失败',
    };
  }
}

export async function testStorageConnection(
  provider: string,
  config: Record<string, unknown>,
): Promise<TestResult> {
  const normalizedProvider = ensureStorageProvider(provider);
  const validationErrors = validateStorageConfig(normalizedProvider, config);

  if (validationErrors.length > 0) {
    return {
      success: false,
      message: validationErrors.join('；'),
    };
  }

  try {
    switch (normalizedProvider) {
      case 'local':
        await testLocalConnection(config);
        break;
      case 's3':
        await testS3Connection(config);
        break;
      case 'tencent_cos':
        await testTencentCosConnection(config);
        break;
      case 'ftp':
        await testFtpConnection(config);
        break;
    }

    return {
      success: true,
      message: '存储连接测试通过',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '存储连接测试失败',
    };
  }
}

export async function getFileDeliveryByStorageConfig(
  db: Pool,
  input: {
    provider: string;
    objectKey: string;
    bucketOrRoot?: string | null;
  },
): Promise<StorageFileDelivery> {
  const snapshot = await resolveStorageSnapshot(db, input.provider, { requireEnabled: false });
  const validationErrors = validateStorageConfig(snapshot.provider, snapshot.config);

  if (validationErrors.length > 0) {
    throw new AppError(422, 42200, validationErrors.join('；'));
  }

  return openByProvider(snapshot, {
    objectKey: input.objectKey,
    bucketOrRoot: input.bucketOrRoot ?? null,
  });
}

export function validateStorageConfig(provider: string, config: Record<string, unknown>) {
  const normalizedProvider = ensureStorageProvider(provider);
  const requiredFields: Record<StorageProvider, string[]> = {
    local: ['root_path'],
    s3: ['bucket', 'region', 'access_key', 'secret_key'],
    tencent_cos: ['bucket', 'region', 'secret_id', 'secret_key'],
    ftp: ['host', 'port', 'username', 'password', 'root_path'],
  };

  return requiredFields[normalizedProvider]
    .filter((field) => {
      const value = config[field];
      return value == null || value === '';
    })
    .map((field) => `缺少字段 ${field}`);
}

export function readStorageConfig(
  provider: StorageProvider,
  value: string | Record<string, unknown> | null,
): Record<string, unknown> {
  return decryptStorageConfigSecrets(provider, parseJsonObject(value));
}

export function resolveStorageConfigInput(
  provider: StorageProvider,
  inputConfig: Record<string, unknown>,
  currentConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  const mergedConfig = {
    ...currentConfig,
    ...inputConfig,
  };

  for (const field of STORAGE_SECRET_FIELDS[provider]) {
    const value = mergedConfig[field];

    if (value === STORAGE_SECRET_PLACEHOLDER) {
      mergedConfig[field] = currentConfig[field] ?? '';
    }
  }

  return mergedConfig;
}

export function writeStorageConfig(
  provider: StorageProvider,
  plainConfig: Record<string, unknown>,
): Record<string, unknown> {
  return encryptStorageConfigSecrets(provider, plainConfig);
}

export function maskStorageConfig(
  provider: StorageProvider,
  plainConfig: Record<string, unknown>,
): Record<string, unknown> {
  const maskedConfig = { ...plainConfig };

  for (const field of STORAGE_SECRET_FIELDS[provider]) {
    const value = maskedConfig[field];

    if (typeof value === 'string' && value.trim().length > 0) {
      maskedConfig[field] = STORAGE_SECRET_PLACEHOLDER;
    }
  }

  return maskedConfig;
}

export function ensureStorageProvider(provider: string): StorageProvider {
  if ((STORAGE_PROVIDERS as readonly string[]).includes(provider)) {
    return provider as StorageProvider;
  }

  throw new AppError(400, 40001, '不支持的存储类型');
}

async function resolveStorageSnapshot(
  db: SqlExecutor,
  preferredProvider?: string,
  options?: {
    requireEnabled?: boolean;
  },
): Promise<StorageSnapshot> {
  const requireEnabled = options?.requireEnabled ?? true;
  let row: StorageConfigRow | null = null;

  if (preferredProvider) {
    const normalizedProvider = ensureStorageProvider(preferredProvider);
    row = await queryFirst<StorageConfigRow>(
      db,
      `
        SELECT provider, is_enabled, is_default, config_json
        FROM storage_configs
        WHERE provider = :provider
        LIMIT 1
      `,
      { provider: normalizedProvider },
    );
  } else {
    row = await queryFirst<StorageConfigRow>(
      db,
      `
        SELECT provider, is_enabled, is_default, config_json
        FROM storage_configs
        WHERE is_default = 1
        ORDER BY id ASC
        LIMIT 1
      `,
    );

    if (!row) {
      row = await queryFirst<StorageConfigRow>(
        db,
        `
          SELECT provider, is_enabled, is_default, config_json
          FROM storage_configs
          WHERE provider = 'local'
          LIMIT 1
        `,
      );
    }
  }

  if (!row) {
    throw new AppError(404, 40400, '未找到存储配置');
  }

  if (requireEnabled && !Boolean(row.is_enabled)) {
    throw new AppError(422, 42200, `存储通道 ${row.provider} 未启用`);
  }

  return {
    provider: row.provider,
    isEnabled: Boolean(row.is_enabled),
    isDefault: Boolean(row.is_default),
    config: readStorageConfig(row.provider, row.config_json),
  };
}

async function uploadByProvider(
  snapshot: StorageSnapshot,
  input: {
    localFilePath: string;
    objectKey: string;
    mimeType: string | null;
    etagHash: string | null;
  },
) {
  switch (snapshot.provider) {
    case 'local':
      return uploadToLocal(snapshot.config, input);
    case 's3':
      return uploadToS3(snapshot.config, input);
    case 'tencent_cos':
      return uploadToTencentCos(snapshot.config, input);
    case 'ftp':
      return uploadToFtp(snapshot.config, input);
  }
}

async function deleteByProvider(
  snapshot: StorageSnapshot,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
) {
  switch (snapshot.provider) {
    case 'local':
      return deleteFromLocal(snapshot.config, input);
    case 's3':
      return deleteFromS3(snapshot.config, input);
    case 'tencent_cos':
      return deleteFromTencentCos(snapshot.config, input);
    case 'ftp':
      return deleteFromFtp(snapshot.config, input);
  }
}

async function openByProvider(
  snapshot: StorageSnapshot,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
): Promise<StorageFileDelivery> {
  switch (snapshot.provider) {
    case 'local':
      return openLocalFile(snapshot.config, input);
    case 's3':
      return openS3File(snapshot.config, input);
    case 'tencent_cos':
      return openTencentCosFile(snapshot.config, input);
    case 'ftp':
      return openFtpFile(snapshot.config, input);
  }
}

async function uploadToLocal(
  config: Record<string, unknown>,
  input: {
    localFilePath: string;
    objectKey: string;
    etagHash: string | null;
  },
) {
  const rootPath = resolveLocalRootPath(readRequiredString(config, 'root_path'));
  const targetPath = path.join(rootPath, ...input.objectKey.split('/'));
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(input.localFilePath, targetPath);

  return {
    bucketOrRoot: readRequiredString(config, 'root_path'),
    publicUrl: buildPublicUrl(readOptionalString(config, 'public_base_url'), input.objectKey),
    etagHash: input.etagHash,
  };
}

async function openLocalFile(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
  },
): Promise<StorageFileDelivery> {
  const rootPath = resolveLocalRootPath(readRequiredString(config, 'root_path'));
  const filePath = path.join(rootPath, ...input.objectKey.split('/'));
  await access(filePath, fsConstants.R_OK);

  return {
    kind: 'path',
    filePath,
  };
}

async function uploadToS3(
  config: Record<string, unknown>,
  input: {
    localFilePath: string;
    objectKey: string;
    mimeType: string | null;
    etagHash: string | null;
  },
) {
  const bucket = readRequiredString(config, 'bucket');
  const client = createS3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Body: createReadStream(input.localFilePath),
      ContentType: input.mimeType ?? undefined,
    }),
  );

  return {
    bucketOrRoot: bucket,
    publicUrl: buildS3PublicUrl(config, bucket, input.objectKey),
    etagHash: input.etagHash,
  };
}

async function openS3File(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
): Promise<StorageFileDelivery> {
  const bucket = input.bucketOrRoot || readRequiredString(config, 'bucket');

  return {
    kind: 'redirect',
    url: buildS3PublicUrl(config, bucket, input.objectKey),
  };
}

async function uploadToTencentCos(
  config: Record<string, unknown>,
  input: {
    localFilePath: string;
    objectKey: string;
    mimeType: string | null;
    etagHash: string | null;
  },
) {
  const bucket = readRequiredString(config, 'bucket');
  const region = readRequiredString(config, 'region');
  const client = createTencentCosClient(config);

  await new Promise<void>((resolve, reject) => {
    client.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: input.objectKey,
        Body: createReadStream(input.localFilePath),
        ContentType: input.mimeType ?? undefined,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });

  return {
    bucketOrRoot: bucket,
    publicUrl: buildTencentCosPublicUrl(config, bucket, region, input.objectKey),
    etagHash: input.etagHash,
  };
}

async function openTencentCosFile(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
): Promise<StorageFileDelivery> {
  const bucket = input.bucketOrRoot || readRequiredString(config, 'bucket');
  const region = readRequiredString(config, 'region');

  return {
    kind: 'redirect',
    url: buildTencentCosPublicUrl(config, bucket, region, input.objectKey),
  };
}

async function uploadToFtp(
  config: Record<string, unknown>,
  input: {
    localFilePath: string;
    objectKey: string;
    etagHash: string | null;
  },
) {
  const client = new ftp.Client(30000);
  const rootPath = normalizeRemoteRootPath(readRequiredString(config, 'root_path'));
  const remotePath = posixPath.join(rootPath, input.objectKey);

  try {
    await client.access({
      host: readRequiredString(config, 'host'),
      port: readRequiredNumber(config, 'port'),
      user: readRequiredString(config, 'username'),
      password: readRequiredString(config, 'password'),
      secure: readOptionalBoolean(config, 'secure') ?? false,
    });
    await client.ensureDir(posixPath.dirname(remotePath));
    await client.uploadFrom(input.localFilePath, remotePath);
  } finally {
    client.close();
  }

  return {
    bucketOrRoot: rootPath,
    publicUrl: buildPublicUrl(readOptionalString(config, 'public_base_url'), input.objectKey),
    etagHash: input.etagHash,
  };
}

async function openFtpFile(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
  },
): Promise<StorageFileDelivery> {
  const stream = new PassThrough();
  const client = new ftp.Client(30000);
  const rootPath = normalizeRemoteRootPath(readRequiredString(config, 'root_path'));
  const remotePath = posixPath.join(rootPath, input.objectKey);

  void (async () => {
    try {
      await client.access({
        host: readRequiredString(config, 'host'),
        port: readRequiredNumber(config, 'port'),
        user: readRequiredString(config, 'username'),
        password: readRequiredString(config, 'password'),
        secure: readOptionalBoolean(config, 'secure') ?? false,
      });
      await client.downloadTo(stream, remotePath);
    } catch (error) {
      stream.destroy(error instanceof Error ? error : new Error('FTP 文件读取失败'));
    } finally {
      client.close();
    }
  })();

  return {
    kind: 'stream',
    stream,
  };
}

async function deleteFromLocal(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
  },
) {
  const rootPath = resolveLocalRootPath(readRequiredString(config, 'root_path'));
  const targetPath = path.join(rootPath, ...input.objectKey.split('/'));
  await unlink(targetPath);
}

async function deleteFromS3(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
) {
  const bucket = input.bucketOrRoot || readRequiredString(config, 'bucket');
  const client = createS3Client(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
    }),
  );
}

async function deleteFromTencentCos(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
) {
  const bucket = input.bucketOrRoot || readRequiredString(config, 'bucket');
  const region = readRequiredString(config, 'region');
  const client = createTencentCosClient(config);

  await new Promise<void>((resolve, reject) => {
    client.deleteObject(
      {
        Bucket: bucket,
        Region: region,
        Key: input.objectKey,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

async function deleteFromFtp(
  config: Record<string, unknown>,
  input: {
    objectKey: string;
    bucketOrRoot: string | null;
  },
) {
  const client = new ftp.Client(30000);
  const rootPath = normalizeRemoteRootPath(input.bucketOrRoot || readRequiredString(config, 'root_path'));
  const remotePath = posixPath.join(rootPath, input.objectKey);

  try {
    await client.access({
      host: readRequiredString(config, 'host'),
      port: readRequiredNumber(config, 'port'),
      user: readRequiredString(config, 'username'),
      password: readRequiredString(config, 'password'),
      secure: readOptionalBoolean(config, 'secure') ?? false,
    });
    await client.remove(remotePath);
  } finally {
    client.close();
  }
}

async function testLocalConnection(config: Record<string, unknown>) {
  const rootPath = resolveLocalRootPath(readRequiredString(config, 'root_path'));
  await mkdir(rootPath, { recursive: true });
  await access(rootPath, fsConstants.R_OK | fsConstants.W_OK);
}

async function testS3Connection(config: Record<string, unknown>) {
  const client = createS3Client(config);
  await client.send(
    new HeadBucketCommand({
      Bucket: readRequiredString(config, 'bucket'),
    }),
  );
}

async function testTencentCosConnection(config: Record<string, unknown>) {
  const client = createTencentCosClient(config);
  await new Promise<void>((resolve, reject) => {
    client.getBucket(
      {
        Bucket: readRequiredString(config, 'bucket'),
        Region: readRequiredString(config, 'region'),
        Prefix: '',
        MaxKeys: 1,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

async function testFtpConnection(config: Record<string, unknown>) {
  const client = new ftp.Client(30000);

  try {
    await client.access({
      host: readRequiredString(config, 'host'),
      port: readRequiredNumber(config, 'port'),
      user: readRequiredString(config, 'username'),
      password: readRequiredString(config, 'password'),
      secure: readOptionalBoolean(config, 'secure') ?? false,
    });

    const rootPath = normalizeRemoteRootPath(readRequiredString(config, 'root_path'));
    await client.ensureDir(rootPath);
    await client.cd(rootPath);
    await client.pwd();
  } finally {
    client.close();
  }
}

function createS3Client(config: Record<string, unknown>) {
  return new S3Client({
    region: readRequiredString(config, 'region'),
    endpoint: readOptionalString(config, 'endpoint') ?? undefined,
    forcePathStyle: readOptionalBoolean(config, 'force_path_style') ?? false,
    credentials: {
      accessKeyId: readRequiredString(config, 'access_key'),
      secretAccessKey: readRequiredString(config, 'secret_key'),
    },
  });
}

function createTencentCosClient(config: Record<string, unknown>) {
  return new COS({
    SecretId: readRequiredString(config, 'secret_id'),
    SecretKey: readRequiredString(config, 'secret_key'),
  });
}

function buildObjectKey(input: {
  assetType: string;
  businessType: string | null;
  ext: string | null;
  prefix: string | null;
}) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const safeExt = input.ext ? sanitizeExtension(input.ext) : null;
  const fileName = `${buildSerial('F', 8)}${safeExt ? `.${safeExt}` : ''}`;
  const segments = [
    input.prefix?.trim() || null,
    input.businessType?.trim() || null,
    input.assetType.trim() || 'other',
    year,
    month,
    day,
    fileName,
  ].filter((item): item is string => Boolean(item));

  return segments.map((segment) => segment.replaceAll('\\', '/')).join('/');
}

function buildPublicUrl(baseUrl: string | null, objectKey: string) {
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${objectKey.replace(/^\/+/, '')}`;
}

function buildS3PublicUrl(config: Record<string, unknown>, bucket: string, objectKey: string): string {
  const customUrl = buildPublicUrl(readOptionalString(config, 'public_base_url'), objectKey);
  if (customUrl) {
    return customUrl;
  }

  const endpoint = readOptionalString(config, 'endpoint');
  if (endpoint) {
    return `${endpoint.replace(/\/+$/, '')}/${bucket}/${objectKey.replace(/^\/+/, '')}`;
  }

  const region = readRequiredString(config, 'region');
  return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;
}

function buildTencentCosPublicUrl(
  config: Record<string, unknown>,
  bucket: string,
  region: string,
  objectKey: string,
): string {
  const customUrl = buildPublicUrl(readOptionalString(config, 'public_base_url'), objectKey);
  if (customUrl) {
    return customUrl;
  }

  return `https://${bucket}.cos.${region}.myqcloud.com/${objectKey}`;
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

function encryptStorageConfigSecrets(provider: StorageProvider, config: Record<string, unknown>) {
  const encryptedConfig = { ...config };

  for (const field of STORAGE_SECRET_FIELDS[provider]) {
    const value = encryptedConfig[field];

    if (typeof value === 'string' && value.trim().length > 0) {
      encryptedConfig[field] = encryptSecretValue(value.trim());
    }
  }

  return encryptedConfig;
}

function decryptStorageConfigSecrets(provider: StorageProvider, config: Record<string, unknown>) {
  const decryptedConfig = { ...config };

  for (const field of STORAGE_SECRET_FIELDS[provider]) {
    const value = decryptedConfig[field];

    if (typeof value === 'string' && value.startsWith(STORAGE_SECRET_PREFIX)) {
      decryptedConfig[field] = decryptSecretValue(value);
    }
  }

  return decryptedConfig;
}

function encryptSecretValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getStorageEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${STORAGE_SECRET_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString('base64url')}`;
}

function decryptSecretValue(value: string) {
  const encoded = value.slice(STORAGE_SECRET_PREFIX.length);

  try {
    const buffer = Buffer.from(encoded, 'base64url');
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', getStorageEncryptionKey(), iv);

    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError(500, 50000, '存储密钥解密失败');
  }
}

function getStorageEncryptionKey() {
  return createHash('sha256')
    .update(env.ENCRYPTION_KEY.trim() || env.JWT_SECRET)
    .digest();
}

function readRequiredString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  throw new AppError(422, 42200, `存储配置缺少 ${key}`);
}

function readOptionalString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function readRequiredNumber(config: Record<string, unknown>, key: string) {
  const value = config[key];
  const numberValue =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  throw new AppError(422, 42200, `存储配置缺少 ${key}`);
}

function readOptionalBoolean(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return null;
}

function resolveLocalRootPath(rootPath: string) {
  return path.isAbsolute(rootPath) ? rootPath : path.resolve(process.cwd(), rootPath);
}

function normalizeRemoteRootPath(rootPath: string) {
  const normalized = rootPath.replaceAll('\\', '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function sanitizeExtension(ext: string) {
  return ext.replace(/^\.+/, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
