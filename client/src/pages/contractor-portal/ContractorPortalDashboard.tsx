import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ContractorPortalLayout, { portalFetch, getPortalToken } from "./ContractorPortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, CheckCircle, Clock, XCircle, AlertTriangle,
  Upload, Users, ArrowRight
} from "lucide-react";

interface DocStats {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  total: number;
}

interface PortalUser {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  companyStatus: string;
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

export default function ContractorPortalDashboard() {
  const [, navigate] = useLocation();

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

  const { data: rawDocs } = useQuery<Document[]>({
    queryKey: ["portal-documents"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/documents");
      if (!r.ok) throw new Error("docs");
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const docs = Array.isArray(rawDocs) ? rawDocs : [];
  const recentDocs = docs.slice(0, 5);

  const statCards = [
    {
      label: "Pending review",
      value: stats?.pending ?? 0,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: Clock,
    },
    {
      label: "Approved",
      value: stats?.approved ?? 0,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
      icon: CheckCircle,
    },
    {
      label: "Rejected",
      value: stats?.rejected ?? 0,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      icon: XCircle,
    },
    {
      label: "Expired",
      value: stats?.expired ?? 0,
      color: "text-slate-500",
      bg: "bg-slate-50",
      border: "border-slate-200",
      icon: AlertTriangle,
    },
  ];

  return (
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statCards.map(({ label, value, color, bg, border, icon: Icon }) => (
          <div
            key={label}
            className={`rounded-xl border p-4 ${bg} ${border}`}
          >
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
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700"
                onClick={() => navigate("/contractor-portal/documents")}
              >
                View all
                <ArrowRight className="h-3 w-3 ml-1" />
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
                      <div
                        key={doc.id}
                        className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">{doc.documentName}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(doc.uploadedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
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
              <Button
                className="w-full justify-start bg-blue-600 hover:bg-blue-700"
                onClick={() => navigate("/contractor-portal/documents")}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload a document
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate("/contractor-portal/workers")}
              >
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
                    <p className="text-xs text-red-600 mt-0.5">
                      Please re-upload the rejected documents to maintain compliance.
                    </p>
                    <Button
                      size="sm"
                      variant="link"
                      className="text-red-700 p-0 h-auto text-xs mt-1"
                      onClick={() => navigate("/contractor-portal/documents")}
                    >
                      Review and re-upload
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ContractorPortalLayout>
  );
}
