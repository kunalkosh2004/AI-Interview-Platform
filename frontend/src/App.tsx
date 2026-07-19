import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { MainLayout } from "@/components/layout/MainLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { CandidateDashboard } from "@/pages/candidate/CandidateDashboard";
import { RecruiterDashboard } from "@/pages/recruiter/RecruiterDashboard";
import { InterviewPage } from "@/pages/candidate/InterviewPage";
import { CodingPage } from "@/pages/candidate/CodingPage";
import { ReportsPage } from "@/pages/recruiter/ReportsPage";

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { user } = useAuthStore();

  const homeRedirect = () => {
    if (!user) return "/login";
    if (user.role === "recruiter" || user.role === "admin") return "/recruiter";
    return "/candidate";
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to={homeRedirect()} replace />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/candidate"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <CandidateDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/interview/:id"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <InterviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coding/:sessionId"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <CodingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recruiter"
          element={
            <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
              <RecruiterDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:interviewId"
          element={
            <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
