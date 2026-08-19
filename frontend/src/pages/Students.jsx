import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { useYear } from "@/context/YearContext";
import { useAuth } from "@/context/AuthContext";
import { PageTitle, Panel, Table, Spinner, Badge } from "@/components/Ui";
import Filters, { useMasters, STANDARDS, Select } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FileSpreadsheet, FileText, Upload } from "lucide-react";
import { download } from "@/lib/api";

const blank = {
  student_id: "", name: "", gender: "Male", dob: "", parent_name: "", parent_mobile: "",
  admission_date: "", status: "active", standard: "5", division: "A", school_id: "",
};

export default function Students() {
  const { yearId } = useYear();
  const { user } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === "admin";
  const { schools } = useMasters();
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    if (!yearId) return;
    setLoading(true);
    api.get("/students", { params: { academic_year_id: yearId, ...applied } })
      .then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [yearId, applied]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [
    { key: "student_id", label: "Student ID", render: (r) => <span className="font-mono font-semibold">{r.student_id}</span> },
    { key: "name", label: "Student Name" },
    { key: "gender", label: "Gender" },
    { key: "standard", label: "Class", render: (r) => `Std ${r.standard}${r.division ? "-" + r.division : ""}` },
    { key: "school_name", label: "School" },
    { key: "village_name", label: "Village" },
    { key: "block_name", label: "Block" },
    { key: "parent_name", label: "Parent" },
    { key: "parent_mobile", label: "Mobile" },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "active" ? "emerald" : "slate"}>{r.status}</Badge> },
    {
      key: "actions", label: "Actions", render: (r) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" data-testid={`view-student-${r.student_id}`}
            onClick={(e) => { e.stopPropagation(); nav(`/students/${r.student_id}`); }}>View</Button>
          {isAdmin && <Button size="sm" variant="outline" data-testid={`edit-student-${r.student_id}`}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(r.student_id);
              setForm({ ...blank, ...r });
              setOpen(true);
            }}>Edit</Button>}
        </div>
      ),
    },
  ], [isAdmin, nav]);

  const save = async () => {
    try {
      const payload = { ...form, academic_year_id: yearId };
      const school = schools.find((s) => s.id === payload.school_id);
      payload.village_id = school?.village_id || "";
      payload.block_id = school?.block_id || "";
      if (!payload.student_id || !payload.name || !payload.school_id) {
        toast.error("Student ID, Name and School are required");
        return;
      }
      if (editing) await api.put(`/students/${editing}`, payload);
      else await api.post("/students", payload);
      toast.success(editing ? "Student updated" : "Student added");
      setOpen(false); setEditing(null); setForm(blank); load();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageTitle title="Student Master" subtitle="Academic-year wise student records">
        <Button variant="outline" data-testid="export-students-excel"
          onClick={() => download(`/reports/students/export`, { academic_year_id: yearId, fmt: "excel", ...applied }, "students.xlsx")}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
        </Button>
        <Button variant="outline" data-testid="export-students-pdf"
          onClick={() => download(`/reports/students/export`, { academic_year_id: yearId, fmt: "pdf", ...applied }, "students.pdf")}>
          <FileText className="h-4 w-4 mr-2" /> PDF
        </Button>
        {isAdmin && <Button variant="outline" data-testid="goto-bulk-upload" onClick={() => nav("/bulk-upload")}>
          <Upload className="h-4 w-4 mr-2" /> Bulk Upload
        </Button>}
        {isAdmin && <Button data-testid="add-student-button" className="bg-emerald-700 hover:bg-emerald-800"
          onClick={() => { setEditing(null); setForm(blank); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Student
        </Button>}
      </PageTitle>

      <Filters value={filters} onChange={setFilters} onApply={() => setApplied(filters)}
        show={["block_id", "village_id", "school_id", "standard", "gender", "search"]} />

      <Panel title={`${rows.length} students`} testid="students-panel">
        {loading ? <Spinner /> : <Table columns={columns} rows={rows} testid="students-table"
          onRowClick={(r) => nav(`/students/${r.student_id}`)} />}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="student-form-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit Student" : "Add Student"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            {[["student_id", "Student ID"], ["name", "Student Name"], ["dob", "Date of Birth", "date"],
              ["parent_name", "Parent/Guardian Name"], ["parent_mobile", "Parent Mobile"],
              ["admission_date", "Admission Date", "date"], ["division", "Division"]].map(([k, label, type]) => (
              <div key={k} className="space-y-1.5">
                <Label>{label}</Label>
                <Input data-testid={`student-field-${k}`} type={type || "text"} value={form[k] || ""}
                  disabled={k === "student_id" && !!editing}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1.5"><Label>Gender</Label>
              <Select testid="student-field-gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })}
                placeholder="Select" options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} />
            </div>
            <div className="space-y-1.5"><Label>Standard/Class</Label>
              <Select testid="student-field-standard" value={form.standard} onChange={(v) => setForm({ ...form, standard: v })}
                placeholder="Select" options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label>School</Label>
              <Select testid="student-field-school" value={form.school_id} onChange={(v) => setForm({ ...form, school_id: v })}
                placeholder="Select school" options={schools.map((s) => ({ value: s.id, label: s.name }))} />
            </div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select testid="student-field-status" value={form.status} onChange={(v) => setForm({ ...form, status: v })}
                placeholder="Select" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="save-student-button" className="bg-emerald-700 hover:bg-emerald-800" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
