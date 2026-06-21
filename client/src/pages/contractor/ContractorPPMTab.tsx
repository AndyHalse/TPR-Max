import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import {
  Search,
  ExternalLink,
  Wrench,
  AlertTriangle,
  Building2,
  Shield,
  User,
  CalendarDays,
} from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { type PpmWorkOrderSummary, PPM_STATUS_BADGE } from "./types";

// Shows PPM work orders grouped by contractor company so site managers can
// see at a glance what maintenance tasks are assigned to each contractor.
export default function ContractorPPMTab() {
  const { t } = useTranslation(["contractors", "common"]);
  const [search, setSearch] = useState("");

  const { data: workOrders = [], isLoading } = useQuery<PpmWorkOrderSummary[]>({
    queryKey: ["/api/ppm/work-orders"],
  });

  // Only show work orders that are assigned to a contractor
  const assigned = workOrders.filter(wo => wo.contractorCompanyId || wo.contractorCompanyName);

  // Group by contractor company
  const grouped = assigned.reduce<Record<string, { companyName: string; items: PpmWorkOrderSummary[] }>>((acc, wo) => {
    const key = wo.contractorCompanyId ?? wo.contractorCompanyName ?? "unassigned";
    const label = wo.contractorCompanyName ?? t("common:unknown");
    if (!acc[key]) acc[key] = { companyName: label, items: [] };
    acc[key].items.push(wo);
    return acc;
  }, {});

  // Apply search filter across company name, worker name, or work order title
  const filtered = Object.entries(grouped).filter(([, group]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      group.companyName.toLowerCase().includes(q) ||
      group.items.some(wo =>
        wo.title.toLowerCase().includes(q) ||
        (wo.contractorWorkerName?.toLowerCase().includes(q))
      )
    );
  });

  if (isLoading) {
    return (
      <GlassCard className="p-8 text-center text-muted-foreground">
        {t("ppm.loading")}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + search */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h3 className="font-semibold text-fixed">{t("ppm.workOrdersByContractor")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("ppm.workOrdersAssigned", { assignedCount: assigned.length, contractorCount: Object.keys(grouped).length, count: assigned.length })}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t("ppm.searchPlaceholder")}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <a href="/ppm" className="flex items-center gap-1.5 text-xs text-primary hover:underline whitespace-nowrap">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("ppm.open")}
            </a>
          </div>
        </div>
      </GlassCard>

      {filtered.length === 0 && (
        <GlassCard className="p-12 text-center">
          <Wrench className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? t("ppm.noResults") : t("ppm.empty")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <Trans
              i18nKey="ppm.assignContractorsInfo"
              ns="contractors"
              components={[<a key="0" href="/ppm" className="text-primary hover:underline" />]}
            />
          </p>
        </GlassCard>
      )}

      {/* One card per contractor company */}
      {filtered.map(([key, group]) => {
        const overdueCount = group.items.filter(wo => wo.status === "overdue").length;
        const pendingCertCount = group.items.filter(wo => wo.status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt).length;
        return (
          <GlassCard key={key} className="p-0 overflow-hidden">
            {/* Company header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-fixed">{group.companyName}</p>
                  <p className="text-xs text-muted-foreground">{t("ppm.workOrder", { count: group.items.length })}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" />{t("ppm.overdue", { count: overdueCount })}
                  </span>
                )}
                {pendingCertCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <Shield className="h-3 w-3" />{t("ppm.certPending", { count: pendingCertCount })}
                  </span>
                )}
              </div>
            </div>
            {/* Work orders list */}
            <div className="divide-y divide-border">
              {group.items.map(wo => {
                const badge = PPM_STATUS_BADGE[wo.status] ?? { label: wo.status, className: "bg-gray-100 text-gray-700" };
                const isOverdue = wo.status === "overdue";
                const awaitingCert = wo.status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt;
                return (
                  <div key={wo.id} className={`flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${isOverdue ? "bg-red-50/40 dark:bg-red-950/20" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-fixed truncate">{wo.title}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                        {awaitingCert && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <Shield className="h-2.5 w-2.5" />{t("ppm.certNeeded")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {wo.contractorWorkerName && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />{wo.contractorWorkerName}
                          </span>
                        )}
                        {wo.dueDate && (
                          <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            <CalendarDays className="h-3 w-3" />{t("ppm.due", { date: new Date(wo.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) })}
                          </span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/ppm?wo=${wo.id}`}
                      className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />{t("ppm.view")}
                    </a>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
