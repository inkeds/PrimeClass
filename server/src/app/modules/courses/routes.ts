import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  requireAppAuth,
  tryGetAppAuthContext,
  tryGetAppAuthContextFromToken,
} from '../../../common/auth/app-auth.js';
import { sendList, sendOk } from '../../../common/http/response.js';
import { getFileDeliveryByStorageConfig } from '../../../common/storage/service.js';
import {
  saveLessonNote,
  setCourseFavorite,
  getAssetFileDetail,
  getCourseDetail,
  getLessonPlayDetail,
  listSyncCourses,
  listTopicCourses,
  listTopicTags,
  searchCourses,
  updateLearningProgress,
} from './service.js';

const syncCourseQuerySchema = z.object({
  subject: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  term: z.string().trim().optional(),
  version: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const topicCoursesQuerySchema = z.object({
  tag_id: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  version: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const courseSearchQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  course_type: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  version: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const courseIdParamsSchema = z.object({
  courseId: z.string().trim().min(1),
});

const lessonIdParamsSchema = z.object({
  lessonId: z.string().trim().min(1),
});

const assetIdParamsSchema = z.object({
  assetId: z.string().trim().min(1),
});

const assetFileQuerySchema = z.object({
  access_token: z.string().trim().optional(),
});

const learningProgressBodySchema = z.object({
  course_id: z.string().trim().min(1),
  lesson_id: z.string().trim().min(1),
  progress: z.coerce.number().min(0).max(100),
  watched_seconds: z.coerce.number().int().nonnegative(),
});

const lessonNoteBodySchema = z.object({
  content: z.string().max(5000).default(''),
});

export const registerAppCourseRoutes: FastifyPluginAsync = async (server) => {
  server.get('/courses/sync', async (request, reply) => {
    const query = syncCourseQuerySchema.parse(request.query ?? {});
    const user = await tryGetAppAuthContext(request);
    const data = await listSyncCourses(server.db, query, user?.user_id);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.get('/topics/tags', async (request, reply) => {
    const list = await listTopicTags(server.db);
    return sendList(request, reply, list, 1, list.length || 20, list.length);
  });

  server.get('/courses/topics', async (request, reply) => {
    const query = topicCoursesQuerySchema.parse(request.query ?? {});
    const user = await tryGetAppAuthContext(request);
    const data = await listTopicCourses(server.db, query, user?.user_id);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.get('/courses/search', async (request, reply) => {
    const query = courseSearchQuerySchema.parse(request.query ?? {});
    const user = await tryGetAppAuthContext(request);
    const data = await searchCourses(server.db, query, user?.user_id);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.get('/courses/:courseId', async (request, reply) => {
    const params = courseIdParamsSchema.parse(request.params);
    const user = await tryGetAppAuthContext(request);
    const data = await getCourseDetail(server.db, params.courseId, user?.user_id);
    return sendOk(request, reply, data);
  });

  server.post('/courses/:courseId/favorite', { preHandler: requireAppAuth }, async (request, reply) => {
    const params = courseIdParamsSchema.parse(request.params);
    const data = await setCourseFavorite(server.db, {
      userId: request.userAuth!.user_id,
      courseId: params.courseId,
      collected: true,
    });

    return sendOk(request, reply, data);
  });

  server.delete('/courses/:courseId/favorite', { preHandler: requireAppAuth }, async (request, reply) => {
    const params = courseIdParamsSchema.parse(request.params);
    const data = await setCourseFavorite(server.db, {
      userId: request.userAuth!.user_id,
      courseId: params.courseId,
      collected: false,
    });

    return sendOk(request, reply, data);
  });

  server.get('/lessons/:lessonId/play', async (request, reply) => {
    const params = lessonIdParamsSchema.parse(request.params);
    const user = await tryGetAppAuthContext(request);
    const data = await getLessonPlayDetail(server.db, params.lessonId, user?.user_id);
    return sendOk(request, reply, data);
  });

  server.post('/lessons/:lessonId/note', { preHandler: requireAppAuth }, async (request, reply) => {
    const params = lessonIdParamsSchema.parse(request.params);
    const body = lessonNoteBodySchema.parse(request.body ?? {});
    const data = await saveLessonNote(server.db, {
      userId: request.userAuth!.user_id,
      lessonId: params.lessonId,
      content: body.content,
    });

    return sendOk(request, reply, data);
  });

  server.get('/assets/:assetId/file', async (request, reply) => {
    const params = assetIdParamsSchema.parse(request.params);
    const query = assetFileQuerySchema.parse(request.query ?? {});
    const user = request.headers.authorization
      ? await tryGetAppAuthContext(request)
      : await tryGetAppAuthContextFromToken(request, query.access_token);
    const asset = await getAssetFileDetail(server.db, params.assetId, user?.user_id);

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

  server.post('/learning/progress', { preHandler: requireAppAuth }, async (request, reply) => {
    const body = learningProgressBodySchema.parse(request.body ?? {});
    const data = await updateLearningProgress(server.db, {
      userId: request.userAuth!.user_id,
      course_id: body.course_id,
      lesson_id: body.lesson_id,
      progress: body.progress,
      watched_seconds: body.watched_seconds,
    });

    return sendOk(request, reply, data);
  });
};

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

  if (!ext) {
    return false;
  }

  return ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'mp4', 'm4v', 'mov', 'webm', 'pdf'].includes(
    ext.toLowerCase(),
  );
}
