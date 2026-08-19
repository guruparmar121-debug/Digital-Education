import { useEffect, useState } from "react";
import { api, errMsg, download } from "@/lib/api";
import { useYear } from "@/context/YearContext";
import { PageTitle, Panel, Table, Badge, Spinner } from "@/components/Ui";
import { useMasters, Select } from "@/components/Filters";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, History } from "lucide-react";

export default function BulkUpload() {
  const { yearId } = useYear();
  const { schools } = useMasters();
  const [tab, setTab] = useState("upload");
  const [mode, setMode] = useState("insert");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [exportSchool, setExportSchool] = useState("");

  useEffect(() => {
    if (tab === "history") api.get("/students/bulk/history").then((r) => setHistory(r.data)).catch(() => {});
  }, [tab]);

  const validate = async () => {
    if (!file) { toast.error("Choose an Excel or CSV file first"); return; }
    setBusy(true); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    try {
      const { data } = await api.post("/students/bulk/validate", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
      toast.success(`Validated ${data.total} rows — ${data.valid_count} valid, ${data.error_count} errors`);
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setBusy(false);
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/students/bulk/import/${result.token}`);
      toast.success(data.message);
      setResult(null); setFile(null);
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setBusy(false);
  };

  const steps = ["Download Template", "Fill Excel", "Upload File", "Validate", "Preview", "Import"];

  return (
    <div>
      <PageTitle title="Bulk Student Upload & Update" subtitle="Import or update 1000+ students from Excel / CSV">
        <Button variant="outline" data-testid="download-template-button"
          onClick={() => download("/students/bulk/template", {}, "student_upload_template.xlsx")}>
          <Download className="h-4 w-4 mr-2" /> Download Excel Template
        </Button>
      </PageTitle>

      <div className="flex flex-wrap gap-2 mb-6">
        {[["upload", "Upload / Update"], ["history", "Upload History"]].map(([t, label]) => (
          <button key={t} data-testid={`bulk-tab-${t}`} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide ${
              tab === t ? "bg-emerald-700 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{label}</button>
        ))}
      </div>

      {tab === "upload" && (
        <>
          <Panel className="mb-6" title="Workflow">
            <div className="flex flex-wrap items-center gap-2">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-xs font-semibold text-slate-700">{s}</span>
                  {i < steps.length - 1 && <span className="text-slate-300 mx-1">→</span>}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Upload file" className="mb-6" testid="upload-panel">
            <div className="flex flex-wrap items-end gap-4">
              <Select testid="bulk-mode-select" label="Mode" value={mode} onChange={setMode} placeholder="Insert new students"
                options={[{ value: "insert", label: "Insert new students" }, { value: "update", label: "Bulk update existing students" }]} />
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">File (.xlsx, .xls, .csv)</label>
                <input data-testid="bulk-file-input" type="file" accept=".xlsx,.xls,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="text-sm border border-dashed border-slate-300 rounded-lg px-3 py-2 bg-slate-50" />
              </div>
              <Button data-testid="validate-upload-button" disabled={busy} className="h-9 bg-emerald-700 hover:bg-emerald-800" onClick={validate}>
                <Upload className="h-4 w-4 mr-2" /> Validate Data
              </Button>
              <div className="ml-auto flex items-end gap-2">
                <Select testid="bulk-export-school" label="Export students of school" value={exportSchool} onChange={setExportSchool}
                  placeholder="All schools" options={schools.map((s) => ({ value: s.id, label: s.name }))} />
                <Button variant="outline" className="h-9" data-testid="export-for-update-button"
                  onClick={() => download("/students/bulk/export", { academic_year_id: yearId, school_id: exportSchool }, "students_bulk_update.xlsx")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Export for Update
                </Button>
              </div>
            </div>
          </Panel>

          {busy && <Spinner />}

          {result && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-5 bg-white rounded-xl border border-slate-200" data-testid="summary-total">
                  <p className="text-[11px] uppercase font-semibold text-slate-500">Total Records</p>
                  <p className="font-display text-3xl font-extrabold">{result.total}</p></div>
                <div className="p-5 bg-white rounded-xl border border-emerald-200" data-testid="summary-valid">
                  <p className="text-[11px] uppercase font-semibold text-emerald-700">Valid Records</p>
                  <p className="font-display text-3xl font-extrabold text-emerald-700">{result.valid_count}</p></div>
                <div className="p-5 bg-white rounded-xl border border-rose-200" data-testid="summary-errors">
                  <p className="text-[11px] uppercase font-semibold text-rose-700">Error Records</p>
                  <p className="font-display text-3xl font-extrabold text-rose-700">{result.error_count}</p></div>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <Button data-testid="import-button" disabled={!result.valid_count || busy}
                  className="bg-emerald-700 hover:bg-emerald-800" onClick={doImport}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> IMPORT {result.valid_count} STUDENTS
                </Button>
                {result.error_count > 0 && (
                  <Button variant="outline" data-testid="download-error-excel"
                    onClick={() => download(`/students/bulk/errors/${result.token}`, {}, "upload_errors.xlsx")}>
                    <AlertTriangle className="h-4 w-4 mr-2 text-rose-600" /> Download Error Excel
                  </Button>
                )}
              </div>

              <Panel title="Preview — valid records" className="mb-6" testid="preview-panel">
                <Table testid="preview-table" rows={result.preview} columns={[
                  { key: "row", label: "Row" }, { key: "student_id", label: "Student ID" },
                  { key: "name", label: "Name" }, { key: "gender", label: "Gender" },
                  { key: "academic_year", label: "Academic Year" }, { key: "standard", label: "Class" },
                  { key: "school_name", label: "School" }, { key: "village_name", label: "Village" },
                  { key: "block_name", label: "Block" },
                ]} />
              </Panel>

              {result.errors.length > 0 && (
                <Panel title="Validation errors" testid="errors-panel">
                  <Table testid="errors-table" rows={result.errors} columns={[
                    { key: "row", label: "Row" }, { key: "student_id", label: "Student ID" },
                    { key: "name", label: "Name" }, { key: "school_name", label: "School" },
                    { key: "error", label: "Error Message", render: (r) => <span className="text-rose-700 font-semibold">{r.error}</span> },
                  ]} />
                </Panel>
              )}
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <Panel title="Student Upload History" testid="upload-history-panel"
          action={<Button variant="outline" size="sm" data-testid="export-upload-report"
            onClick={() => download("/reports/bulk-upload/export", { academic_year_id: yearId, fmt: "excel" }, "bulk_upload_report.xlsx")}>
            <History className="h-4 w-4 mr-1.5" /> Export Report</Button>}>
          <Table testid="upload-history-table" rows={history} columns={[
            { key: "created_at", label: "Date", render: (r) => r.created_at?.slice(0, 19).replace("T", " ") },
            { key: "file_name", label: "File Name" }, { key: "academic_year", label: "Academic Year" },
            { key: "mode", label: "Mode", render: (r) => <Badge tone={r.mode === "update" ? "amber" : "indigo"}>{r.mode}</Badge> },
            { key: "total_records", label: "Total" }, { key: "imported", label: "Imported" },
            { key: "updated", label: "Updated" }, { key: "errors", label: "Errors" },
            { key: "uploaded_by", label: "Uploaded By" },
          ]} />
        </Panel>
      )}
    </div>
  );
}
