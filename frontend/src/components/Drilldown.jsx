import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg, download } from "@/lib/api";
import { Table, Spinner, Progress } from "@/components/Ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

/** Chart drill-down: returns an `open(chartKey, label)` handler plus the dialog element. */
export function useDrilldown(yearId, filters = {}) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((chart, title) => (label) => {
    if (!label || !yearId) return;
    setState({ chart, title, label, params: { chart, label, academic_year_id: yearId, ...filters }, data: null });
    setLoading(true);
    api.get("/dashboard/drilldown", { params: { chart, label, academic_year_id: yearId, ...filters } })
      .then((r) => setState({ chart, title, label, params: { chart, label, academic_year_id: yearId, ...filters }, data: r.data }))
      .catch((e) => { toast.error(errMsg(e.response?.data?.detail)); setState(null); })
      .finally(() => setLoading(false));
  }, [yearId, filters]);

  return { open, dialog: <DrilldownDialog state={state} loading={loading} onClose={() => setState(null)} /> };
}

function DrilldownDialog({ state, loading, onClose }) {
  const nav = useNavigate();
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await download("/dashboard/drilldown/export", { ...state.params, title: state.title },
        `drilldown_${state.chart}_${String(state.label).replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`);
      toast.success("Excel list downloaded");
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setExporting(false);
  };

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto" data-testid="drilldown-dialog">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle data-testid="drilldown-title">
              {state?.title} — {state?.label}
              {state?.data && <span className="ml-3 text-sm font-normal text-slate-500">
                {state.data.count} student records</span>}
            </DialogTitle>
            <Button size="sm" variant="outline" data-testid="drilldown-export-excel"
              disabled={!state?.data || exporting} onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> {exporting ? "Preparing…" : "Export Excel"}
            </Button>
          </div>
        </DialogHeader>
        {loading || !state?.data ? <Spinner /> : (
          <Table testid="drilldown-table" rows={state.data.rows} onRowClick={(r) => { onClose(); nav(`/students/${r.student_id}`); }}
            empty="No student records behind this data point" columns={[
              { key: "student_id", label: "Student ID", render: (r) => <span className="font-mono font-semibold">{r.student_id}</span> },
              { key: "name", label: "Student" }, { key: "gender", label: "Gender" },
              { key: "standard", label: "Class", render: (r) => `Std ${r.standard}${r.division ? "-" + r.division : ""}` },
              { key: "school_name", label: "School" }, { key: "block_name", label: "Block" },
              { key: "working_days", label: "Working Days" }, { key: "present", label: "Present" },
              { key: "absent", label: "Absent" },
              { key: "attendance_pct", label: "Attendance %", render: (r) => <Progress value={r.attendance_pct} /> },
              { key: "courses", label: "Courses" },
              { key: "avg_progress_pct", label: "Progress", render: (r) => <Progress value={r.avg_progress_pct} /> },
            ]} />
        )}
      </DialogContent>
    </Dialog>
  );
}
