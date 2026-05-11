import { useLocation } from "wouter";
import { Network, Calendar, BookOpen, Activity, CheckSquare, LogOut, Star, Download, Users, ArrowRight } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { useQuery } from "@tanstack/react-query";

const HR_MODULES = [
  {
    path: "/hr/org-chart",
    icon: Network,
    label: "Org Chart",
    description: "Reporting structure & team hierarchy",
    color: "blue",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
    hover: "hover:bg-blue-50 dark:hover:bg-blue-900/20",
  },
  {
    path: "/hr/leave",
    icon: Calendar,
    label: "Leave Calendar",
    description: "Approve & track annual and sick leave",
    color: "green",
    bg: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
    hover: "hover:bg-green-50 dark:hover:bg-green-900/20",
  },
  {
    path: "/hr/training",
    icon: BookOpen,
    label: "Training Matrix",
    description: "Compliance training & certification tracking",
    color: "purple",
    bg: "bg-purple-100 dark:bg-purple-900/40",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
    hover: "hover:bg-purple-50 dark:hover:bg-purple-900/20",
  },
  {
    path: "/hr/absence",
    icon: Activity,
    label: "Absence Overview",
    description: "Bradford Factor scoring & absence trends",
    color: "red",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    hover: "hover:bg-red-50 dark:hover:bg-red-900/20",
  },
  {
    path: "/hr/onboarding",
    icon: CheckSquare,
    label: "Onboarding",
    description: "New starter checklists & progress tracking",
    color: "teal",
    bg: "bg-teal-100 dark:bg-teal-900/40",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-teal-200 dark:border-teal-800",
    hover: "hover:bg-teal-50 dark:hover:bg-teal-900/20",
  },
  {
    path: "/hr/leavers",
    icon: LogOut,
    label: "Leavers",
    description: "Offboarding process & access deactivation",
    color: "orange",
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
    hover: "hover:bg-orange-50 dark:hover:bg-orange-900/20",
  },
  {
    path: "/hr/appraisals",
    icon: Star,
    label: "Appraisals",
    description: "Performance reviews & objectives tracking",
    color: "amber",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    hover: "hover:bg-amber-50 dark:hover:bg-amber-900/20",
  },
  {
    path: "/hr/payroll",
    icon: Download,
    label: "Payroll Export",
    description: "Export to Sage, Xero & BrightPay formats",
    color: "indigo",
    bg: "bg-indigo-100 dark:bg-indigo-900/40",
    text: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-200 dark:border-indigo-800",
    hover: "hover:bg-indigo-50 dark:hover:bg-indigo-900/20",
  },
];

export default function HrHub() {
  const [, navigate] = useLocation();

  const { data: stats } = useQuery<{ total: number; active: number }>({
    queryKey: ["/api/staff/stats"],
  });

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-fixed flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
              <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            HR Module
          </h2>
          <p className="text-sm text-variable mt-1">
            Human resources management — staff records, compliance & people operations
          </p>
        </div>
        {stats && (
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold text-fixed">{stats.total ?? "—"}</p>
              <p className="text-xs text-variable">Total staff</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {HR_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.path}
              onClick={() => navigate(mod.path)}
              className={`group text-left w-full p-5 rounded-xl border ${mod.border} ${mod.hover} bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-lg ${mod.bg}`}>
                  <Icon className={`w-5 h-5 ${mod.text}`} />
                </div>
                <ArrowRight className={`w-4 h-4 ${mod.text} opacity-0 group-hover:opacity-100 transition-opacity mt-0.5`} />
              </div>
              <h3 className="font-semibold text-fixed mb-1">{mod.label}</h3>
              <p className="text-xs text-variable leading-relaxed">{mod.description}</p>
            </button>
          );
        })}
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center gap-3 text-sm text-variable">
          <Users className="w-4 h-4 flex-shrink-0 text-indigo-500" />
          <span>
            Access individual staff HR profiles via the{" "}
            <button
              onClick={() => navigate("/staff")}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Staff directory
            </button>{" "}
            — click any staff member and select the HR tab to view their full record, right-to-work, documents, and more.
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
