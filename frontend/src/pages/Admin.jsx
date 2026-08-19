import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useYear } from "@/context/YearContext";
import { PageTitle, Panel, Table, Badge, Spinner } from "@/components/Ui";
import { Select, useMasters, STANDARDS } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Star } from "lucide-react";

export function AcademicYears() {
  const { user } = useAuth();
  const { years, refreshYears, setYearId } = useYear();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ year: "", start_date: "", end_date: "", status: "active" });
  const [editing, setEditing] = useState(null);

  const save = async () => {
    try {
      if (editing) await api.put(`/masters/academic-years/${editing}`, form);
      else await api.post("/masters/academic-years", form);
      toast.success("Academic year saved");
      setOpen(false); setEditing(null); refreshYears();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  const setCurrent = async (id) => {
    try {
      await api.post(`/masters/academic-years/${id}/set-current`);
      toast.success("Current academic year updated");
      setYearId(id); refreshYears();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageTitle title="Academic Year Management" subtitle="All data in the system is separated by academic year">
        {isAdmin && <Button data-testid="add-year-button" className="bg-emerald-700 hover:bg-emerald-800"
          onClick={() => { setEditing(null); setForm({ year: "", start_date: "", end_date: "", status: "active" }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Academic Year</Button>}
      </PageTitle>

      <Panel title={`${years.length} academic years`} testid="years-panel">
        <Table testid="years-table" rows={years} columns={[
          { key: "year", label: "Academic Year", render: (r) => <span className="font-mono font-bold">{r.year}</span> },
          { key: "start_date", label: "Start Date" }, { key: "end_date", label: "End Date" },
          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "active" ? "emerald" : "slate"}>{r.status}</Badge> },
          { key: "is_current", label: "Current Year", render: (r) => r.is_current ? <Badge tone="amber">Current</Badge> : "—" },
          ...(isAdmin ? [{
            key: "actions", label: "Actions", render: (r) => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" data-testid={`edit-year-${r.year}`}
                  onClick={() => { setEditing(r.id); setForm(r); setOpen(true); }}>Edit</Button>
                <Button size="sm" variant="outline" data-testid={`toggle-year-${r.year}`}
                  onClick={async () => {
                    await api.put(`/masters/academic-years/${r.id}`, { status: r.status === "active" ? "inactive" : "active" });
                    toast.success("Status updated"); refreshYears();
                  }}>{r.status === "active" ? "Deactivate" : "Activate"}</Button>
                {!r.is_current && <Button size="sm" data-testid={`set-current-${r.year}`}
                  className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setCurrent(r.id)}>
                  <Star className="h-3.5 w-3.5 mr-1" /> Set Current</Button>}
              </div>
            ),
          }] : []),
        ]} />
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="year-form-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit Academic Year" : "Add Academic Year"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5"><Label>Academic Year (e.g. 2028-29)</Label>
              <Input data-testid="year-field-year" value={form.year || ""} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Start Date</Label>
              <Input data-testid="year-field-start" type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End Date</Label>
              <Input data-testid="year-field-end" type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select testid="year-field-status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} placeholder="Select"
                options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="save-year-button" className="bg-emerald-700 hover:bg-emerald-800" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Promotion() {
  const { years } = useYear();
  const { schools } = useMasters();
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [standard, setStandard] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [target, setTarget] = useState({ to_standard: "", to_division: "", to_school_id: "" });
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => { api.get("/promotions").then((r) => setHistory(r.data.slice(0, 100))).catch(() => {}); }, []);

  const load = async () => {
    if (!fromYear) { toast.error("Select the source academic year"); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/students", { params: { academic_year_id: fromYear, school_id: schoolId, standard } });
      setRows(data); setSelected(data.map((r) => r.student_id));
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setLoading(false);
  };

  const promote = async () => {
    if (!toYear || !selected.length) { toast.error("Select target year and students"); return; }
    try {
      const { data } = await api.post("/promotions", {
        from_year_id: fromYear, to_year_id: toYear, student_ids: selected,
        to_standard: target.to_standard || null, to_division: target.to_division || null,
        to_school_id: target.to_school_id || null,
      });
      toast.success(`${data.promoted} students promoted, ${data.skipped} skipped`);
      api.get("/promotions").then((r) => setHistory(r.data.slice(0, 100)));
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  const yearOpts = years.map((y) => ({ value: y.id, label: y.year }));
  return (
    <div>
      <PageTitle title="Student Promotion" subtitle="Promote students to the next academic year — previous records are always retained" />
      <Panel title="Select students" className="mb-6" testid="promotion-filters">
        <div className="flex flex-wrap items-end gap-3">
          <Select testid="promotion-from-year" label="From Academic Year" value={fromYear} onChange={setFromYear} placeholder="Select" options={yearOpts} />
          <Select testid="promotion-school" label="School" value={schoolId} onChange={setSchoolId} options={schools.map((s) => ({ value: s.id, label: s.name }))} />
          <Select testid="promotion-standard" label="Standard" value={standard} onChange={setStandard} options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} />
          <Button data-testid="load-promotion-students" className="h-9 bg-emerald-700 hover:bg-emerald-800" onClick={load}>Load Students</Button>
        </div>
      </Panel>

      <Panel title="Promotion target" className="mb-6" testid="promotion-target">
        <div className="flex flex-wrap items-end gap-3">
          <Select testid="promotion-to-year" label="To Academic Year" value={toYear} onChange={setToYear} placeholder="Select" options={yearOpts} />
          <Select testid="promotion-to-standard" label="New Standard (blank = next)" value={target.to_standard}
            onChange={(v) => setTarget({ ...target, to_standard: v })} options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} />
          <div className="min-w-[110px]"><label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">New Division</label>
            <Input data-testid="promotion-to-division" className="h-9" value={target.to_division}
              onChange={(e) => setTarget({ ...target, to_division: e.target.value })} /></div>
          <Select testid="promotion-to-school" label="New School (optional)" value={target.to_school_id}
            onChange={(v) => setTarget({ ...target, to_school_id: v })} options={schools.map((s) => ({ value: s.id, label: s.name }))} />
          <Button data-testid="promote-button" className="h-9 bg-emerald-700 hover:bg-emerald-800" onClick={promote}>
            Promote {selected.length} Students
          </Button>
        </div>
      </Panel>

      <Panel title={`${rows.length} students in source year`} className="mb-6" testid="promotion-list">
        {loading ? <Spinner /> : <Table testid="promotion-table" rows={rows} columns={[
          {
            key: "sel", label: "Select", render: (r) => (
              <input data-testid={`promote-check-${r.student_id}`} type="checkbox" checked={selected.includes(r.student_id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, r.student_id] : selected.filter((s) => s !== r.student_id))} />
            ),
          },
          { key: "student_id", label: "Student ID" }, { key: "name", label: "Name" },
          { key: "standard", label: "Current Class", render: (r) => `Std ${r.standard}` },
          { key: "school_name", label: "School" },
        ]} />}
      </Panel>

      <Panel title="Promotion history" testid="promotion-history">
        <Table testid="promotion-history-table" rows={history} columns={[
          { key: "created_at", label: "Date", render: (r) => r.created_at?.slice(0, 19).replace("T", " ") },
          { key: "student_id", label: "Student ID" }, { key: "from_standard", label: "From Class" },
          { key: "to_standard", label: "To Class" }, { key: "promoted_by", label: "By" },
        ]} />
      </Panel>
    </div>
  );
}

export function Users() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "teacher" });
  const [editing, setEditing] = useState(null);
  const { schools } = useMasters();

  const load = useCallback(() => { api.get("/users").then((r) => setRows(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editing) await api.put(`/users/${editing}`, form); else await api.post("/users", form);
      toast.success("User saved"); setOpen(false); setEditing(null); load();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageTitle title="User Management" subtitle="Role-based access accounts">
        <Button data-testid="add-user-button" className="bg-emerald-700 hover:bg-emerald-800"
          onClick={() => { setEditing(null); setForm({ name: "", email: "", password: "", role: "teacher" }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add User</Button>
      </PageTitle>
      <Panel title={`${rows.length} users`} testid="users-panel">
        <Table testid="users-table" rows={rows} columns={[
          { key: "name", label: "Name" }, { key: "email", label: "Email" },
          { key: "role", label: "Role", render: (r) => <Badge tone="indigo">{r.role}</Badge> },
          { key: "student_code", label: "Student Code" },
          { key: "status", label: "Status", render: (r) => <Badge tone="emerald">{r.status || "active"}</Badge> },
          {
            key: "actions", label: "Actions", render: (r) => (
              <Button size="sm" variant="outline" data-testid={`edit-user-${r.email}`}
                onClick={() => { setEditing(r.id); setForm({ ...r, password: "" }); setOpen(true); }}>Edit</Button>
            ),
          },
        ]} />
      </Panel>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-form-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            {[["name", "Name"], ["email", "Email"], ["password", editing ? "New Password (optional)" : "Password"], ["student_code", "Student Code (for student role)"]].map(([k, label]) => (
              <div key={k} className="space-y-1.5"><Label>{label}</Label>
                <Input data-testid={`user-field-${k}`} type={k === "password" ? "password" : "text"} value={form[k] || ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            <div className="space-y-1.5"><Label>Role</Label>
              <Select testid="user-field-role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} placeholder="Select"
                options={["admin", "management", "coordinator", "teacher", "student"].map((r) => ({ value: r, label: r }))} /></div>
            <div className="space-y-1.5"><Label>School (teacher scope)</Label>
              <Select testid="user-field-school" value={form.school_id} onChange={(v) => setForm({ ...form, school_id: v })}
                options={schools.map((s) => ({ value: s.id, label: s.name }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="save-user-button" className="bg-emerald-700 hover:bg-emerald-800" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AuditLogs() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/audit-logs", { params: { limit: 300 } }).then((r) => setRows(r.data)).catch(() => {}); }, []);
  return (
    <div>
      <PageTitle title="Audit Logs" subtitle="Every create, update and bulk action is recorded" />
      <Panel title={`${rows.length} log entries`} testid="audit-panel">
        <Table testid="audit-table" rows={rows} columns={[
          { key: "created_at", label: "Date/Time", render: (r) => r.created_at?.slice(0, 19).replace("T", " ") },
          { key: "action", label: "Action", render: (r) => <Badge tone="indigo">{r.action}</Badge> },
          { key: "entity", label: "Entity" }, { key: "entity_id", label: "Record" },
          { key: "user_name", label: "Updated By" },
          { key: "new_value", label: "New Value", render: (r) => <span className="font-mono text-xs text-slate-500 max-w-[280px] truncate inline-block">{JSON.stringify(r.new_value)?.slice(0, 90) || "—"}</span> },
        ]} />
      </Panel>
    </div>
  );
}
