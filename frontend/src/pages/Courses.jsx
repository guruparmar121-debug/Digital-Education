import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useYear } from "@/context/YearContext";
import { PageTitle, Panel, Table, Spinner, Badge, Kpi, Chart, Progress } from "@/components/Ui";
import Filters, { useMasters, STANDARDS, Select } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, BookOpen, Users, TrendingUp, Award, CheckCircle2, Clock, CircleOff } from "lucide-react";

const blankCourse = { course_code: "", name: "", subject: "", description: "", standard: "", school_id: "", total_modules: 3, total_lessons: 12, duration: "", start_date: "", end_date: "", status: "active" };

export function Courses() {
  const { yearId, year } = useYear();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { schools } = useMasters();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankCourse);
  const [editing, setEditing] = useState(null);
  const [assign, setAssign] = useState(null);
  const [assignForm, setAssignForm] = useState({ school_id: "", standard: "" });

  const load = useCallback(() => {
    if (!yearId) return;
    setLoading(true);
    api.get("/courses", { params: { academic_year_id: yearId } })
      .then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [yearId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const payload = { ...form, academic_year_id: yearId, total_lessons: Number(form.total_lessons) || 1, total_modules: Number(form.total_modules) || 1 };
      if (!payload.name || !payload.course_code) { toast.error("Course ID and Name are required"); return; }
      if (editing) await api.put(`/courses/${editing}`, payload); else await api.post("/courses", payload);
      toast.success(editing ? "Course updated" : "Course created");
      setOpen(false); setEditing(null); setForm(blankCourse); load();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  const doAssign = async () => {
    try {
      const { data } = await api.post("/courses/assign", {
        course_id: assign.id, academic_year_id: yearId,
        school_id: assignForm.school_id || null, standard: assignForm.standard || null,
      });
      toast.success(`Assigned to ${data.assigned} students`);
      setAssign(null); load();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageTitle title="Course Management" subtitle={`Courses for Academic Year ${year?.year || ""}`}>
        {isAdmin && <Button data-testid="add-course-button" className="bg-emerald-700 hover:bg-emerald-800"
          onClick={() => { setEditing(null); setForm(blankCourse); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Course</Button>}
      </PageTitle>

      <Panel title={`${rows.length} courses`} testid="courses-panel">
        {loading ? <Spinner /> : <Table testid="courses-table" rows={rows} columns={[
          { key: "course_code", label: "Course ID" }, { key: "name", label: "Course Name" },
          { key: "subject", label: "Subject" }, { key: "standard", label: "Standard", render: (r) => r.standard || "All" },
          { key: "school_name", label: "School" }, { key: "total_modules", label: "Modules" },
          { key: "total_lessons", label: "Lessons" }, { key: "duration", label: "Duration" },
          { key: "enrolled", label: "Enrolled" },
          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "active" ? "emerald" : "slate"}>{r.status}</Badge> },
          ...(isAdmin ? [{
            key: "actions", label: "Actions", render: (r) => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" data-testid={`edit-course-${r.course_code}`}
                  onClick={() => { setEditing(r.id); setForm({ ...blankCourse, ...r }); setOpen(true); }}>Edit</Button>
                <Button size="sm" variant="outline" data-testid={`assign-course-${r.course_code}`}
                  onClick={() => { setAssign(r); setAssignForm({ school_id: "", standard: "" }); }}>Assign</Button>
                <Button size="sm" variant="outline" data-testid={`deactivate-course-${r.course_code}`}
                  onClick={async () => { await api.delete(`/courses/${r.id}`); toast.success("Course deactivated"); load(); }}>Deactivate</Button>
              </div>
            ),
          }] : []),
        ]} />}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="course-form-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit Course" : "Add Course"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            {[["course_code", "Course ID"], ["name", "Course Name"], ["subject", "Subject"],
              ["duration", "Duration"], ["total_modules", "Total Modules", "number"],
              ["total_lessons", "Total Lessons", "number"], ["start_date", "Start Date", "date"],
              ["end_date", "End Date", "date"], ["description", "Description"]].map(([k, label, type]) => (
              <div key={k} className={`space-y-1.5 ${k === "description" ? "sm:col-span-2" : ""}`}>
                <Label>{label}</Label>
                <Input data-testid={`course-field-${k}`} type={type || "text"} value={form[k] ?? ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1.5"><Label>Standard</Label>
              <Select testid="course-field-standard" value={form.standard} onChange={(v) => setForm({ ...form, standard: v })}
                placeholder="All standards" options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} /></div>
            <div className="space-y-1.5"><Label>School</Label>
              <Select testid="course-field-school" value={form.school_id} onChange={(v) => setForm({ ...form, school_id: v })}
                placeholder="All schools" options={schools.map((s) => ({ value: s.id, label: s.name }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="save-course-button" className="bg-emerald-700 hover:bg-emerald-800" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assign} onOpenChange={() => setAssign(null)}>
        <DialogContent data-testid="assign-course-dialog">
          <DialogHeader><DialogTitle>Assign “{assign?.name}”</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Leave filters empty to assign to every student in the academic year.</p>
          <div className="grid gap-4 mt-2">
            <Select testid="assign-school" label="School" value={assignForm.school_id}
              onChange={(v) => setAssignForm({ ...assignForm, school_id: v })}
              options={schools.map((s) => ({ value: s.id, label: s.name }))} />
            <Select testid="assign-standard" label="Standard" value={assignForm.standard}
              onChange={(v) => setAssignForm({ ...assignForm, standard: v })}
              options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssign(null)}>Cancel</Button>
            <Button data-testid="confirm-assign-button" className="bg-emerald-700 hover:bg-emerald-800" onClick={doAssign}>Assign Course</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CourseProgress() {
  const { yearId, year } = useYear();
  const { user } = useAuth();
  const canEdit = ["admin", "coordinator", "teacher"].includes(user?.role);
  const [courses, setCourses] = useState([]);
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [rows, setRows] = useState([]);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(50);
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => { if (yearId) api.get("/courses", { params: { academic_year_id: yearId } }).then((r) => setCourses(r.data)).catch(() => {}); }, [yearId]);

  const load = useCallback(() => {
    if (!yearId) return;
    setLoading(true);
    const params = { academic_year_id: yearId, ...applied };
    if (lowOnly) params.max_progress = threshold;
    api.get("/course-progress", { params }).then((r) => setRows(r.data.slice(0, 500))).catch(() => {}).finally(() => setLoading(false));
    api.get("/dashboard/course-progress", { params: { academic_year_id: yearId, ...applied } })
      .then((r) => setDash(r.data)).catch(() => {});
  }, [yearId, applied, lowOnly, threshold]);
  useEffect(() => { load(); }, [load]);

  const update = async (r, val) => {
    try {
      await api.put(`/course-progress/${r.id}`, { completed_lessons: Number(val) });
      toast.success("Progress updated");
      load();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  const k = dash?.kpis || {}; const c = dash?.charts || {};
  return (
    <div>
      <PageTitle title="Course Progress" subtitle={`Student learning progress — ${year?.year || ""}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <Kpi testid="cp-kpi-courses" label="Total Courses" value={k.total_courses} icon={BookOpen} />
        <Kpi testid="cp-kpi-active" label="Active Courses" value={k.active_courses} icon={BookOpen} accent="teal" />
        <Kpi testid="cp-kpi-enrolled" label="Enrolled Students" value={k.enrolled_students} icon={Users} accent="indigo" />
        <Kpi testid="cp-kpi-avg" label="Average Progress" value={k.avg_progress_pct} suffix="%" icon={TrendingUp} accent="amber" />
        <Kpi testid="cp-kpi-completion" label="Completion Rate" value={k.course_completion_pct} suffix="%" icon={Award} accent="violet" />
        <Kpi testid="cp-kpi-completed" label="Completed" value={k.completed_students} icon={CheckCircle2} />
        <Kpi testid="cp-kpi-inprogress" label="In Progress" value={k.in_progress_students} icon={Clock} accent="sky" />
        <Kpi testid="cp-kpi-notstarted" label="Not Started" value={k.not_started_students} icon={CircleOff} accent="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
        <Chart testid="cp-chart-course" title="Course-wise Progress %" data={c.course_progress} />
        <Chart testid="cp-chart-school" title="School-wise Progress %" data={c.school_progress} />
        <Chart testid="cp-chart-class" title="Class-wise Progress %" data={c.class_progress} />
        <Chart testid="cp-chart-monthly" title="Monthly Progress %" type="line" data={c.monthly_progress} />
        <Chart testid="cp-chart-completion" title="Course Completion" type="pie" data={c.course_completion} />
        <Chart testid="cp-chart-top" title="Top Students" data={c.top_students} />
      </div>

      <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)} courses={courses}
        show={["block_id", "school_id", "standard", "course_id"]}
        extra={<>
          <div className="min-w-[120px]">
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Low Progress %</label>
            <Input data-testid="low-progress-threshold" type="number" className="h-9" value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 h-9">
            <input data-testid="low-progress-toggle" type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low progress only
          </label>
        </>} />

      <Panel title={`${rows.length} progress records`} testid="progress-panel">
        {loading ? <Spinner /> : <Table testid="progress-table" rows={rows} columns={[
          { key: "student_id", label: "Student ID" }, { key: "name", label: "Student" },
          { key: "school_name", label: "School" }, { key: "standard", label: "Class", render: (r) => `Std ${r.standard}` },
          { key: "course_name", label: "Course" }, { key: "total_lessons", label: "Total" },
          { key: "completed_lessons", label: "Completed" }, { key: "pending_lessons", label: "Pending" },
          { key: "progress_pct", label: "Progress", render: (r) => <Progress value={r.progress_pct} /> },
          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "completed" ? "emerald" : r.status === "in_progress" ? "amber" : "slate"}>{r.status.replace("_", " ")}</Badge> },
          { key: "last_activity", label: "Last Activity" },
          ...(canEdit ? [{
            key: "actions", label: "Update Lessons", render: (r) => (
              <Input data-testid={`progress-input-${r.id}`} type="number" defaultValue={r.completed_lessons}
                className="h-8 w-20" onBlur={(e) => e.target.value !== String(r.completed_lessons) && update(r, e.target.value)} />
            ),
          }] : []),
        ]} />}
      </Panel>
    </div>
  );
}
