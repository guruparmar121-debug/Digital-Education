import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useYear } from "@/context/YearContext";
import { APP_NAME, APP_SUB } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, LayoutDashboard, Users, CalendarCheck, School, MapPin, Home as HomeIcon,
  UserCog, BookOpen, TrendingUp, CalendarRange, ArrowUpRight, FileBarChart, GitCompare,
  Upload, ShieldCheck, ScrollText, LogOut, Menu, X, MoreHorizontal, UserSquare2,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "management", "coordinator", "teacher"] },
  { to: "/my", label: "My Dashboard", icon: UserSquare2, roles: ["student"] },
  { to: "/students", label: "Students", icon: Users, roles: ["admin", "management", "coordinator", "teacher"] },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ["admin", "coordinator", "teacher", "student"] },
  { to: "/schools", label: "Schools", icon: School, roles: ["admin", "management", "coordinator"] },
  { to: "/blocks", label: "Blocks", icon: MapPin, roles: ["admin", "management"] },
  { to: "/villages", label: "Villages", icon: HomeIcon, roles: ["admin", "management", "coordinator"] },
  { to: "/teachers", label: "Teachers / Staff", icon: UserCog, roles: ["admin", "management", "coordinator"] },
  { to: "/courses", label: "Courses", icon: BookOpen, roles: ["admin", "management", "coordinator", "teacher"] },
  { to: "/course-progress", label: "Course Progress", icon: TrendingUp, roles: ["admin", "management", "coordinator", "teacher", "student"] },
  { to: "/academic-years", label: "Academic Years", icon: CalendarRange, roles: ["admin", "management"] },
  { to: "/promotion", label: "Student Promotion", icon: ArrowUpRight, roles: ["admin"] },
  { to: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "management", "coordinator", "teacher"] },
  { to: "/year-comparison", label: "Year Comparison", icon: GitCompare, roles: ["admin", "management"] },
  { to: "/bulk-upload", label: "Bulk Upload", icon: Upload, roles: ["admin"] },
  { to: "/users", label: "Users", icon: ShieldCheck, roles: ["admin"] },
  { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, roles: ["admin", "management"] },
];

const MOBILE = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/students", label: "Students", icon: Users },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

export function AcademicYearSelect({ testid = "global-academic-year-select", dark }) {
  const { years, yearId, setYearId } = useYear();
  return (
    <select data-testid={testid} value={yearId} onChange={(e) => setYearId(e.target.value)}
      className={`text-xs font-semibold rounded-full px-3 py-2 border outline-none transition-colors ${
        dark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
      {years.map((y) => <option key={y.id} value={y.id}>{y.year}{y.is_current ? " (current)" : ""}</option>)}
    </select>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user?.role));

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
      isActive ? "bg-emerald-600 text-white font-semibold shadow-sm"
        : "text-slate-400 font-medium hover:text-slate-100 hover:bg-slate-800/60"}`;

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800 bg-slate-950/60 shrink-0">
        <span className="p-2 rounded-lg bg-emerald-600 text-white"><GraduationCap className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="font-display text-[13px] font-bold leading-tight text-white truncate">{APP_NAME}</p>
          <p className="text-[10px] text-slate-400 truncate">{APP_SUB}</p>
        </div>
      </div>
      <div className="mx-4 my-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700 shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Academic Year</p>
        <AcademicYearSelect testid="sidebar-academic-year-select" dark />
      </div>
      <nav className="px-3 pb-4 space-y-1 overflow-y-auto flex-1">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={linkCls}
            data-testid={`sidebar-nav-${n.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}
            onClick={() => setOpen(false)}>
            <n.icon className="h-4 w-4 shrink-0" /> <span className="truncate">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-800 shrink-0">
        <button data-testid="sidebar-logout-button" onClick={() => { logout(); nav("/login"); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-slate-100 z-40 border-r border-slate-800">
        {sidebar}
      </aside>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 bg-slate-900 text-slate-100">{sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="md:pl-64 min-h-screen pb-24 md:pb-8">
        <header className="h-16 sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden p-2 -ml-2" data-testid="mobile-menu-button" onClick={() => setOpen(!open)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="min-w-0 md:hidden">
              <p className="font-display font-bold text-slate-900 text-sm truncate">{APP_NAME}</p>
            </div>
            <div className="min-w-0 hidden md:block">
              <p className="text-[11px] uppercase tracking-widest font-bold text-emerald-700">{APP_NAME}</p>
              <p className="text-xs text-slate-500 truncate">{APP_SUB}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <AcademicYearSelect />
            <span data-testid="header-role-badge" className="hidden sm:inline px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-md text-[10px] font-bold uppercase tracking-wider">
              {user?.role}
            </span>
            <span className="hidden lg:block text-sm font-semibold text-slate-700 max-w-[140px] truncate">{user?.name}</span>
            <Button variant="ghost" size="icon" data-testid="header-logout-button"
              onClick={() => { logout(); nav("/login"); }}><LogOut className="h-4 w-4" /></Button>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 fade-up">{children}</main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around z-40">
        {MOBILE.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.to === "/"} data-testid={`mobile-nav-${m.label.toLowerCase()}`}
            className={({ isActive }) => `flex flex-col items-center gap-1 text-[10px] font-semibold ${isActive ? "text-emerald-700" : "text-slate-500"}`}>
            <m.icon className="h-5 w-5" />{m.label}
          </NavLink>
        ))}
        <button data-testid="mobile-nav-more" onClick={() => setMoreOpen(!moreOpen)}
          className="flex flex-col items-center gap-1 text-[10px] font-semibold text-slate-500">
          <MoreHorizontal className="h-5 w-5" />More
        </button>
        {moreOpen && (
          <div className="absolute bottom-16 right-2 w-56 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-2">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-slate-50 text-slate-700">
                <n.icon className="h-4 w-4" />{n.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
