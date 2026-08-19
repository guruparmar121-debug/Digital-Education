import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("dep_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export function errMsg(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export async function download(path, params, filename) {
  const res = await api.get(path, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const APP_NAME = "DIGITAL EDUCATION PROGRAM";
export const APP_SUB = "Student Attendance & Learning Management System";
export const CHART_COLORS = ["#065F46", "#0D9488", "#D97706", "#4F46E5", "#0284C7", "#E11D48",
  "#8B5CF6", "#059669", "#14B8A6", "#F59E0B", "#6366F1", "#38BDF8"];
