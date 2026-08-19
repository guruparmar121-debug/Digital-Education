import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME, APP_SUB } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2, ShieldCheck } from "lucide-react";

const DEMO = [
  ["Admin", "admin@dep.org", "admin123"],
  ["Management", "management@dep.org", "manage123"],
  ["Coordinator", "coordinator@dep.org", "coord123"],
  ["Teacher", "teacher@dep.org", "teach123"],
  ["Student", "student@dep.org", "stud123"],
];

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@dep.org");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) nav("/", { replace: true }); }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) nav("/", { replace: true });
    else setError(res.error);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-slate-100 p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-25 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.pexels.com/photos/1895114/pexels-photo-1895114.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-600"><GraduationCap className="h-6 w-6" /></span>
            <span className="font-display text-lg font-bold tracking-tight">{APP_NAME}</span>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="font-display text-3xl xl:text-5xl font-extrabold leading-tight">Every child counted. Every lesson tracked.</h1>
          <p className="mt-5 text-slate-300 text-base">{APP_SUB} — attendance, course progress and academic-year insights across blocks, villages and schools.</p>
          <div className="mt-8 flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" /> Role-based secure access
          </div>
        </div>
        <p className="relative text-xs text-slate-400 uppercase tracking-widest">CSR Education Initiative</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md fade-up">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <span className="p-2 rounded-lg bg-emerald-700 text-white"><GraduationCap className="h-5 w-5" /></span>
            <span className="font-display font-bold text-slate-900">{APP_NAME}</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Sign in</h2>
          <p className="text-sm text-slate-600 mt-2">{APP_SUB}</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email-input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="login-password-input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <p data-testid="login-error" className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</p>}
            <Button data-testid="login-submit-button" type="submit" disabled={busy}
              className="w-full h-11 rounded-full bg-emerald-700 hover:bg-emerald-800 font-semibold">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 border border-slate-200 rounded-xl bg-white p-4">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">Demo accounts</p>
            <div className="grid gap-2">
              {DEMO.map(([role, em, pw]) => (
                <button key={em} type="button" data-testid={`demo-login-${role.toLowerCase()}`}
                  onClick={() => { setEmail(em); setPassword(pw); }}
                  className="flex items-center justify-between text-left text-sm px-3 py-2 rounded-md hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors">
                  <span className="font-semibold text-slate-800">{role}</span>
                  <span className="font-mono text-xs text-slate-500">{em}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
