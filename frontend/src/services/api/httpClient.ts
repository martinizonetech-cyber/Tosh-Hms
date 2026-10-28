import { API_BASE_URL } from '../repositories/mode';

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const ACCESS_TOKEN_KEY = 'tosh_access_token';
const REFRESH_TOKEN_KEY = 'tosh_refresh_token';

let inMemoryAccessToken: string | null = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ACCESS_TOKEN_KEY) : null;
let inMemoryRefreshToken: string | null = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(REFRESH_TOKEN_KEY) : null;
type AuthExpiredListener = () => void;
const authExpiredListeners: Set<AuthExpiredListener> = new Set();

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
  if (typeof sessionStorage !== 'undefined') {
    if (token) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }
}

export function setRefreshToken(token: string | null): void {
  inMemoryRefreshToken = token;
  if (typeof sessionStorage !== 'undefined') {
    if (token) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }
}

export function getRefreshToken(): string | null {
  if (!inMemoryRefreshToken && typeof sessionStorage !== 'undefined') {
    inMemoryRefreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return inMemoryRefreshToken;
}

export function getAccessToken(): string | null {
  if (!inMemoryAccessToken && typeof sessionStorage !== 'undefined') {
    inMemoryAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return inMemoryAccessToken;
}

export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => authExpiredListeners.delete(listener);
}

function notifyAuthExpired(): void {
  authExpiredListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

let refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const storedRefreshToken = getRefreshToken();
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: storedRefreshToken ? JSON.stringify({ refreshToken: storedRefreshToken }) : undefined,
      });
      if (!res.ok) {
        setAccessToken(null);
        setRefreshToken(null);
        notifyAuthExpired();
        return null;
      }
      const data = await res.json();
      const newToken = data.accessToken as string;
      setAccessToken(newToken);
      if (data.refreshToken) {
        setRefreshToken(data.refreshToken as string);
      }
      return newToken;
    } catch {
      setAccessToken(null);
      setRefreshToken(null);
      notifyAuthExpired();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function requestJson<TResponse>(
  path: string,
  init?: RequestInit,
  isRetry = false,
): Promise<TResponse> {
  if (!API_BASE_URL) {
    throw new ApiRequestError('Set VITE_API_BASE_URL before using API mode.', 0, 'API_BASE_URL_MISSING');
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  if (init?.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${cleanPath}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    throw new ApiRequestError(error instanceof Error ? error.message : 'Network request failed.', 0, 'NETWORK_ERROR');
  }

  // Handle 401 Unauthorized -> Refresh token & retry once
  const isAuthRoute = cleanPath.startsWith('/auth/login') || cleanPath.startsWith('/auth/refresh');
  if (response.status === 401 && !isRetry && !isAuthRoute) {
    const refreshedToken = await attemptTokenRefresh();
    if (refreshedToken) {
      return requestJson<TResponse>(path, init, true);
    }
  }

  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    throw new ApiRequestError(
      errorBody?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      errorBody?.code,
      errorBody?.details,
    );
  }

  return body as TResponse;
}
