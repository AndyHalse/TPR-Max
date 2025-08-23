import { Link, useLocation } from "wouter";
import { IdCard, ChartLine, Users, Dock, ListChecks, User, Settings, FileText, CalendarPlus } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { path: "/", icon: ChartLine, label: "Dashboard" },
    { path: "/staff", icon: Users, label: "Staff" },
    { path: "/prebooking", icon: CalendarPlus, label: "Pre-booking" },
    { path: "/kiosk", icon: Dock, label: "Kiosk Mode" },
    { path: "/muster", icon: ListChecks, label: "Muster List" },
    { path: "/reports", icon: FileText, label: "Reports" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="glass-effect fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center">
              <IdCard className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">VisiGate Pro</h1>
              <p className="text-xs text-slate-600">Visitor Management</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-6">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <button 
                  className={`nav-btn px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                    location === item.path 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-slate-700 hover:text-blue-600'
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              </Link>
            ))}
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="glass-effect px-3 py-1 rounded-full">
              <span className="text-sm text-slate-700 font-medium">TechCorp Ltd</span>
            </div>
            <button className="w-10 h-10 gradient-blue rounded-full flex items-center justify-center">
              <User className="text-white" size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-24 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
