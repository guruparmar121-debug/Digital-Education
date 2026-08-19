import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useYear } from "@/context/YearContext";
import { useAuth } from "@/context/AuthContext";
import { PageTitle, Panel, Kpi, Chart, Table, Spinner, Progress, Badge } from "@/components/Ui";
import { CalendarCheck, CheckCircle2, XCircle, Percent, BookOpen, Award, Clock, CircleOff } from "lucide-react";

export default function StudentDashboard() {
  const { studentCode } = useParams();
  const { user } = useAuth();
  const { yearId, year } = useYear();
  const code = studentCode || user?.student_code;
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!yearId || !code) return;
    setLoading(true);
    api.get(`/dashboard/student/${code}`, { params: { academic_year_id: yearId } })
      .then((r) => setD(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [code, yearId]);

  if (loading) return <Spinner />;
  if (!d) return <Panel title="Student Dashboard">No data for this academic year.</Panel>;
  const p = d.profile, a = d.attendance, c = d.courses;

  return (
    <div data-testid="student-dashboard">
      <PageTitle title={p.name || "Student Dashboard"} subtitle={`Student ID ${p.student_id || code} — Academic Year ${year?.year || ""}`} />

      <Panel title="Student Profile" className="mb-6" testid="student-profile">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[["Student ID", p.student_id], ["Gender", p.gender], ["Date of Birth", p.dob],
            ["Standard", p.standard ? `Std ${p.standard}${p.division ? "-" + p.division : ""}` : "—"],
            ["School", p.school_name], ["Village", p.village_name], ["Block", p.block_name],
            ["Parent", p.parent_name], ["Parent Mobile", p.parent_mobile],
            ["Academic Year", year?.year], ["Status", p.status]].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{val || "—"}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-6">
        <Kpi testid="sd-kpi-working-days" label="Working Days" value={a.working_days} icon={CalendarCheck} />
        <Kpi testid="sd-kpi-present" label="Present" value={a.present} icon={CheckCircle2} accent="teal" />
        <Kpi testid="sd-kpi-absent" label="Absent" value={a.absent} icon={XCircle} accent="rose" />
        <Kpi testid="sd-kpi-attendance" label="Attendance %" value={a.attendance_pct} suffix="%" icon={Percent} accent="amber" />
        <Kpi testid="sd-kpi-courses" label="Total Courses" value={c.total} icon={BookOpen} accent="indigo" />
        <Kpi testid="sd-kpi-completed" label="Completed" value={c.completed} icon={Award} />
        <Kpi testid="sd-kpi-inprogress" label="In Progress" value={c.in_progress} icon={Clock} accent="sky" />
        <Kpi testid="sd-kpi-notstarted" label="Not Started" value={c.not_started} icon={CircleOff} accent="rose" />
      </div>

      <Panel title="Overall Course Progress" className="mb-6" testid="sd-overall-progress">
        <Progress value={c.overall_pct} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
        <Chart testid="sd-chart-monthly" title="Monthly Attendance %" type="line" data={d.charts.monthly_attendance} />
        <Chart testid="sd-chart-pie" title="Present vs Absent" type="pie" data={d.charts.present_vs_absent} />
        <Chart testid="sd-chart-course" title="Course Progress %" data={d.charts.course_progress.map((r) => ({ name: r.course_name, value: r.value }))} />
        <Chart testid="sd-chart-trend" title="Attendance Trend (last 30 records)" type="line" data={d.charts.trend} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="My Courses" testid="sd-courses-panel">
          <Table testid="sd-courses-table" rows={d.progress_rows} columns={[
            { key: "course_name", label: "Course" }, { key: "subject", label: "Subject" },
            { key: "completed_lessons", label: "Completed" }, { key: "total_lessons", label: "Total" },
            { key: "value", label: "Progress", render: (r) => <Progress value={r.value} /> },
            { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "completed" ? "emerald" : r.status === "in_progress" ? "amber" : "slate"}>{r.status.replace("_", " ")}</Badge> },
          ]} />
        </Panel>
        <Panel title="Recent Attendance" testid="sd-attendance-panel">
          <Table testid="sd-attendance-table" rows={d.attendance_rows} columns={[
            { key: "date", label: "Date" },
            { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "present" ? "emerald" : "rose"}>{r.status}</Badge> },
            { key: "standard", label: "Class", render: (r) => `Std ${r.standard}` },
            { key: "marked_by", label: "Marked By" },
          ]} />
        </Panel>
      </div>
    </div>
  );
}
