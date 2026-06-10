import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, FileText, LayoutDashboard, Users, Building2 } from "lucide-react";

interface PortalUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  customerId: string;
  contractorCompanyId: string;
  logoUrl?: string;
}

interface Props {
  children: React.ReactNode;
}

export function getPortalToken(): string | null {
  return localStorage.getItem("portal_token");
}

export function getPortalCustomerId(): string | null {
  return localStorage.getItem("portal_customer_id");
}

export function clearPortalSession() {
  localStorage.removeItem("portal_token");
  localStorage.removeItem("portal_customer_id");
  localStorage.removeItem("portal_user");
}

export async function portalFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getPortalToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

export default function ContractorPortalLayout({ children }: Props) {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getPortalToken();
    if (!token) {
      navigate("/contractor-portal/login");
      return;
    }
    const cached = localStorage.getItem("portal_user");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        setLoading(false);
        // Refresh in background to pick up new logoUrl etc.
        portalFetch("/api/contractor-portal/me")
          .then((r) => r.json())
          .then((data) => {
            if (!data.error) {
              setUser(data);
              localStorage.setItem("portal_user", JSON.stringify(data));
            }
          })
          .catch(() => {});
        return;
      } catch {}
    }
    portalFetch("/api/contractor-portal/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          clearPortalSession();
          navigate("/contractor-portal/login");
          return;
        }
        setUser(data);
        localStorage.setItem("portal_user", JSON.stringify(data));
        setLoading(false);
      })
      .catch(() => {
        clearPortalSession();
        navigate("/contractor-portal/login");
      });
  }, []);

  const handleLogout = () => {
    clearPortalSession();
    navigate("/contractor-portal/login");
  };

  const navItems = [
    { path: "/contractor-portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/contractor-portal/documents", label: "Documents", icon: FileText },
    { path: "/contractor-portal/workers", label: "Workers", icon: Users },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user?.logoUrl ? (
              <img
                src={user.logoUrl}
                alt={user.companyName}
                className="h-9 w-auto max-w-[120px] object-contain rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="bg-blue-600 rounded-lg p-1.5">
                <Building2 className="h-5 w-5" />
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400 leading-none">Contractor Compliance Portal</p>
              <p className="text-sm font-semibold leading-tight">{user?.companyName || "My Company"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400 hidden sm:block">
              {user?.firstName} {user?.lastName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign out
            </Button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-1 pb-0">
            {navItems.map(({ path, label, icon: Icon }) => {
              const active = location === path || location.startsWith(path + "/");
              return (
                <Link key={path} href={path}>
                  <span
                    className={`
                      flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-md cursor-pointer transition-colors
                      ${active
                        ? "bg-slate-50 text-slate-900"
                        : "text-slate-300 hover:text-white hover:bg-slate-700"
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
