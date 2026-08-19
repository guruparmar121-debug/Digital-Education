import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const YearCtx = createContext(null);
export const useYear = () => useContext(YearCtx);

export function YearProvider({ children }) {
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState(localStorage.getItem("dep_year") || "");

  useEffect(() => {
    api.get("/masters/academic-years").then((r) => {
      const list = r.data || [];
      setYears(list);
      setYearId((prev) => {
        if (prev && list.some((y) => y.id === prev)) return prev;
        const cur = list.find((y) => y.is_current) || list[list.length - 1];
        return cur?.id || "";
      });
    }).catch(() => {});
  }, []);

  useEffect(() => { if (yearId) localStorage.setItem("dep_year", yearId); }, [yearId]);

  const year = years.find((y) => y.id === yearId);
  const refreshYears = () => api.get("/masters/academic-years").then((r) => setYears(r.data || []));

  return <YearCtx.Provider value={{ years, yearId, setYearId, year, refreshYears }}>{children}</YearCtx.Provider>;
}
