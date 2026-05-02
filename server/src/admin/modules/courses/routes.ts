import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import {
  getAdminAuthContext,
  getAdminAuthContextFromToken,
  requireAdminAuth,
  requireAdminPermissions,
} from '../../../common/auth/admin-auth.js';
import { queryRows } from '../../../common/db/query.js';
import { AppError } from '../../../common/errors/app-error.js';
import { sendList, sendOk } from '../../../common/http/response.js';
import { getFileDeliveryByStorageConfig } from '../../../common/storage/service.js';
import {
  createCourse,
  createLesson,
  createTopicTag,
  deleteAsset,
  deleteCourse,
  deleteLesson,
  deleteTopicTag,
  getAssetDetail,
  getCourseDetail,
  listAssets,
  listCourses,
  listLessons,
  listTopicTags,
  sortLessons,
  uploadAsset,
  updateCourse,
  updateCourseStatus,
  updateLesson,
  updateLessonStatus,
  updateTopicTag,
} from './service.js';

const courseListQuerySchema = z.object({
  course_type: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  term: z.string().trim().optional(),
  version: z.string().trim().optional(),
  access_type: z.string().trim().optional(),
  status: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const courseParamsSchema = z.object({
  courseId: z.string().trim().min(1),
});

const courseBodySchema = z.object({
  course_type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  subtitle: z.string().trim().nullable().optional(),
  subject_code: z.string().trim().nullable().optional(),
  grade_code: z.string().trim().nullable().optional(),
  term_code: z.string().trim().nullable().optional(),
  version_code: z.string().trim().nullable().optional(),
  teacher_name: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  recommendation: z.string().trim().nullable().optional(),
  cover_asset_id: z.string().trim().nullable().optional(),
  access_type: z.string().trim().optional(),
  status: z.string().trim().optional(),
  sort_order: z.coerce.number().int().optional(),
  topic_tag_ids: z.array(z.string().trim()).optional(),
});

const lessonQueryParamsSchema = z.object({
  courseId: z.string().trim().min(1),
});

const lessonBodySchema = z
  .object({
    parent_id: z.string().trim().nullable().optional(),
    node_type: z.enum(['chapter', 'section', 'lesson']).optional(),
    lesson_type: z.enum(['chapter', 'section', 'lesson']).optional(),
    title: z.string().trim().min(1),
    sort_order: z.coerce.number().int().optional(),
    status: z.string().trim().optional(),
    video_asset_id: z.string().trim().nullable().optional(),
    handout_asset_id: z.string().trim().nullable().optional(),
    note_template_asset_id: z.string().trim().nullable().optional(),
    duration_seconds: z.coerce.number().int().nonnegative().optional(),
    is_preview: z.boolean().optional(),
    access_type: z.string().trim().nullable().optional(),
  })
  .transform((value) => ({
    ...value,
    node_type: value.node_type ?? value.lesson_type ?? 'lesson',
  }));

const lessonParamsSchema = z.object({
  lessonId: z.string().trim().min(1),
});

const lessonSortBodySchema = z.object({
  items: z
    .array(
      z.object({
        lesson_id: z.string().trim().min(1),
        sort_order: z.coerce.number().int(),
      }),
    )
    .min(1),
});

const lessonStatusBodySchema = z.object({
  status: z.enum(['draft', 'published', 'offline']),
});

const topicTagQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const topicTagBodySchema = z.object({
  tag_name: z.string().trim().min(1),
  subject_code: z.string().trim().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
  status: z.string().trim().optional(),
  remark: z.string().trim().nullable().optional(),
});

const topicTagParamsSchema = z.object({
  tagId: z.string().trim().min(1),
});

const assetQuerySchema = z.object({
  asset_type: z.string().trim().optional(),
  provider: z.string().trim().optional(),
  business_type: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const assetParamsSchema = z.object({
  assetId: z.string().trim().min(1),
});

const assetFileQuerySchema = z.object({
  access_token: z.string().trim().optional(),
});

const assetUploadFieldsSchema = z.object({
  asset_type: z.enum(['image', 'video', 'audio', 'document', 'avatar', 'other']),
  business_type: z.string().trim().optional(),
  provider: z.enum(['local', 's3', 'tencent_cos', 'ftp']).optional(),
});

export const registerAdminCourseRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', requireAdminAuth);

  const handleUpdateCourse = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = courseParamsSchema.parse(request.params);
    const body = courseBodySchema.parse(request.body ?? {});
    const data = await updateCourse(server.db, params.courseId, body);
    return sendOk(request, reply, data);
  };

  const handleDeleteCourse = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = courseParamsSchema.parse(request.params);
    const data = await deleteCourse(server.db, params.courseId);
    return sendOk(request, reply, data);
  };

  const handleUpdateLesson = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = lessonParamsSchema.parse(request.params);
    const body = lessonBodySchema.parse(request.body ?? {});
    const data = await updateLesson(server.db, params.lessonId, body);
    return sendOk(request, reply, data);
  };

  const handleDeleteLesson = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = lessonParamsSchema.parse(request.params);
    const data = await deleteLesson(server.db, params.lessonId);
    return sendOk(request, reply, data);
  };

  const handleUpdateTopicTag = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = topicTagParamsSchema.parse(request.params);
    const body = topicTagBodySchema.parse(request.body ?? {});
    const data = await updateTopicTag(server.db, params.tagId, body);
    return sendOk(request, reply, data);
  };

  const handleDeleteTopicTag = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = topicTagParamsSchema.parse(request.params);
    const data = await deleteTopicTag(server.db, params.tagId);
    return sendOk(request, reply, data);
  };

  const handleDeleteAsset = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = assetParamsSchema.parse(request.params);
    const data = await deleteAsset(server.db, params.assetId);
    return sendOk(request, reply, data);
  };

  server.get('/courses', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const query = courseListQuerySchema.parse(request.query ?? {});
    const data = await listCourses(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post('/courses', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const body = courseBodySchema.parse(request.body ?? {});
    const data = await createCourse(server.db, body, request.adminAuth!.admin_id);
    return sendOk(request, reply, data);
  });

  server.get('/courses/:courseId', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const data = await getCourseDetail(server.db, params.courseId);
    return sendOk(request, reply, data);
  });

  server.put('/courses/:courseId', { preHandler: requireAdminPermissions('courses.edit') }, handleUpdateCourse);
  server.post('/courses/:courseId', { preHandler: requireAdminPermissions('courses.edit') }, handleUpdateCourse);

  server.post('/courses/:courseId/publish', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const data = await updateCourseStatus(server.db, params.courseId, 'published');
    return sendOk(request, reply, data);
  });

  server.post('/courses/:courseId/offline', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const data = await updateCourseStatus(server.db, params.courseId, 'offline');
    return sendOk(request, reply, data);
  });

  server.delete('/courses/:courseId', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteCourse);
  server.post('/courses/:courseId/delete', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteCourse);

  server.get('/courses/:courseId/lessons', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const params = lessonQueryParamsSchema.parse(request.params);
    const list = await listLessons(server.db, params.courseId);
    return sendList(request, reply, list, 1, list.length || 20, list.length);
  });

  server.post('/courses/:courseId/lessons', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = lessonQueryParamsSchema.parse(request.params);
    const body = lessonBodySchema.parse(request.body ?? {});
    const data = await createLesson(server.db, params.courseId, body);
    return sendOk(request, reply, data);
  });

  server.put('/lessons/:lessonId', { preHandler: requireAdminPermissions('courses.edit') }, handleUpdateLesson);
  server.post('/lessons/:lessonId', { preHandler: requireAdminPermissions('courses.edit') }, handleUpdateLesson);

  server.post('/lessons/:lessonId/status', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = lessonParamsSchema.parse(request.params);
    const body = lessonStatusBodySchema.parse(request.body ?? {});
    const data = await updateLessonStatus(server.db, params.lessonId, body.status);
    return sendOk(request, reply, data);
  });

  server.delete('/lessons/:lessonId', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteLesson);
  server.post('/lessons/:lessonId/delete', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteLesson);

  server.post('/courses/:courseId/lessons/sort', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = lessonQueryParamsSchema.parse(request.params);
    const body = lessonSortBodySchema.parse(request.body ?? {});
    const data = await sortLessons(server.db, params.courseId, body.items);
    return sendOk(request, reply, data);
  });

  server.get('/topic-tags', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const query = topicTagQuerySchema.parse(request.query ?? {});
    const data = await listTopicTags(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post('/topic-tags', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const body = topicTagBodySchema.parse(request.body ?? {});
    const data = await createTopicTag(server.db, body);
    return sendOk(request, reply, data);
  });

  server.put('/topic-tags/:tagId', { preHandler: requireAdminPermissions('courses.edit') }, handleUpdateTopicTag);
  server.post('/topic-tags/:tagId', { preHandler: requireAdminPermissions('courses.edit') }, handleUpdateTopicTag);

  server.delete('/topic-tags/:tagId', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteTopicTag);
  server.post('/topic-tags/:tagId/delete', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteTopicTag);

  server.get('/assets', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const query = assetQuerySchema.parse(request.query ?? {});
    const data = await listAssets(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post('/assets/upload', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const parsedUpload = await parseAssetUploadRequest(request);

    try {
      const data = await uploadAsset(
        server.db,
        {
          preferred_provider: parsedUpload.provider ?? null,
          origin_name: parsedUpload.origin_name,
          asset_type: parsedUpload.asset_type,
          business_type: parsedUpload.business_type ?? null,
          mime_type: parsedUpload.mime_type,
          ext: parsedUpload.ext,
          size: parsedUpload.size,
          etag_hash: parsedUpload.etag_hash,
          local_file_path: parsedUpload.temp_file_path,
        },
        request.adminAuth!.admin_id,
      );

      return sendOk(request, reply, data);
    } finally {
      await parsedUpload.cleanup();
    }
  });

  server.get('/assets/:assetId', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);
    const data = await getAssetDetail(server.db, params.assetId);
    return sendOk(request, reply, data);
  });

  server.get('/assets/:assetId/file', async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);
    const query = assetFileQuerySchema.parse(request.query ?? {});
    const adminAuth = request.headers.authorization
      ? await getAdminAuthContext(request)
      : query.access_token
        ? await getAdminAuthContextFromToken(request, query.access_token)
        : null;

    if (!adminAuth) {
      throw new AppError(401, 40100, '缺少管理员登录凭证');
    }

    if (!adminAuth.permissions.includes('courses.view') && !adminAuth.permissions.includes('courses.edit')) {
      throw new AppError(403, 40300, '当前账号无权访问课程资源');
    }

    const detail = await getAssetDetail(server.db, params.assetId);
    const asset = detail.asset;

    if (asset.status !== 'enabled') {
      reply.code(404);
      return reply.send('资源不存在');
    }

    if (asset.public_url) {
      return reply.redirect(asset.public_url);
    }

    const delivery = await getFileDeliveryByStorageConfig(server.db, {
      provider: asset.provider,
      objectKey: asset.object_key,
      bucketOrRoot: asset.bucket_or_root,
    });

    reply.header('Content-Type', asset.mime_type || 'application/octet-stream');
    reply.header('Content-Disposition', buildContentDisposition(asset.origin_name, asset.mime_type, asset.ext));

    if (delivery.kind === 'redirect') {
      return reply.redirect(delivery.url);
    }

    if (delivery.kind === 'path') {
      const fileStat = await stat(delivery.filePath);
      const rangeHeader = request.headers.range;

      reply.header('Accept-Ranges', 'bytes');

      if (rangeHeader) {
        const range = parseRangeHeader(rangeHeader, fileStat.size);

        if (range) {
          reply.code(206);
          reply.header('Content-Length', String(range.end - range.start + 1));
          reply.header('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`);
          return reply.send(createReadStream(delivery.filePath, { start: range.start, end: range.end }));
        }
      }

      reply.header('Content-Length', String(fileStat.size));
      return reply.send(createReadStream(delivery.filePath));
    }

    if (asset.size > 0) {
      reply.header('Content-Length', String(asset.size));
    }

    reply.header('Accept-Ranges', 'none');
    return reply.send(delivery.stream);
  });

  server.delete('/assets/:assetId', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteAsset);
  server.post('/assets/:assetId/delete', { preHandler: requireAdminPermissions('courses.edit') }, handleDeleteAsset);
};

