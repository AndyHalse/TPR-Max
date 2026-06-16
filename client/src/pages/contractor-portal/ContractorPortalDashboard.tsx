import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ContractorPortalLayout, { portalFetch, getPortalToken } from "./ContractorPortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText, CheckCircle, Clock, XCircle, AlertTriangle,
  Upload, Users, ArrowRight, Send, CheckCheck, Loader2, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DocStats {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  total: number;
}

interface OnboardingProgress {
  onboardingStatus: string;
  onboardingSubmittedAt: string | null;
  onboardingApprovedAt: string | null;
  requiredCount: number;
  completedCount: number;
  canSubmit: boolean;
  missingRequired: string[];
  changesRequestedReason: string | null;
}

interface PortalUser {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  companyStatus: string;
  onboardingStatus: string;
}

interface Document {
  id: string;
  documentName: string;
  documentType: string;
  status: string;
  expiryDate?: string;
  uploadedAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending review", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
  expired: { label: "Expired", color: "bg-slate-100 text-slate-600", icon: AlertTriangle },
};

const onboardingStatusMeta: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_started:        { label: "Not started",        color: "text-slate-500",  bg: "bg-slate-50",  border: "border-slate-200" },
  in_progress:        { label: "In progress",        color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  submitted:          { label: "Submitted for review", color: "text-amber-600", bg: "bg-amber-50",  border: "border-amber-200" },
  approved:           { label: "Approved for site",  color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
  changes_requested:  { label: "Changes requested",  color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
};

export default function ContractorPortalDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user } = useQuery<PortalUser>({
    queryKey: ["portal-me"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/me");
      if (!r.ok) throw new Error("auth");
      return r.json();
    },
    enabled: !!getPortalToken(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats } = useQuery<DocStats>({
    queryKey: ["portal-doc-stats"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/document-stats");
      if (!r.ok) throw new Error("stats");
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const { data: progress, isLoading: progressLoading } = useQuery<OnboardingProgress>({
    queryKey: ["portal-onboarding-progress"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/onboarding-progress");
      if (!r.ok) throw new Error("progress");
      return r.json();
    },
    enabled: !!getPortalToken(),
    staleTime: 30 * 1000,
  });

  const { data: rawDocs } = useQuery<Document[]>({
    queryKey: ["portal-documents"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/documents");
      if (!r.ok) throw new Error("docs");
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await portalFetch("/api/contractor-portal/submit-for-review", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.missing?.join(", ") || data.error || "Submission failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Submitted for review", description: "The site team will be in touch once they've reviewed your documents." });
      qc.invalidateQueries({ queryKey: ["portal-onboarding-progress"] });
      qc.invalidateQueries({ queryKey: ["portal-me"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not submit", description: err.message, variant: "destructive" });
    },
  });

  const docs = Array.isArray(rawDocs) ? rawDocs : [];
  const recentDocs = docs.slice(0, 5);

  const statCards = [
    { label: "Pending review", value: stats?.pending ?? 0, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: Clock },
    { label: "Approved", value: stats?.approved ?? 0, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", icon: CheckCircle },
    { label: "Rejected", value: stats?.rejected ?? 0, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: XCircle },
    { label: "Expired", value: stats?.expired ?? 0, color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", icon: AlertTriangle },
  ];

  const os = progress?.onboardingStatus ?? "not_started";
  const osMeta = onboardingStatusMeta[os] ?? onboardingStatusMeta.not_started;
  const pct = progress && progress.requiredCount > 0
    ? Math.round((progress.completedCount / progress.requiredCount) * 100)
    : 0;

  function onboardingMessage(): string {
    if (!progress) return "";
    switch (os) {
      case "not_started": return "Upload your required compliance documents to begin onboarding.";
      case "in_progress":
        if (progress.completedCount < progress.requiredCount) {
          const n = progress.requiredCount - progress.completedCount;
          return `${n} required document${n !== 1 ? "s" : ""} still needed: ${progress.missingRequired.slice(0, 2).join(", ")}${progress.missingRequired.length > 2 ? "…" : ""}.`;
        }
        return "All required documents are uploaded — you can submit for review now.";
      case "submitted":
        return `Submitted ${progress.onboardingSubmittedAt ? "on " + new Date(progress.onboardingSubmittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""} — waiting for the site team to review.`;
      case "approved":
        return `✅ Approved — you're cleared to work on site.`;
      case "changes_requested":
        return progress.changesRequestedReason
          ? `Changes requested: "${progress.changesRequestedReason}"`
          : "Changes requested — please update your documents and re-submit.";
      default: return "";
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
    <ContractorPortalLayout>
      {/* Welcome */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
        </h2>
        <p className="text-slate-500 mt-1">
          Manage your compliance documents and keep your records up to date.
        </p>
      </div>

      {/* ── Onboarding Progress Panel ── */}
      {!progressLoading && (
        <div className={`rounded-xl border p-5 mb-6 ${osMeta.bg} ${osMeta.border}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-700">Onboarding</span>
                <Badge className={`text-xs ${os === "approved" ? "bg-green-600 text-white" : os === "submitted" ? "bg-amber-500 text-white" : os === "changes_requested" ? "bg-red-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                  {osMeta.label}
                </Badge>
              </div>
              {progress && progress.requiredCount > 0 && (
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Required documents: {progress.completedCount} of {progress.requiredCount} complete</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              )}
              <p className={`text-sm mt-1 ${osMeta.color}`}>{onboardingMessage()}</p>
            </div>

            {/* Submit button — shown when in states where submission makes sense */}
            {["not_started", "in_progress", "changes_requested"].includes(os) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                      disabled={!progress?.canSubmit || submitMutation.isPending}
                      onClick={() => submitMutation.mutate()}
                    >
                      {submitMutation.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</>
                        : <><Send className="h-4 w-4 mr-2" />Submit for review</>
                      }
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">
                  {progress?.canSubmit
                    ? "All required documents are in place — click to submit for site approval."
                    : progress?.missingRequired && progress.missingRequired.length > 0
                      ? `Still needed: ${progress.missingRequired.join(", ")}`
                      : "Upload all required documents first."
                  }
                </TooltipContent>
              </Tooltip>
            )}

            {os === "submitted" && (
              <div className="flex items-center gap-2 text-amber-700 text-sm">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>Awaiting review</span>
              </div>
            )}
            {os === "approved" && (
              <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                <CheckCheck className="h-4 w-4 flex-shrink-0" />
                <span>Approved for site</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statCards.map(({ label, value, color, bg, border, icon: Icon }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg} ${border}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent documents */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Recent documents
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700" onClick={() => navigate("/contractor-portal/documents")}>
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentDocs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No documents uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDocs.map((doc) => {
                    const cfg = statusConfig[doc.status] ?? statusConfig.pending;
                    const Icon = cfg.icon;
                    return (
                      <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{doc.documentName}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(doc.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${cfg.color}`}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/contractor-portal/documents")}>
                <Upload className="h-4 w-4 mr-2" />
                Upload a document
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/contractor-portal/workers")}>
                <Users className="h-4 w-4 mr-2" />
                View workers
              </Button>
            </CardContent>
          </Card>

          {(stats?.rejected ?? 0) > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">
                      {stats!.rejected} document{stats!.rejected !== 1 ? "s" : ""} rejected
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">Please re-upload the rejected documents to maintain compliance.</p>
                    <Button size="sm" variant="link" className="text-red-700 p-0 h-auto text-xs mt-1" onClick={() => navigate("/contractor-portal/documents")}>
                      Review and re-upload
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {os === "changes_requested" && progress?.changesRequestedReason && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Changes requested</p>
                    <p className="text-xs text-amber-700 mt-0.5">"{progress.changesRequestedReason}"</p>
                    <Button size="sm" variant="link" className="text-amber-700 p-0 h-auto text-xs mt-1" onClick={() => navigate("/contractor-portal/documents")}>
                      Update documents
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ContractorPortalLayout>
    </TooltipProvider>
  );
}
