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

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (orgId) {
      config.headers['X-Organization-Id'] = orgId;
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
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ── Interceptor: Handle 401 Refresh & Safety Logout ──────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (import.meta.env.DEV) {
      console.debug(`[API Error] ${status} ${originalRequest?.url}`, error.response?.data);
    }

    // Do not attempt refresh on auth login or refresh-token calls themselves
    if (
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/refresh-token')
    ) {
      return Promise.reject(error);
    }

    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
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
          const res = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
            refreshToken,
          });

          const data = res.data?.data || res.data;
          const newAccessToken = data?.accessToken || res.data?.accessToken;
          const newRefreshToken = data?.refreshToken || res.data?.refreshToken;

          if (newAccessToken) {
            localStorage.setItem('access_token', newAccessToken);
            if (newRefreshToken) {
              localStorage.setItem('refresh_token', newRefreshToken);
            }

            apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

            processQueue(null, newAccessToken);
            isRefreshing = false;

            return apiClient(originalRequest);
          } else {
            throw new Error('No access token returned from refresh');
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          isRefreshing = false;

          localStorage.clear();
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(refreshErr);
        }
      } else {
        isRefreshing = false;
        localStorage.clear();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  },
);