async function parseAssetUploadRequest(request: FastifyRequest) {
  const uploadPolicy = await readUploadPolicy(request);
  const fields: Record<string, string> = {};
  let tempFilePath: string | null = null;
  let filePayload:
    | {
        temp_file_path: string;
        origin_name: string;
        mime_type: string | null;
        ext: string | null;
        size: number;
        etag_hash: string;
      }
    | undefined;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (filePayload) {
          throw new AppError(400, 40001, '当前接口仅支持单文件上传');
        }

        tempFilePath = path.join('/tmp', `primeclass-upload-${randomUUID()}`);
        const hash = createHash('sha256');
        let size = 0;

        await pipeline(
          part.file,
          new Transform({
            transform(chunk, _encoding, callback) {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              size += buffer.length;

              if (size > uploadPolicy.max_file_size_bytes) {
                callback(
                  new AppError(
                    400,
                    40001,
                    `上传文件超出大小限制，当前上限 ${uploadPolicy.max_file_size_mb} MB`,
                  ),
                );
                return;
              }

              hash.update(buffer);
              callback(null, buffer);
            },
          }),
          createWriteStream(tempFilePath),
        );

        if (part.file.truncated) {
          await unlink(tempFilePath).catch(() => undefined);
          throw new AppError(400, 40001, '上传文件超出大小限制');
        }

        filePayload = {
          temp_file_path: tempFilePath,
          origin_name: part.filename,
          mime_type: part.mimetype || null,
          ext: extractExtension(part.filename),
          size,
          etag_hash: hash.digest('hex'),
        };
        continue;
      }

      fields[part.fieldname] = String(part.value ?? '').trim();
    }

    if (!filePayload) {
      throw new AppError(400, 40001, '请上传文件');
    }

    const parsedFields = assetUploadFieldsSchema.parse(fields);
    const uploadedTempFilePath = filePayload.temp_file_path;
    validateAssetUploadExtension(parsedFields.asset_type, filePayload.ext, uploadPolicy);

    return {
      ...filePayload,
      asset_type: parsedFields.asset_type,
      business_type: normalizeOptionalText(parsedFields.business_type),
      provider: normalizeOptionalText(parsedFields.provider),
      cleanup: async () => {
        await unlink(uploadedTempFilePath).catch(() => undefined);
      },
    };
  } catch (error) {
    if (filePayload?.temp_file_path) {
      await unlink(filePayload.temp_file_path).catch(() => undefined);
    } else if (tempFilePath) {
      await unlink(tempFilePath).catch(() => undefined);
    }

    throw error;
  }
}

