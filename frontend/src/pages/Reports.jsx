import { useEffect, useState } from "react";
import { api, errMsg, download, APP_NAME, APP_SUB } from "@/lib/api";
import { useYear } from "@/context/YearContext";
import { PageTitle, Panel, Table, Spinner, Badge } from "@/components/Ui";
import Filters from "@/components/Filters";
import { Select } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Printer, BarChart3 } from "lucide-react";

const REPORTS = [
  ["daily-attendance", "Daily Attendance Report"], ["weekly-attendance", "Weekly Attendance Report"],
  ["monthly-attendance", "Monthly Attendance Report"], ["quarterly-attendance", "Quarterly Attendance Report"],
  ["yearly-attendance", "Yearly Attendance Report"], ["student-attendance-history", "Student Attendance History"],
  ["school-wise", "School-wise Report"], ["block-wise", "Block-wise Report"], ["class-wise", "Class-wise Report"],
  ["course-progress", "Course Progress Report"], ["course-completion", "Course Completion Report"],
  ["academic-year", "Academic Year Report"], ["low-attendance", "Low Attendance Report"],
  ["low-progress", "Low Progress Report"], ["bulk-upload", "Bulk Upload Report"], ["students", "Student Master Report"],
];

export function Reports() {
  const { yearId, year } = useYear();
  const [report, setReport] = useState("monthly-attendance");
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!yearId) return;
    setLoading(true);
    api.get(`/reports/${report}`, { params: { academic_year_id: yearId, ...applied } })
      .then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [report, yearId, applied]);

  const columns = data?.rows?.length ? Object.keys(data.rows[0]).map((k) => ({ key: k, label: k })) : [];
  const params = { academic_year_id: yearId, ...applied };

  return (
    <div>
      <PageTitle title="Reports" subtitle={`${APP_SUB} — Academic Year ${year?.year || ""}`}>
        <Button variant="outline" data-testid="report-excel-button"
          onClick={() => download(`/reports/${report}/export`, { ...params, fmt: "excel" }, `${report}.xlsx`)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
        <Button variant="outline" data-testid="report-pdf-button"
          onClick={() => download(`/reports/${report}/export`, { ...params, fmt: "pdf" }, `${report}.pdf`)}>
          <FileText className="h-4 w-4 mr-2" /> PDF</Button>
        <Button variant="outline" data-testid="report-print-button" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print</Button>
      </PageTitle>

      <Panel className="mb-6" title="Select report">
        <div className="flex flex-wrap gap-2">
          {REPORTS.map(([key, label]) => (
            <button key={key} data-testid={`report-${key}`} onClick={() => setReport(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                report === key ? "bg-emerald-700 text-white border-emerald-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>{label}</button>
          ))}
        </div>
      </Panel>

      <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)}
        show={["block_id", "village_id", "school_id", "standard", "dates"]} />

      <Panel testid="report-panel"
        title={REPORTS.find(([k]) => k === report)?.[1]}
        subtitle={`${APP_NAME} • Academic Year: ${year?.year || ""} • Date Range: ${applied.date_from || "All"} to ${applied.date_to || "All"} • ${data?.count ?? 0} rows`}>
        {loading ? <Spinner /> : <Table testid="report-table" columns={columns} rows={data?.rows?.slice(0, 500) || []} />}
      </Panel>
    </div>
  );
}

export function YearComparison() {
  const { years } = useYear();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (years.length >= 2 && !a) { setA(years[years.length - 2].id); setB(years[years.length - 1].id); }
  }, [years, a]);

  const compare = () => {
    if (!a || !b) return;
    setLoading(true);
    api.get("/dashboard/year-comparison", { params: { year_a: a, year_b: b } })
      .then((r) => setRows(r.data.rows)).catch((e) => toast.error(errMsg(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (a && b) compare(); }, [a, b]);

  const labelA = years.find((y) => y.id === a)?.year || "Year A";
  const labelB = years.find((y) => y.id === b)?.year || "Year B";
  const opts = years.map((y) => ({ value: y.id, label: y.year }));

  return (
    <div>
      <PageTitle title="Year Comparison Dashboard" subtitle="Compare programme KPIs across two academic years" />
      <Panel className="mb-6" title="Select academic years">
        <div className="flex flex-wrap items-end gap-3">
          <Select testid="compare-year-a" label="Academic Year A" value={a} onChange={setA} placeholder="Select" options={opts} />
          <span className="pb-2 font-display font-bold text-slate-400">vs</span>
          <Select testid="compare-year-b" label="Academic Year B" value={b} onChange={setB} placeholder="Select" options={opts} />
          <Button data-testid="compare-button" className="h-9 bg-emerald-700 hover:bg-emerald-800" onClick={compare}>
            <BarChart3 className="h-4 w-4 mr-2" /> Compare</Button>
        </div>
      </Panel>
      <Panel title={`${labelA} vs ${labelB}`} testid="comparison-panel">
        {loading ? <Spinner /> : <Table testid="comparison-table" rows={rows} columns={[
          { key: "kpi", label: "KPI" },
          { key: "year_a", label: labelA },
          { key: "year_b", label: labelB },
          {
            key: "change_pct", label: "Change %", render: (r) => (
              <Badge tone={r.change_pct > 0 ? "emerald" : r.change_pct < 0 ? "rose" : "slate"}>
                {r.change_pct > 0 ? "+" : ""}{r.change_pct}%
              </Badge>
            ),
          },
        ]} />}
      </Panel>
    </div>
  );
}
