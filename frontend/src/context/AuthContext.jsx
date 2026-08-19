import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, errMsg } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.access_token) localStorage.setItem("dep_token", data.access_token);
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: errMsg(e.response?.data?.detail) || e.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
    localStorage.removeItem("dep_token");
    setUser(false);
  }, []);

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}
