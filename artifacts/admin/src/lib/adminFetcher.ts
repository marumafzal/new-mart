import { readCsrfFromCookie } from './adminAuthContext.js';
import { safeSessionSet } from './safeStorage';

/**
 * Typed Error for non-2xx admin fetcher responses. Replaces the previous
 * `(error as any).status = …` pattern so callers can `instanceof`
 * narrow and read the HTTP status without `any`.
 */
export class AdminFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminFetchError';
    this.status = status;
  }
}

// Global handlers set by the app
let getAccessToken: (() => string | null) | null = null;
let refreshToken: (() => Promise<string>) | null = null;

/**
 * Set up global token handlers
 * Called from the App component to connect the fetcher to the auth context
 */
export function setupAdminFetcherHandlers(
  tokenGetter: () => string | null,
  tokenRefresher: () => Promise<string>
) {
  getAccessToken = tokenGetter;
  refreshToken = tokenRefresher;
}

/**
 * Admin API fetcher with auto-refresh and CSRF protection
 * - Automatically includes Authorization header with access token
 * - Automatically includes X-CSRF-Token header by reading from cookie
 * - Automatically refreshes token on 401 and retries
 * - Redirects to login on repeated 401
 */
export async function fetchAdmin(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  if (!getAccessToken || !refreshToken) {
    throw new Error('Admin fetcher not initialized. Call setupAdminFetcherHandlers first.');
  }

  let token = getAccessToken();

  // If no token, try to refresh
  if (!token) {
    try {
      token = await refreshToken();
    } catch (err) {
      // Refresh failed - need to redirect to login
      console.error('Token refresh failed (no token):', err);
      const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = loginUrl;
      throw err;
    }
  }

  const csrf = readCsrfFromCookie();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...(options.headers as Record<string, string> | undefined),
  };

  const makeRequest = async (accessToken: string) => {
    const response = await fetch(`/api/admin${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        'Authorization': `Bearer ${accessToken}`,
      },
      credentials: 'include', // Include cookies (refresh_token, csrf_token)
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Try to refresh token once
      try {
        const newToken = await refreshToken!();
        headers['Authorization'] = `Bearer ${newToken}`;

        // Retry the request with new token
        const retryResponse = await fetch(`/api/admin${endpoint}`, {
          ...options,
          headers,
          credentials: 'include',
        });

        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }

        return retryResponse;
      } catch (err) {
        // Refresh or retry failed - redirect to login
        console.error('Token refresh failed:', err);
        const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
        safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
        window.location.href = loginUrl;
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AdminFetchError(errorData.error || `HTTP ${response.status}`, response.status);
    }

    return response;
  };

  const response = await makeRequest(token);
  return response.json();
}

/**
 * Same as fetchAdmin but takes an absolute API path (e.g. `/api/kyc/...`,
 * `/api/payments/...`) instead of being scoped to `/api/admin`.
 * Use this for admin-authenticated routes that live outside `/api/admin/*`.
 */
export async function fetchAdminAbsolute(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  if (!getAccessToken || !refreshToken) {
    throw new Error('Admin fetcher not initialized. Call setupAdminFetcherHandlers first.');
  }
  if (!path.startsWith('/')) {
    throw new Error(`fetchAdminAbsolute requires an absolute path starting with "/", got: ${path}`);
  }

  let token = getAccessToken();
  if (!token) {
    try {
      token = await refreshToken();
    } catch (err) {
      console.error('Token refresh failed (no token, absolute):', err);
      const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = loginUrl;
      throw err;
    }
  }

  const csrf = readCsrfFromCookie();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...(options.headers as Record<string, string> | undefined),
  };

  let response = await fetch(path, {
    ...options,
    headers: { ...headers, 'Authorization': `Bearer ${token}` },
    credentials: 'include',
  });

  if (response.status === 401) {
    try {
      const newToken = await refreshToken!();
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(path, { ...options, headers, credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.error('Token refresh failed (absolute):', err);
      const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = loginUrl;
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new AdminFetchError(errorData.error || `HTTP ${response.status}`, response.status);
  }

  return response.json();
}

/**
 * Same as fetchAdminAbsolute but returns the raw Response (not parsed JSON).
 * Use for binary downloads (blobs, CSV exports) while still benefiting from
 * Bearer + CSRF + auto-refresh.
 */
export async function fetchAdminAbsoluteResponse(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!getAccessToken || !refreshToken) {
    throw new Error('Admin fetcher not initialized. Call setupAdminFetcherHandlers first.');
  }
  if (!path.startsWith('/')) {
    throw new Error(`fetchAdminAbsoluteResponse requires an absolute path starting with "/", got: ${path}`);
  }

  let token = getAccessToken();
  if (!token) {
    try { token = await refreshToken(); }
    catch (err) {
      console.error('Token refresh failed (no token, response):', err);
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = `${import.meta.env.BASE_URL || '/'}login`;
      throw err;
    }
  }

  const csrf = readCsrfFromCookie();
  const baseHeaders: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...(options.headers as Record<string, string> | undefined),
  };

  let response = await fetch(path, { ...options, headers: baseHeaders, credentials: 'include' });

  if (response.status === 401) {
    try {
      const newToken = await refreshToken!();
      baseHeaders['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(path, { ...options, headers: baseHeaders, credentials: 'include' });
    } catch (err) {
      console.error('Token refresh failed (response):', err);
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = `${import.meta.env.BASE_URL || '/'}login`;
      throw new Error('Session expired. Please log in again.');
    }
  }

  return response;
}

/**
 * Read the current in-memory access token (or null). Useful for non-fetch
 * call sites such as Socket.IO `auth` payloads.
 */
export function getAdminAccessToken(): string | null {
  return getAccessToken ? getAccessToken() : null;
}

/**
 * Convenience methods for common HTTP verbs
 */
export async function adminGet(endpoint: string): Promise<any> {
  return fetchAdmin(endpoint, { method: 'GET' });
}

export async function adminPost(endpoint: string, data?: any): Promise<any> {
  return fetchAdmin(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function adminPut(endpoint: string, data?: any): Promise<any> {
  return fetchAdmin(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function adminDelete(endpoint: string): Promise<any> {
  return fetchAdmin(endpoint, { method: 'DELETE' });
}

export async function adminPatch(endpoint: string, data?: any): Promise<any> {
  return fetchAdmin(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
}
