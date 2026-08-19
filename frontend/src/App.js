import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { YearProvider } from "@/context/YearContext";
import Layout from "@/components/Layout";
import { Spinner } from "@/components/Ui";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import StudentDashboard from "@/pages/StudentDashboard";
import Attendance from "@/pages/Attendance";
import BulkUpload from "@/pages/BulkUpload";
import { Blocks, Villages, Schools, Teachers } from "@/pages/Masters";
import { Courses, CourseProgress } from "@/pages/Courses";
import { AcademicYears, Promotion, Users, AuditLogs } from "@/pages/Admin";
import { Reports, YearComparison } from "@/pages/Reports";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return (
    <YearProvider>
      <Layout>{children}</Layout>
    </YearProvider>
  );
}

function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === "student") return <Navigate to="/my" replace />;
  return <Protected><Dashboard /></Protected>;
}

const ALL = ["admin", "management", "coordinator", "teacher"];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/my" element={<Protected roles={["student"]}><StudentDashboard /></Protected>} />
          <Route path="/students" element={<Protected roles={ALL}><Students /></Protected>} />
          <Route path="/students/:studentCode" element={<Protected roles={ALL}><StudentDashboard /></Protected>} />
          <Route path="/attendance" element={<Protected><Attendance /></Protected>} />
          <Route path="/schools" element={<Protected roles={["admin", "management", "coordinator"]}><Schools /></Protected>} />
          <Route path="/blocks" element={<Protected roles={["admin", "management"]}><Blocks /></Protected>} />
          <Route path="/villages" element={<Protected roles={["admin", "management", "coordinator"]}><Villages /></Protected>} />
          <Route path="/teachers" element={<Protected roles={["admin", "management", "coordinator"]}><Teachers /></Protected>} />
          <Route path="/courses" element={<Protected roles={ALL}><Courses /></Protected>} />
          <Route path="/course-progress" element={<Protected><CourseProgress /></Protected>} />
          <Route path="/academic-years" element={<Protected roles={["admin", "management"]}><AcademicYears /></Protected>} />
          <Route path="/promotion" element={<Protected roles={["admin"]}><Promotion /></Protected>} />
          <Route path="/reports" element={<Protected roles={ALL}><Reports /></Protected>} />
          <Route path="/year-comparison" element={<Protected roles={["admin", "management"]}><YearComparison /></Protected>} />
          <Route path="/bulk-upload" element={<Protected roles={["admin"]}><BulkUpload /></Protected>} />
          <Route path="/users" element={<Protected roles={["admin"]}><Users /></Protected>} />
          <Route path="/audit-logs" element={<Protected roles={["admin", "management"]}><AuditLogs /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
