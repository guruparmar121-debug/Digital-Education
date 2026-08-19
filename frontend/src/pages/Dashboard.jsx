import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useYear } from "@/context/YearContext";
import { useAuth } from "@/context/AuthContext";
import { Kpi, Chart, PageTitle, Panel, Spinner, Table, Progress } from "@/components/Ui";
import Filters from "@/components/Filters";
import { useDrilldown } from "@/components/Drilldown";
import {
  Users, School, MapPin, Home, UserCog, BookOpen, CheckCircle2, XCircle, Percent,
  TrendingUp, Award, AlertTriangle, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { yearId, year } = useYear();
  const { user } = useAuth();
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [low, setLow] = useState([]);
  const { open: drill, dialog: drillDialog } = useDrilldown(yearId, applied);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get("/dashboard/overview", { params: { academic_year_id: yearId, ...applied } })
      .then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e.response?.data?.detail)))
      .finally(() => setLoading(false));
    api.get("/attendance/low", { params: { academic_year_id: yearId, threshold: 75, ...applied } })
      .then((r) => setLow(r.data.slice(0, 10))).catch(() => {});
  }, [yearId, applied]);

  if (loading && !data) return <Spinner />;
  const k = data?.kpis || {};
  const c = data?.charts || {};
  const title = user?.role === "management" ? "Management Dashboard" : "Overall Dashboard";
  return (
    <div>
      <PageTitle title={title} subtitle={`Academic Year ${year?.year || ""} — consolidated programme performance`} />
      <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)}
        show={["block_id", "village_id", "school_id", "standard", "gender", "dates"]} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 mb-8">
        <Kpi testid="kpi-total-students" label="Total Students" value={k.total_students} icon={Users} />
        <Kpi testid="kpi-total-schools" label="Total Schools" value={k.total_schools} icon={School} accent="teal" />
        <Kpi testid="kpi-total-blocks" label="Total Blocks" value={k.total_blocks} icon={MapPin} accent="indigo" />
        <Kpi testid="kpi-total-villages" label="Total Villages" value={k.total_villages} icon={Home} accent="sky" />
        <Kpi testid="kpi-total-teachers" label="Total Teachers" value={k.total_teachers} icon={UserCog} accent="amber" />
        <Kpi testid="kpi-total-courses" label="Total Courses" value={k.total_courses} icon={BookOpen} accent="violet" />
        <Kpi testid="kpi-present-students" label="Present (records)" value={k.present_students} icon={CheckCircle2} />
        <Kpi testid="kpi-absent-students" label="Absent (records)" value={k.absent_students} icon={XCircle} accent="rose" />
        <Kpi testid="kpi-attendance-pct" label="Attendance %" value={k.attendance_pct} suffix="%" icon={Percent} accent="teal" />
        <Kpi testid="kpi-avg-progress" label="Avg Course Progress" value={k.avg_progress_pct} suffix="%" icon={TrendingUp} accent="indigo" />
        <Kpi testid="kpi-course-completion" label="Course Completion" value={k.course_completion_pct} suffix="%" icon={Award} accent="amber" />
        <Kpi testid="kpi-low-attendance" label="Low Attendance Students" value={k.low_attendance_students} icon={AlertTriangle} accent="rose" />
        <Kpi testid="kpi-low-progress" label="Low Progress Students" value={k.low_progress_students} icon={AlertCircle} accent="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
        <Chart testid="chart-block-students" title="Block-wise Students" data={c.block_students} onClick={drill("block_students", "Students in block")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-school-students" title="School-wise Students" data={c.school_students} onClick={drill("school_students", "Students in school")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-class-students" title="Class-wise Students" data={c.class_students} onClick={drill("class_students", "Students in class")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-gender-students" title="Student Count by Gender" type="pie" data={c.gender_students} onClick={drill("gender_students", "Students")} />
        <Chart testid="chart-monthly-attendance" title="Monthly Attendance Trend" type="line" data={c.monthly_attendance} subtitle="Attendance %" />
        <Chart testid="chart-school-attendance" title="School-wise Attendance %" data={c.school_attendance} onClick={drill("school_attendance", "Attendance in school")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-class-attendance" title="Class-wise Attendance %" data={c.class_attendance} onClick={drill("class_attendance", "Attendance in class")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-present-absent" title="Present vs Absent" type="pie" data={c.present_vs_absent} onClick={drill("present_vs_absent", "Attendance records")} />
        <Chart testid="chart-course-progress" title="Course-wise Progress %" data={c.course_progress} onClick={drill("course_progress", "Course")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-school-progress" title="School-wise Course Progress %" data={c.school_progress} onClick={drill("school_progress", "Progress in school")} subtitle="Click a bar to see the students" />
        <Chart testid="chart-monthly-progress" title="Monthly Course Progress %" type="line" data={c.monthly_progress} />
        <Chart testid="chart-course-completion" title="Course Completion Split" type="pie" data={c.course_completion} onClick={drill("course_completion", "Courses")} />
      </div>

      <Panel title="Low Attendance Students (below 75%)" testid="low-attendance-panel">
        <Table testid="low-attendance-table" rows={low} columns={[
          { key: "student_id", label: "Student ID" }, { key: "name", label: "Student" },
          { key: "school_name", label: "School" },
          { key: "standard", label: "Class", render: (r) => `Std ${r.standard}` },
          { key: "block_name", label: "Block" }, { key: "working_days", label: "Working Days" },
          { key: "present", label: "Present" }, { key: "absent", label: "Absent" },
          { key: "attendance_pct", label: "Attendance %", render: (r) => <Progress value={r.attendance_pct} /> },
        ]} />
      </Panel>
      {drillDialog}
    </div>
  );
}
