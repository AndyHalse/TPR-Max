import { useLocation, Link } from "wouter";
import {
  Network, Calendar, BookOpen, Activity, CheckSquare, LogOut, Star, Download,
  Users, ArrowRight, UserCheck, UserPlus, UserMinus, GraduationCap,
  ClipboardCheck, ClipboardList, Cake, PartyPopper, Sunrise,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

type DashboardResp = {
  today_date?: string;
  counts: {
    activeStaff: number;
    onLeaveToday: number;
    startingThisMonth: number;
    leaversThisMonth: number;
    onboardingInProgress: number;
    trainingExpiring: number;
    appraisalsDue: number;
    pendingLeaveApprovals: number;
  };
  onLeaveToday: Array<{ staffId: string; name: string; leaveType: string; endDate: string }>;
  today: {
    birthdays: Array<{ staffId: string; name: string }>;
    anniversaries: Array<{ staffId: string; name: string; years: number }>;
    returningFromLeave: Array<{ staffId: string; name: string; leaveType: string }>;
  };
};

type SummaryCard = {
  label: string;
  value: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconText: string;
  detail?: React.ReactNode;
};

export default function HrHub() {
  const [, navigate] = useLocation();

  const { data: stats } = useQuery<{ total: number; active: number }>({
    queryKey: ["/api/staff/stats"],
  });

  const { data: dashboard, isLoading: dashboardLoading, isError: dashboardError } = useQuery<DashboardResp>({
    queryKey: ["/api/hr/dashboard"],
  });

  const onLeaveDetail =
    dashboard && dashboard.onLeaveToday.length > 0 ? (
      <span className="line-clamp-2">
        {dashboard.onLeaveToday.slice(0, 3).map((p) => p.name).join(", ")}
        {dashboard.onLeaveToday.length > 3
          ? ` +${dashboard.onLeaveToday.length - 3} more`
          : ""}
      </span>
    ) : dashboard ? (
      <span className="italic">No one on leave today</span>
    ) : null;

  const cards: SummaryCard[] = dashboard
    ? [
        {
          label: "Active staff",
          value: dashboard.counts.activeStaff,
          href: "/staff",
          icon: UserCheck,
          iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
          iconText: "text-emerald-600 dark:text-emerald-400",
        },
        {
          label: "On leave today",
          value: dashboard.counts.onLeaveToday,
          href: "/hr/leave",
          icon: Calendar,
          iconBg: "bg-green-100 dark:bg-green-900/40",
          iconText: "text-green-600 dark:text-green-400",
          detail: onLeaveDetail,
        },
        {
          label: "Starting this month",
          value: dashboard.counts.startingThisMonth,
          href: "/hr/onboarding?filter=starting_this_month",
          icon: UserPlus,
          iconBg: "bg-teal-100 dark:bg-teal-900/40",
          iconText: "text-teal-600 dark:text-teal-400",
        },
        {
          label: "Leavers this month",
          value: dashboard.counts.leaversThisMonth,
          href: "/hr/leavers",
          icon: UserMinus,
          iconBg: "bg-orange-100 dark:bg-orange-900/40",
          iconText: "text-orange-600 dark:text-orange-400",
        },
        {
          label: "Onboarding in progress",
          value: dashboard.counts.onboardingInProgress,
          href: "/hr/onboarding",
          icon: ClipboardList,
          iconBg: "bg-cyan-100 dark:bg-cyan-900/40",
          iconText: "text-cyan-600 dark:text-cyan-400",
        },
        {
          label: "Training expiring (30 days)",
          value: dashboard.counts.trainingExpiring,
          href: "/hr/training",
          icon: GraduationCap,
          iconBg: "bg-purple-100 dark:bg-purple-900/40",
          iconText: "text-purple-600 dark:text-purple-400",
        },
        {
          label: "Appraisals due (30 days)",
          value: dashboard.counts.appraisalsDue,
          href: "/hr/appraisals",
          icon: ClipboardCheck,
          iconBg: "bg-amber-100 dark:bg-amber-900/40",
          iconText: "text-amber-600 dark:text-amber-400",
        },
        {
          label: "Pending leave approvals",
          value: dashboard.counts.pendingLeaveApprovals,
          href: "/hr/leave?tab=pending",
          icon: Calendar,
          iconBg: "bg-rose-100 dark:bg-rose-900/40",
          iconText: "text-rose-600 dark:text-rose-400",
        },
      ]
    : [];

  const today = dashboard?.today;
  const todayHasAnything =
    !!today &&
    (today.birthdays.length > 0 ||
      today.anniversaries.length > 0 ||
      today.returningFromLeave.length > 0);

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 mb-2">
        <span className="text-amber-600 text-lg">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">HR Module — Beta</p>
          <p className="text-sm text-amber-700">
            These features are in active development. For payroll processing,
            right-to-work records, and appraisals, please verify all data
            independently until this module reaches full release.
            Contact support if you have any questions.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-fixed flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
              <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            HR Module
            <Badge className="ml-1 bg-amber-100 text-amber-800 border-amber-300 text-xs font-semibold">
              BETA
            </Badge>
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

      {/* Dashboard summary cards */}
      {dashboardError && (
        <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
          We couldn't load the HR dashboard summary. The module tiles below still work — please try again in a moment.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboardLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm"
              >
                <Skeleton className="h-8 w-8 rounded-lg mb-3" />
                <Skeleton className="h-6 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          : dashboard ? cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link
                  key={c.label}
                  href={c.href}
                  className="group block p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  data-testid={`card-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={`p-2 rounded-lg ${c.iconBg}`}>
                      <Icon className={`w-4 h-4 ${c.iconText}`} />
                    </div>
                    <ArrowRight className="w-4 h-4 text-variable opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-2xl font-bold text-fixed leading-tight">{c.value}</p>
                  <p className="text-xs text-variable mt-1">{c.label}</p>
                  {c.detail && (
                    <p className="text-xs text-variable mt-2 leading-snug">{c.detail}</p>
                  )}
                </Link>
              );
            }) : null}
      </div>

      {/* Today panel */}
      {dashboard && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sunrise className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-fixed">Today</h3>
            <span className="text-xs text-variable">
              {(dashboard.today_date ? new Date(dashboard.today_date + "T00:00:00") : new Date())
                .toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
            </span>
          </div>
          {todayHasAnything ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TodaySection
                icon={Cake}
                colour="text-pink-500"
                title="Birthdays"
                empty="No birthdays today"
                items={today!.birthdays.map((b) => b.name)}
              />
              <TodaySection
                icon={PartyPopper}
                colour="text-amber-500"
                title="Work anniversaries"
                empty="No anniversaries today"
                items={today!.anniversaries.map(
                  (a) => `${a.name} (${a.years} yr${a.years === 1 ? "" : "s"})`
                )}
              />
              <TodaySection
                icon={UserCheck}
                colour="text-emerald-500"
                title="Returning from leave"
                empty="No one returning today"
                items={today!.returningFromLeave.map((r) => r.name)}
              />
            </div>
          ) : (
            <p className="text-sm text-variable italic">
              Nothing notable today — no birthdays, anniversaries or returning leave.
            </p>
          )}
        </GlassCard>
      )}

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

function TodaySection({
  icon: Icon,
  colour,
  title,
  empty,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  colour: string;
  title: string;
  empty: string;
  items: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4 h-4 ${colour}`} />
        <span className="text-xs font-medium text-fixed">{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-variable italic">{empty}</p>
      ) : (
        <ul className="text-xs text-variable space-y-0.5">
          {items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
