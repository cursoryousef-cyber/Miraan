import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://miran-backend-staging.onrender.com/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Interceptor: Attach JWT Token & Active Org Context ──────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    const orgId = localStorage.getItem('active_org_id');

    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (orgId) config.headers['X-Organization-Id'] = orgId;

    // Canonical hospital assignment contract:
    // the trainee-distribution screen and the trainer-card "إسناد متدرب"
    // action must both write through the same TraineeAllocation path.
    // Older trainer-card builds still call the legacy PATCH endpoint, so
    // transparently route it to the canonical POST endpoint.
    if (
      config.url?.includes('/training-requests/trainees/') &&
      config.url?.includes('/hospital-review/assignment')
    ) {
      config.url = config.url.replace('/hospital-review/assignment', '/allocations/department');
      config.method = 'post';
      config.headers['X-Miran-Assignment-Source'] = 'trainer-card-legacy';
    }

    // Department IDs are UUIDs. Never send legacy numeric department codes to
    // the canonical endpoint. The backend remains the authority for validating
    // the resulting department/trainer relationship.
    if (
      config.url?.includes('/training-requests/trainees/') &&
      config.url?.includes('/allocations/department') &&
      config.data &&
      typeof config.data === 'object'
    ) {
      const departmentId = config.data.departmentId;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (departmentId && !uuid.test(String(departmentId))) {
        delete config.data.departmentId;
      }
      if (!config.data.reason) {
        config.data.reason = 'إسناد المتدرب لقسم ومدرب داخل المستشفى';
      }
    }

    if (import.meta.env.DEV) {
      console.debug(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
        hasToken: Boolean(token),
        orgId,
      });
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Queue state for handling concurrent 401 requests during token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else if (token) prom.resolve(token);
  });
  failedQueue = [];
};

// ── Interceptor: Handle 401 Refresh & Safety Logout ─────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    // Notify mounted training screens that the canonical allocation changed.
    if (
      response.config.url?.includes('/training-requests/trainees/') &&
      response.config.url?.includes('/allocations/department')
    ) {
      const match = response.config.url.match(/\/training-requests\/trainees\/([^/]+)\//);
      if (match?.[1]) {
        window.dispatchEvent(
          new CustomEvent('miran:training-assignment-changed', {
            detail: { traineeRowId: match[1] },
          }),
        );
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const endpoint = originalRequest?.url || '';

    if (import.meta.env.DEV) {
      console.debug(`[API Status] ${status} on ${endpoint}`, {
        refreshed: Boolean(originalRequest?._retry),
      });
    }

    if (
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/refresh-token') ||
      endpoint.includes('/auth/activate')
    ) {
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          // Standard post to refresh-token without passing auth header
          const res = await axios.post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken }, {
            headers: { 'Content-Type': 'application/json' },
          });

          const data = res.data?.data || res.data;
          const newAccessToken = data?.accessToken || data?.tokens?.accessToken;
          const newRefreshToken = data?.refreshToken || data?.tokens?.refreshToken;

          if (!newAccessToken) {
            throw new Error('No access token returned from refresh endpoint');
          }

          if (import.meta.env.DEV) {
            console.debug(`[Auth Refresh] Token successfully refreshed for ${endpoint}`);
          }

          localStorage.setItem('access_token', newAccessToken);
          if (newRefreshToken) {
            localStorage.setItem('refresh_token', newRefreshToken);
          }
          apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

          processQueue(null, newAccessToken);
          isRefreshing = false;
          return apiClient(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          isRefreshing = false;

          // Clear auth tokens only on definitive refresh failure
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('active_org_id');
          localStorage.removeItem('user_profile');
          delete apiClient.defaults.headers.common.Authorization;

          window.dispatchEvent(new Event('auth:logout'));
          if (window.location.pathname !== '/login' && window.location.pathname !== '/activate') {
            window.location.href = '/login';
          }
          return Promise.reject(refreshErr);
        }
      }

      isRefreshing = false;
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('active_org_id');
      localStorage.removeItem('user_profile');
      delete apiClient.defaults.headers.common.Authorization;

      window.dispatchEvent(new Event('auth:logout'));
      if (window.location.pathname !== '/login' && window.location.pathname !== '/activate') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
