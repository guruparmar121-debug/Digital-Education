import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { Table, Spinner, Progress } from "@/components/Ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

/** Chart drill-down: returns an `open(chartKey, label)` handler plus the dialog element. */
export function useDrilldown(yearId, filters = {}) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((chart, title) => (label) => {
    if (!label || !yearId) return;
    setState({ chart, title, label, data: null });
    setLoading(true);
    api.get("/dashboard/drilldown", { params: { chart, label, academic_year_id: yearId, ...filters } })
      .then((r) => setState({ chart, title, label, data: r.data }))
      .catch((e) => { toast.error(errMsg(e.response?.data?.detail)); setState(null); })
      .finally(() => setLoading(false));
  }, [yearId, filters]);

  return { open, dialog: <DrilldownDialog state={state} loading={loading} onClose={() => setState(null)} /> };
}

function DrilldownDialog({ state, loading, onClose }) {
  const nav = useNavigate();
  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto" data-testid="drilldown-dialog">
        <DialogHeader>
          <DialogTitle data-testid="drilldown-title">
            {state?.title} — {state?.label}
            {state?.data && <span className="ml-3 text-sm font-normal text-slate-500">
              {state.data.count} student records</span>}
          </DialogTitle>
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
