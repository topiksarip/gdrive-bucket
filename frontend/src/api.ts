import axios from "axios";

export const api = axios.create({ baseURL: "/api/v1", withCredentials: true });

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function fmtSize(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return (n / Math.pow(1024, i)).toFixed(1) + " " + u[i];
}

export function fmtTime(s: string): string {
  try { return new Date(s).toLocaleString("id-ID"); } catch { return s; }
}
