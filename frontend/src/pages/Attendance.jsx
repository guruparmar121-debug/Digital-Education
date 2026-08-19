import { useCallback, useEffect, useState } from "react";
import { api, errMsg, download } from "@/lib/api";
import { useYear } from "@/context/YearContext";
import { useAuth } from "@/context/AuthContext";
import { PageTitle, Panel, Table, Spinner, Kpi, Chart, Progress, Badge } from "@/components/Ui";
import Filters, { useMasters, STANDARDS, Select } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Save, Percent, Users, FileSpreadsheet } from "lucide-react";

export default function Attendance() {
  const { yearId, year } = useYear();
  const { user } = useAuth();
  const { schools } = useMasters();
  const canMark = ["admin", "coordinator", "teacher"].includes(user?.role);
  const [tab, setTab] = useState(canMark ? "mark" : "dashboard");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [schoolId, setSchoolId] = useState("");
  const [standard, setStandard] = useState("");
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dash, setDash] = useState(null);
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [history, setHistory] = useState([]);
  const [low, setLow] = useState([]);
  const [threshold, setThreshold] = useState(75);

  useEffect(() => { if (user?.role === "teacher" && user.school_id) setSchoolId(user.school_id); }, [user]);

  const loadSheet = async () => {
    if (!schoolId || !standard) { toast.error("Select school and standard"); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/attendance/sheet", {
        params: { academic_year_id: yearId, date, school_id: schoolId, standard },
      });
      setSheet(data);
      if (data.students.length === 0) toast.info("No students found for this school/class");
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setLoading(false);
  };

  const setAll = (status) => setSheet({ ...sheet, students: sheet.students.map((s) => ({ ...s, status })) });
  const toggle = (sid, status) =>
    setSheet({ ...sheet, students: sheet.students.map((s) => (s.student_id === sid ? { ...s, status } : s)) });

  const save = async () => {
    const records = sheet.students.filter((s) => s.status).map((s) => ({ student_id: s.student_id, status: s.status }));
    if (!records.length) { toast.error("Mark at least one student"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/attendance", {
        academic_year_id: yearId, date, school_id: schoolId, standard, division: "", records,
      });
      toast.success(`Attendance saved for ${data.saved} students`);
      loadSheet();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setSaving(false);
  };

  const loadDash = useCallback(() => {
    if (!yearId) return;
    api.get("/dashboard/overview", { params: { academic_year_id: yearId, ...applied } })
      .then((r) => setDash(r.data)).catch(() => {});
    api.get("/attendance/history", { params: { academic_year_id: yearId, ...applied } })
      .then((r) => setHistory(r.data.slice(0, 200))).catch(() => {});
  }, [yearId, applied]);

  useEffect(() => { if (tab !== "mark") loadDash(); }, [tab, loadDash]);
  useEffect(() => {
    if (tab === "low" && yearId)
      api.get("/attendance/low", { params: { academic_year_id: yearId, threshold, ...applied } })
        .then((r) => setLow(r.data)).catch(() => {});
  }, [tab, yearId, threshold, applied]);

  const k = dash?.kpis || {};
  const c = dash?.charts || {};
  const tabs = [
    canMark && ["mark", "Mark Attendance"], ["dashboard", "Attendance Dashboard"],
    ["history", "Attendance History"], ["low", "Low Attendance"],
  ].filter(Boolean);

  return (
    <div>
      <PageTitle title="Daily Attendance" subtitle={`Academic Year ${year?.year || ""}`} />
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(([t, label]) => (
          <button key={t} data-testid={`attendance-tab-${t}`} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
              tab === t ? "bg-emerald-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "mark" && (
        <>
          <Panel title="Select class" className="mb-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[150px]">
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Date</label>
                <Input data-testid="attendance-date" type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Select testid="attendance-school" label="School" value={schoolId} onChange={setSchoolId} placeholder="Select school"
                options={schools.map((s) => ({ value: s.id, label: s.name }))} />
              <Select testid="attendance-standard" label="Standard" value={standard} onChange={setStandard} placeholder="Select class"
                options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} />
              <Button data-testid="load-attendance-button" className="h-9 bg-emerald-700 hover:bg-emerald-800" onClick={loadSheet}>Load Students</Button>
            </div>
          </Panel>

          {loading ? <Spinner /> : sheet && (
            <Panel testid="attendance-sheet-panel"
              title={`${sheet.students.length} students${sheet.already_marked ? " — already marked (editing)" : ""}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" data-testid="mark-all-present" onClick={() => setAll("present")}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" /> Mark All Present
                  </Button>
                  <Button size="sm" variant="outline" data-testid="mark-all-absent" onClick={() => setAll("absent")}>
                    <XCircle className="h-4 w-4 mr-1.5 text-rose-600" /> Mark All Absent
                  </Button>
                  <Button size="sm" data-testid="save-attendance-button" disabled={saving}
                    className="bg-emerald-700 hover:bg-emerald-800" onClick={save}>
                    <Save className="h-4 w-4 mr-1.5" /> Save Attendance
                  </Button>
                </div>
              }>
              <Table testid="attendance-table" rows={sheet.students} columns={[
                { key: "student_id", label: "Student ID" }, { key: "name", label: "Student Name" },
                { key: "gender", label: "Gender" }, { key: "division", label: "Division" },
                {
                  key: "status", label: "Present / Absent", render: (r) => (
                    <div className="flex gap-2">
                      <button data-testid={`present-${r.student_id}`} onClick={() => toggle(r.student_id, "present")}
                        className={`px-3 py-1 rounded text-xs font-bold border transition-all ${
                          r.status === "present" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"}`}>PRESENT</button>
                      <button data-testid={`absent-${r.student_id}`} onClick={() => toggle(r.student_id, "absent")}
                        className={`px-3 py-1 rounded text-xs font-bold border transition-all ${
                          r.status === "absent" ? "bg-rose-100 text-rose-800 border-rose-300"
                            : "bg-white text-slate-500 border-slate-200 hover:border-rose-300"}`}>ABSENT</button>
                    </div>
                  ),
                },
              ]} />
            </Panel>
          )}
        </>
      )}

      {tab === "dashboard" && (
        <>
          <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)}
            show={["block_id", "village_id", "school_id", "standard", "dates"]} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <Kpi testid="att-kpi-total" label="Total Students" value={k.total_students} icon={Users} />
            <Kpi testid="att-kpi-present" label="Present Records" value={k.present_students} icon={CheckCircle2} accent="teal" />
            <Kpi testid="att-kpi-absent" label="Absent Records" value={k.absent_students} icon={XCircle} accent="rose" />
            <Kpi testid="att-kpi-pct" label="Attendance %" value={k.attendance_pct} suffix="%" icon={Percent} accent="amber" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            <Chart testid="att-chart-monthly" title="Monthly Attendance" type="line" data={c.monthly_attendance} />
            <Chart testid="att-chart-school" title="School-wise Attendance %" data={c.school_attendance} />
            <Chart testid="att-chart-class" title="Class-wise Attendance %" data={c.class_attendance} />
            <Chart testid="att-chart-pie" title="Present vs Absent" type="pie" data={c.present_vs_absent} />
          </div>
        </>
      )}

      {tab === "history" && (
        <>
          <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)}
            show={["school_id", "standard", "dates"]} />
          <Panel title={`${history.length} attendance records`} testid="history-panel"
            action={<Button variant="outline" size="sm" data-testid="export-attendance-history"
              onClick={() => download("/reports/student-attendance-history/export", { academic_year_id: yearId, fmt: "excel", ...applied }, "attendance_history.xlsx")}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>}>
            <Table testid="attendance-history-table" rows={history} columns={[
              { key: "date", label: "Date" }, { key: "student_id", label: "Student ID" },
              { key: "name", label: "Student" }, { key: "school_name", label: "School" },
              { key: "standard", label: "Class", render: (r) => `Std ${r.standard}` },
              { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "present" ? "emerald" : "rose"}>{r.status}</Badge> },
              { key: "marked_by", label: "Marked By" },
            ]} />
          </Panel>
        </>
      )}

      {tab === "low" && (
        <>
          <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)}
            show={["block_id", "school_id", "standard"]}
            extra={<div className="min-w-[120px]">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Threshold %</label>
              <Input data-testid="low-attendance-threshold" type="number" className="h-9" value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>} />
          <Panel title={`${low.length} students below ${threshold}%`} testid="low-panel">
            <Table testid="low-attendance-list" rows={low} columns={[
              { key: "student_id", label: "Student ID" }, { key: "name", label: "Student" },
              { key: "school_name", label: "School" },
              { key: "standard", label: "Class", render: (r) => `Std ${r.standard}` },
              { key: "block_name", label: "Block" }, { key: "working_days", label: "Working Days" },
              { key: "present", label: "Present" }, { key: "absent", label: "Absent" },
              { key: "attendance_pct", label: "Attendance %", render: (r) => <Progress value={r.attendance_pct} /> },
            ]} />
          </Panel>
        </>
      )}
    </div>
  );
}