type UploadSettingRow = RowDataPacket & {
  setting_key: string;
  value_type: string;
  setting_value: string | null;
};

async function readUploadPolicy(request: FastifyRequest) {
  const rows = await queryRows<UploadSettingRow>(
    request.server.db,
    `
      SELECT setting_key, value_type, setting_value
      FROM system_settings
      WHERE category = 'upload'
        AND setting_key IN ('max_file_size_mb', 'allowed_image_exts', 'allowed_video_exts')
    `,
  );

  const settings = new Map(rows.map((row) => [row.setting_key, deserializeSettingValue(row.value_type, row.setting_value)]));
  const maxFileSizeMb = readPositiveInteger(settings.get('max_file_size_mb'), 500);

  return {
    max_file_size_mb: maxFileSizeMb,
    max_file_size_bytes: maxFileSizeMb * 1024 * 1024,
    allowed_image_exts: new Set(readStringList(settings.get('allowed_image_exts'))),
    allowed_video_exts: new Set(readStringList(settings.get('allowed_video_exts'))),
  };
}

function validateAssetUploadExtension(
  assetType: 'image' | 'video' | 'audio' | 'document' | 'avatar' | 'other',
  ext: string | null,
  uploadPolicy: Awaited<ReturnType<typeof readUploadPolicy>>,
) {
  if (!ext) {
    return;
  }

  const allowedExts =
    assetType === 'image' || assetType === 'avatar'
      ? uploadPolicy.allowed_image_exts
      : assetType === 'video'
        ? uploadPolicy.allowed_video_exts
        : null;

  if (!allowedExts || allowedExts.size === 0) {
    return;
  }

  if (allowedExts.has(ext.toLowerCase())) {
    return;
  }

  throw new AppError(400, 40001, `当前文件类型不允许上传，支持格式：${Array.from(allowedExts).join('、')}`);
}

