import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useYear } from "@/context/YearContext";
import { PageTitle, Panel, Table, Spinner, Badge } from "@/components/Ui";
import { useMasters, Select } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

/** Generic master CRUD page driven by a config object. */
export default function MasterPage({ entity, title, subtitle, fields, columns }) {
  const { user } = useAuth();
  const { yearId } = useYear();
  const isAdmin = user?.role === "admin";
  const masters = useMasters();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/masters/${entity}`, { params: { search } })
      .then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [entity, search]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const payload = { ...form };
      if (entity === "schools") payload.academic_year_id = yearId;
      if (editing) await api.put(`/masters/${entity}/${editing}`, payload);
      else await api.post(`/masters/${entity}`, payload);
      toast.success(editing ? "Record updated" : "Record created");
      setOpen(false); setEditing(null); setForm({}); load();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
  };

  const optionsFor = (f) => {
    if (f.options) return f.options;
    if (f.source === "blocks") return masters.blocks.map((b) => ({ value: b.id, label: b.name }));
    if (f.source === "villages") return masters.villages.map((v) => ({ value: v.id, label: v.name }));
    if (f.source === "schools") return masters.schools.map((s) => ({ value: s.id, label: s.name }));
    return [];
  };

  const allColumns = [...columns, ...(isAdmin ? [{
    key: "actions", label: "Actions", render: (r) => (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" data-testid={`edit-${entity}-${r.id}`}
          onClick={() => { setEditing(r.id); setForm(r); setOpen(true); }}>Edit</Button>
        <Button size="sm" variant="outline" data-testid={`deactivate-${entity}-${r.id}`}
          onClick={async () => {
            try { await api.delete(`/masters/${entity}/${r.id}`); toast.success("Deactivated"); load(); }
            catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
          }}>Deactivate</Button>
      </div>
    ),
  }] : [])];

  return (
    <div>
      <PageTitle title={title} subtitle={subtitle}>
        {isAdmin && <Button data-testid={`add-${entity}-button`} className="bg-emerald-700 hover:bg-emerald-800"
          onClick={() => { setEditing(null); setForm({ status: "active" }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add
        </Button>}
      </PageTitle>

      <Panel testid={`${entity}-panel`} title={`${rows.length} records`}
        action={<div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input data-testid={`${entity}-search`} className="pl-9 h-9" placeholder="Search…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>}>
        {loading ? <Spinner /> : <Table testid={`${entity}-table`} columns={allColumns} rows={rows} />}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid={`${entity}-form-dialog`}>
          <DialogHeader><DialogTitle>{editing ? `Edit ${title}` : `Add ${title}`}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
                <Label>{f.label}</Label>
                {f.type === "select" ? (
                  <Select testid={`${entity}-field-${f.key}`} value={form[f.key] || ""} placeholder={`Select ${f.label}`}
                    onChange={(v) => setForm({ ...form, [f.key]: v })} options={optionsFor(f)} />
                ) : (
                  <Input data-testid={`${entity}-field-${f.key}`} type={f.type || "text"} value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid={`save-${entity}-button`} className="bg-emerald-700 hover:bg-emerald-800" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const StatusCell = (r) => <Badge tone={r.status === "active" ? "emerald" : "slate"}>{r.status}</Badge>;
