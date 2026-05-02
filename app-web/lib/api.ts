import type {
  AppSession,
  CourseDetail,
  CourseSummary,
  DisplaySettings,
  FavoriteToggleResult,
  GradeItem,
  HomePayload,
  LessonNoteResult,
  LessonPlayDetail,
  LibraryOverview,
  ListPayload,
  MeNotificationSettings,
  MePayload,
  MembershipSnapshot,
  RedeemResult,
  SubjectItem,
  TopicTag,
  VersionItem,
} from '@/lib/types';
import { readSession } from '@/lib/session';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? getDefaultApiBaseUrl();

function getDefaultApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    return `${protocol}//${hostname}:3000/api/v1/app`;
  }

  return 'http://127.0.0.1:3000/api/v1/app';
}

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
  request_id: string;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  token?: string | null;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  code: number;

  constructor(message: string, status: number, code: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const hasBody = options.body !== undefined;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError('服务响应格式异常', response.status, response.status);
  }

  if (!response.ok || payload.code !== 0) {
    throw new ApiError(payload.message || '请求失败', response.status, payload.code || response.status);
  }

  return payload.data;
}

function withQuery(path: string, query?: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function loginApp(input: { account: string; password: string }) {
  return request<AppSession>('/auth/login', {
    method: 'POST',
    body: {
      login_type: 'password',
      account: input.account,
      password: input.password,
    },
  });
}

export function logoutApp(token: string) {
  return request<{ success: boolean }>('/auth/logout', {
    method: 'POST',
    token,
  });
}

export function getHome(token?: string | null) {
  return request<HomePayload>('/home', { token });
}

export function getSubjects(query?: { version?: string }) {
  return request<SubjectItem[]>(withQuery('/subjects', query));
}

export function getGrades(query?: { version?: string; subject?: string }) {
  return request<GradeItem[]>(withQuery('/grades', query));
}

export function getVersions(query?: { subject?: string; grade?: string }) {
  return request<VersionItem[]>(withQuery('/versions', query));
}

export function getDisplaySettings() {
  return request<DisplaySettings>('/settings/display');
}

export function getSyncCourses(
  query?: {
    subject?: string;
    grade?: string;
    term?: string;
    version?: string;
    page?: number;
    page_size?: number;
  },
  token?: string | null,
) {
  return request<ListPayload<CourseSummary>>(withQuery('/courses/sync', query), { token });
}

export function searchCourses(
  query?: {
    keyword?: string;
    course_type?: string;
    subject?: string;
    grade?: string;
    version?: string;
    page?: number;
    page_size?: number;
  },
  token?: string | null,
) {
  return request<ListPayload<CourseSummary>>(withQuery('/courses/search', query), { token });
}

export function getTopicTags() {
  return request<ListPayload<TopicTag>>('/topics/tags');
}

export function getTopicCourses(
  query?: {
    tag_id?: string;
    subject?: string;
    version?: string;
    page?: number;
    page_size?: number;
  },
  token?: string | null,
) {
  return request<ListPayload<CourseSummary>>(withQuery('/courses/topics', query), { token });
}

export function getLibrary(token: string) {
  return request<LibraryOverview>('/library', { token });
}

export function getMe(token: string) {
  return request<MePayload>('/me', { token });
}

export function updateMeEmail(token: string, email: string | null) {
  return request<MePayload>('/me/account/email', {
    method: 'POST',
    token,
    body: {
      email,
    },
  });
}

export function updateMeNotificationSettings(token: string, settings: MeNotificationSettings) {
  return request<MePayload>('/me/notifications', {
    method: 'POST',
    token,
    body: settings,
  });
}

export function getMembership(token: string) {
  return request<MembershipSnapshot>('/membership', { token });
}

export function redeemMembership(token: string, code: string, requestId: string) {
  return request<RedeemResult>('/membership/redeem', {
    method: 'POST',
    token,
    headers: {
      'idempotency-key': requestId,
    },
    body: {
      code,
    },
  });
}

export function getCourseDetail(courseId: string, token?: string | null) {
  return request<CourseDetail>(`/courses/${courseId}`, { token });
}

export function favoriteCourse(token: string, courseId: string) {
  return request<FavoriteToggleResult>(`/courses/${courseId}/favorite`, {
    method: 'POST',
    token,
  });
}

export function unfavoriteCourse(token: string, courseId: string) {
  return request<FavoriteToggleResult>(`/courses/${courseId}/favorite`, {
    method: 'DELETE',
    token,
  });
}

export function getLessonPlayDetail(lessonId: string, token?: string | null) {
  return request<LessonPlayDetail>(`/lessons/${lessonId}/play`, { token });
}

export function saveLessonNote(token: string, lessonId: string, content: string) {
  return request<LessonNoteResult>(`/lessons/${lessonId}/note`, {
    method: 'POST',
    token,
    body: {
      content,
    },
  });
}

export function getAppAssetFileUrl(assetId: string, token?: string | null) {
  const resolvedToken = token ?? readSession()?.token ?? null;
  const query = resolvedToken ? `?access_token=${encodeURIComponent(resolvedToken)}` : '';
  return `${API_BASE_URL}/assets/${assetId}/file${query}`;
}

export function updateLearningProgress(
  token: string,
  input: {
    course_id: string;
    lesson_id: string;
    progress: number;
    watched_seconds: number;
  },
) {
  return request<{ updated: boolean }>('/learning/progress', {
    method: 'POST',
    token,
    body: input,
  });
}
