import { clearAdminSession, readAdminSession } from '@/components/admin/lib/session';

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
  request_id: string;
};

export type Pagination = {
  page: number;
  page_size: number;
  total: number;
};

export type ListPayload<T> = {
  list: T[];
  pagination: Pagination;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(message: string, status: number, code: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL?.trim() || getDefaultApiBaseUrl('admin');

function getDefaultApiBaseUrl(kind: 'app' | 'admin') {
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    return `${protocol}//${hostname}:3000/api/v1/${kind}`;
  }

  return `http://127.0.0.1:3000/api/v1/${kind}`;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    rawBody?: BodyInit;
  } = {},
) {
  const session = readAdminSession();
  const headers = new Headers(options.headers);
  const requestBody = options.rawBody ?? options.body;
  const isRawBody = options.rawBody !== undefined;

  if (!headers.has('Content-Type') && options.body !== undefined && !isRawBody) {
    headers.set('Content-Type', 'application/json');
  }

  if (session?.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body:
      requestBody === undefined
        ? undefined
        : isRawBody
          ? options.rawBody
          : JSON.stringify(options.body),
    cache: 'no-store',
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || payload.code !== 0) {
    if (response.status === 401) {
      clearAdminSession();
    }

    throw new ApiError(payload.message || '请求失败', response.status, payload.code ?? response.status);
  }

  return payload.data;
}

export function getAssetFileUrl(assetId: string) {
  const token = readAdminSession()?.token;
  const query = token ? `?access_token=${encodeURIComponent(token)}` : '';
  return `${API_BASE.replace(/\/$/, '')}/assets/${assetId}/file${query}`;
}

export function toQueryString(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    query.set(key, String(value));
  });

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
