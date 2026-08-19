import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter, X } from "lucide-react";

export function useMasters() {
  const [data, setData] = useState({ blocks: [], villages: [], schools: [] });
  useEffect(() => {
    Promise.all([
      api.get("/masters/blocks"), api.get("/masters/villages"), api.get("/masters/schools"),
    ]).then(([b, v, s]) => setData({ blocks: b.data, villages: v.data, schools: s.data })).catch(() => {});
  }, []);
  return data;
}

export const STANDARDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

export function Select({ label, value, onChange, options, placeholder = "All", testid }) {
  return (
    <div className="min-w-[140px]">
      {label && <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">{label}</label>}
      <select data-testid={testid} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 text-sm rounded-md border border-slate-300 bg-white px-2 outline-none focus:border-emerald-600">
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="min-w-[130px]">
      <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

/** Universal filter bar. `show` picks which filters appear. */
export default function Filters({ value, onChange, onApply, show = [], extra = null, courses = [] }) {
  const { blocks, villages, schools } = useMasters();
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  const has = (k) => show.includes(k);
  const villageOpts = villages.filter((v) => !value.block_id || v.block_id === value.block_id);
  const schoolOpts = schools.filter((s) => (!value.block_id || s.block_id === value.block_id) &&
    (!value.village_id || s.village_id === value.village_id));

  return (
    <div data-testid="universal-filter" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
      <div className="flex flex-wrap items-end gap-3">
        {has("block_id") && <Select testid="filter-block" label="Block" value={value.block_id} onChange={set("block_id")}
          options={blocks.map((b) => ({ value: b.id, label: b.name }))} />}
        {has("village_id") && <Select testid="filter-village" label="Village" value={value.village_id} onChange={set("village_id")}
          options={villageOpts.map((v) => ({ value: v.id, label: v.name }))} />}
        {has("school_id") && <Select testid="filter-school" label="School" value={value.school_id} onChange={set("school_id")}
          options={schoolOpts.map((s) => ({ value: s.id, label: s.name }))} />}
        {has("standard") && <Select testid="filter-standard" label="Standard" value={value.standard} onChange={set("standard")}
          options={STANDARDS.map((s) => ({ value: s, label: `Std ${s}` }))} />}
        {has("gender") && <Select testid="filter-gender" label="Gender" value={value.gender} onChange={set("gender")}
          options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }]} />}
        {has("course_id") && <Select testid="filter-course" label="Course" value={value.course_id} onChange={set("course_id")}
          options={courses.map((c) => ({ value: c.id, label: c.name }))} />}
        {has("dates") && (
          <>
            <Field label="From"><Input data-testid="filter-date-from" type="date" className="h-9"
              value={value.date_from || ""} onChange={(e) => set("date_from")(e.target.value)} /></Field>
            <Field label="To"><Input data-testid="filter-date-to" type="date" className="h-9"
              value={value.date_to || ""} onChange={(e) => set("date_to")(e.target.value)} /></Field>
          </>
        )}
        {has("search") && <Field label="Search"><Input data-testid="filter-search" placeholder="Name or ID" className="h-9"
          value={value.search || ""} onChange={(e) => set("search")(e.target.value)} /></Field>}
        {extra}
        <div className="flex items-center gap-2 ml-auto">
          <Button data-testid="apply-filter-button" onClick={onApply} className="h-9 rounded-full bg-emerald-700 hover:bg-emerald-800 text-xs font-bold uppercase tracking-wide">
            <Filter className="h-3.5 w-3.5 mr-1.5" /> Apply
          </Button>
          <Button data-testid="clear-filter-button" variant="outline" className="h-9 rounded-full text-xs font-bold uppercase tracking-wide"
            onClick={() => { onChange({}); setTimeout(onApply, 0); }}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
