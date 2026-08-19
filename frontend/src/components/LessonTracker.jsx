import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Spinner, Progress, Badge } from "@/components/Ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";

/** Module + lesson level tick-off tracker for one student-course record. */
export default function LessonTracker({ recordId, canEdit, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!recordId) return;
    api.get(`/course-progress/${recordId}/lessons`)
      .then((r) => setData(r.data))
      .catch((e) => { toast.error(errMsg(e.response?.data?.detail)); onClose(); });
  }, [recordId, onClose]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (lesson, completed) => {
    setBusy(true);
    try {
      await api.post(`/course-progress/${recordId}/lessons/${lesson.id}`, { completed });
      load();
      onSaved && onSaved();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setBusy(false);
  };

  const toggleModule = async (mod, completed) => {
    setBusy(true);
    try {
      for (const l of mod.lessons) {
        if (l.completed !== completed) {
          await api.post(`/course-progress/${recordId}/lessons/${l.id}`, { completed });
        }
      }
      toast.success(completed ? `${mod.name} marked complete` : `${mod.name} cleared`);
      load();
      onSaved && onSaved();
    } catch (e) { toast.error(errMsg(e.response?.data?.detail)); }
    setBusy(false);
  };

  return (
    <Dialog open={!!recordId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="lesson-tracker-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-emerald-700" />
            {data ? `${data.student_name} — ${data.course_name}` : "Lesson tracking"}
          </DialogTitle>
        </DialogHeader>

        {!data ? <Spinner /> : (
          <>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200" data-testid="lesson-tracker-summary">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Overall progress</span>
                <span className="text-sm font-bold text-slate-800" data-testid="lesson-tracker-count">
                  {data.completed_lessons} / {data.total_lessons} lessons
                </span>
              </div>
              <Progress value={data.progress_pct} />
            </div>

            <div className="space-y-4 mt-2">
              {data.modules.map((mod) => (
                <div key={mod.id} className="border border-slate-200 rounded-xl overflow-hidden" data-testid={`module-${mod.order}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-slate-900 text-sm">{mod.name}</span>
                      <Badge tone={mod.completed === mod.lessons.length && mod.lessons.length ? "emerald" : "slate"}>
                        {mod.completed}/{mod.lessons.length}
                      </Badge>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={busy} data-testid={`module-complete-${mod.order}`}
                          onClick={() => toggleModule(mod, true)}>Tick all</Button>
                        <Button size="sm" variant="outline" disabled={busy} data-testid={`module-clear-${mod.order}`}
                          onClick={() => toggleModule(mod, false)}>Clear</Button>
                      </div>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {mod.lessons.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <button disabled={!canEdit || busy} data-testid={`lesson-toggle-${l.order}`}
                          onClick={() => toggle(l, !l.completed)}
                          className={`flex items-center gap-3 text-left text-sm font-medium transition-colors ${
                            canEdit ? "hover:text-emerald-700" : "cursor-default"} ${
                            l.completed ? "text-slate-900" : "text-slate-600"}`}>
                          {l.completed
                            ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                            : <Circle className="h-5 w-5 text-slate-300 shrink-0" />}
                          <span className={l.completed ? "line-through decoration-emerald-600/40" : ""}>{l.name}</span>
                        </button>
                        {l.completed && l.completed_at && (
                          <span className="text-[11px] font-mono text-slate-400">{l.completed_at.slice(0, 10)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
