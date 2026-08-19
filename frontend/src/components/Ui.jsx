import { CHART_COLORS } from "@/lib/api";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Loader2, Inbox } from "lucide-react";

const ACCENTS = {
  emerald: ["bg-emerald-600", "bg-emerald-50 text-emerald-700 border-emerald-100"],
  teal: ["bg-teal-600", "bg-teal-50 text-teal-700 border-teal-100"],
  indigo: ["bg-indigo-600", "bg-indigo-50 text-indigo-700 border-indigo-100"],
  sky: ["bg-sky-600", "bg-sky-50 text-sky-700 border-sky-100"],
  amber: ["bg-amber-600", "bg-amber-50 text-amber-700 border-amber-100"],
  violet: ["bg-violet-600", "bg-violet-50 text-violet-700 border-violet-100"],
  rose: ["bg-rose-600", "bg-rose-50 text-rose-700 border-rose-100"],
};

const TONES = {
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  slate: "bg-slate-100 text-slate-800 border-slate-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  rose: "bg-rose-100 text-rose-800 border-rose-200",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

export const Kpi = ({ label, value, icon: Icon, suffix = "", accent = "emerald", testid }) => (
  <div data-testid={testid} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
    <div className={`absolute top-0 left-0 right-0 h-1 ${(ACCENTS[accent] || ACCENTS.emerald)[0]}`} />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</p>
        <p className="mt-2 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {value ?? 0}{suffix}
        </p>
      </div>
      {Icon && <span className={`p-2.5 rounded-lg border ${(ACCENTS[accent] || ACCENTS.emerald)[1]}`}><Icon className="h-4 w-4" /></span>}
    </div>
  </div>
);

export const Panel = ({ title, subtitle, action, children, className = "", testid }) => (
  <div data-testid={testid} className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {(title || action) && (
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

export const Empty = ({ text = "No records found" }) => (
  <div data-testid="empty-state" className="py-12 flex flex-col items-center text-slate-400">
    <Inbox className="h-8 w-8 mb-3" /><p className="text-sm font-medium">{text}</p>
  </div>
);

export const Spinner = () => (
  <div data-testid="loading-indicator" className="py-16 flex justify-center text-emerald-700">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

export const Progress = ({ value }) => (
  <div className="flex items-center gap-2 min-w-[110px]">
    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full bg-emerald-600 transition-all"
        style={{ width: `${Math.min(value || 0, 100)}%` }} />
    </div>
    <span className="text-xs font-mono font-semibold text-slate-600 w-11 text-right">{value ?? 0}%</span>
  </div>
);

export const Badge = ({ children, tone = "slate" }) => (
  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide border ${TONES[tone] || TONES.slate}`}>
    {children}
  </span>
);

export function Chart({ type = "bar", data = [], title, subtitle, onClick, dataKey = "value", height = 260, testid }) {
  const rows = (data || []).filter((d) => d && d.name !== undefined).slice(0, 14);
  return (
    <Panel title={title} subtitle={subtitle} testid={testid}>
      {rows.length === 0 ? <Empty text="No chart data" /> : (
        <ResponsiveContainer width="100%" height={height}>
          {type === "pie" ? (
            <PieChart>
              <Pie data={rows} dataKey={dataKey} nameKey="name" innerRadius={55} outerRadius={90}
                onClick={(e) => onClick && onClick(e?.name)}>
                {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          ) : type === "line" ? (
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip /><Line type="monotone" dataKey={dataKey} stroke="#0D9488" strokeWidth={2.5} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={rows} onClick={(e) => onClick && onClick(e?.activeLabel)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 10 }} /><Tooltip />
              <Bar dataKey={dataKey} radius={[5, 5, 0, 0]} cursor="pointer">
                {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

export function Table({ columns, rows, empty = "No records found", onRowClick, testid = "data-table" }) {
  if (!rows?.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto">
      <table data-testid={testid} className="w-full text-sm text-left border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="bg-slate-100/70 text-slate-700 font-bold px-4 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wider whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || r.student_id || i} data-testid={`table-row-${i}`}
              onClick={() => onRowClick && onRowClick(r)}
              className={`hover:bg-slate-50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}>
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 border-b border-slate-100 text-slate-700 font-medium whitespace-nowrap">
                  {c.render ? c.render(r) : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const PageTitle = ({ title, subtitle, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);
