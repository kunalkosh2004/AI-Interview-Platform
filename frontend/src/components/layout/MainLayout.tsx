import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { LogOut, User } from "lucide-react";

export function MainLayout() {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-blue-600">
            AI Interview Platform
          </Link>

          <nav className="flex items-center gap-6">
            {user?.role === "candidate" && (
              <Link
                to="/candidate"
                className={`text-sm font-medium hover:text-blue-600 ${
                  location.pathname === "/candidate" ? "text-blue-600" : "text-gray-600"
                }`}
              >
                Dashboard
              </Link>
            )}
            {(user?.role === "recruiter" || user?.role === "admin") && (
              <Link
                to="/recruiter"
                className={`text-sm font-medium hover:text-blue-600 ${
                  location.pathname === "/recruiter" ? "text-blue-600" : "text-gray-600"
                }`}
              >
                Dashboard
              </Link>
            )}

            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={16} />
                <span>{user?.full_name}</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{user?.role}</span>
              </div>
              <button
                onClick={logout}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
