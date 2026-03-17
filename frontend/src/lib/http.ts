import { loadSession } from './auth';
import type { ApiEnvelope } from '../types/ragflow';

const API_BASE = import.meta.env.VITE_RAGFLOW_API_BASE || '/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: BodyInit | Record<string, unknown> | null;
  headers?: HeadersInit;
  skipAuth?: boolean;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
};

function buildUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

export async function request<T>(
  path: string,
  {
    method = 'GET',
    body,
    headers,
    skipAuth = false,
    signal,
    query,
  }: RequestOptions = {},
): Promise<{ data: T; raw: ApiEnvelope<T>; response: Response }> {
  const session = loadSession();
  const requestHeaders = new Headers(headers);
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  if (!skipAuth && session?.authorization) {
    requestHeaders.set('Authorization', session.authorization);
  }

  let payload = body as BodyInit | undefined;
  if (body && !isFormData && typeof body === 'object') {
    requestHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers: requestHeaders,
    body: payload,
    signal,
  });

  const raw = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) {
    throw new Error(raw?.message || `${response.status} ${response.statusText}`);
  }
  if (typeof raw.code === 'number' && raw.code !== 0) {
    throw new Error(raw.message || `接口错误：${raw.code}`);
  }

  return {
    data: raw.data,
    raw,
    response,
  };
}

export { API_BASE, buildUrl };