function deserializeSettingValue(valueType: string, settingValue: string | null) {
  if (settingValue == null) {
    return null;
  }

  switch (valueType) {
    case 'int':
      return Number(settingValue);
    case 'bool':
      return settingValue === 'true';
    case 'json':
      try {
        return JSON.parse(settingValue) as unknown;
      } catch {
        return null;
      }
    default:
      return settingValue;
  }
}

function readPositiveInteger(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }

  return fallback;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter(Boolean);
}

function normalizeOptionalText(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractExtension(filename: string) {
  const ext = path.extname(filename).replace(/^\./, '').trim().toLowerCase();
  return ext || null;
}

function buildContentDisposition(originName: string, mimeType?: string | null, ext?: string | null) {
  return `${shouldInlineFile(mimeType, ext) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(originName)}`;
}

function shouldInlineFile(mimeType?: string | null, ext?: string | null) {
  if (mimeType?.startsWith('audio/') || mimeType?.startsWith('video/') || mimeType?.startsWith('image/')) {
    return true;
  }

  if (mimeType === 'application/pdf') {
    return true;
  }

  return ext === 'pdf';
}

function parseRangeHeader(value: string, totalSize: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());

  if (!match) {
    return null;
  }

  const startValue = match[1];
  const endValue = match[2];

  if (!startValue && !endValue) {
    return null;
  }

  let start = startValue ? Number(startValue) : totalSize - Number(endValue);
  let end = endValue ? Number(endValue) : totalSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  start = Math.max(0, start);
  end = Math.min(totalSize - 1, end);

  if (start > end || start >= totalSize) {
    return null;
  }

  return { start, end };
}
