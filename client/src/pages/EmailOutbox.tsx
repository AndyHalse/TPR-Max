import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Mail, Search, Trash2, RefreshCw, Eye, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CompanySettings } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

interface EmailSummary {
  id: string;
  sentAt: string;
  recipientEmail: string;
  subject: string;
  emailType: string;
  status: string;
}

interface EmailDetail extends EmailSummary {
  htmlBody: string;
  textBody: string;
}

const EMAIL_TYPE_COLORS: Record<string, string> = {
  "Evacuation Alert": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Fire Marshal Alert": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Visitor Invitation": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "E-Pass": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Room Booking": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "Meeting Reminder": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "Induction Link": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Checkout Reminder": "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "Report": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "Welcome / Onboarding": "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Card Notification": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "System Email": "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
};

function formatDateTime(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmailOutbox() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
    queryFn: getQueryFn<CompanySettings>({ on401: "returnNull" }),
    staleTime: 30 * 1000,
  });

  const { data, isLoading, refetch } = useQuery<{ emails: EmailSummary[]; total: number }>({
    queryKey: ["/api/email-log"],
    enabled: settings?.featureEmailOutbox === true,
    staleTime: 10 * 1000,
  });

  const { data: previewData, isLoading: previewLoading } = useQuery<EmailDetail>({
    queryKey: ["/api/email-log", previewId],
    queryFn: async () => {
      const res = await fetch(`/api/email-log/${previewId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load email: ${res.status}`);
      return res.json();
    },
    enabled: !!previewId,
    staleTime: 60 * 1000,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/email-log/clear"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-log"] });
      toast({ title: "Email history cleared", description: "All logged emails have been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear email history.", variant: "destructive" });
    },
  });

  if (settings && !settings.featureEmailOutbox) {
    return (
      <div className="max-w-2xl mx-auto mt-20 px-4">
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <Mail className="w-10 h-10 text-slate-400" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">Email Outbox is disabled</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Enable the Email Outbox feature in Settings to start logging all system emails and preview them here.
            </p>
            <Button onClick={() => navigate("/settings")} variant="outline">
              Go to Settings to enable it
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emails = data?.emails ?? [];
  const filtered = emails.filter(
    (e) =>
      !search ||
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.recipientEmail.toLowerCase().includes(search.toLowerCase()) ||
      e.emailType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Mail className="w-7 h-7 text-sky-600" />
            Email Outbox
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            All emails sent by the system — click any row to preview exactly what the recipient received
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {emails.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear History
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Clear Email History
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {emails.length} logged emails. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by subject, recipient, or type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Email list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading emails...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <div className="flex justify-center">
            <div className="p-5 bg-slate-100 dark:bg-slate-800 rounded-full">
              <Mail className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            </div>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {search ? "No emails match your search" : "No emails logged yet"}
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-sm max-w-sm mx-auto">
            {search
              ? "Try a different search term."
              : "Emails will appear here automatically once the system sends any (visitor invitations, evacuation alerts, e-passes, booking confirmations, etc.)"}
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {filtered.length} {filtered.length === 1 ? "email" : "emails"}
              {search && ` matching "${search}"`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((email) => (
                <button
                  key={email.id}
                  onClick={() => setPreviewId(email.id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                        {email.subject}
                      </span>
                      <Badge
                        className={`text-xs px-1.5 py-0 font-normal ${EMAIL_TYPE_COLORS[email.emailType] ?? EMAIL_TYPE_COLORS["System Email"]}`}
                        variant="outline"
                      >
                        {email.emailType}
                      </Badge>
                      {email.status === "failed" && (
                        <Badge className="text-xs px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" variant="outline">
                          Failed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>To: {email.recipientEmail}</span>
                      <span>·</span>
                      <span>{formatDateTime(email.sentAt)}</span>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewId} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Mail className="w-4 h-4 text-sky-600" />
              Email Preview
            </DialogTitle>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500 text-sm">Loading email...</span>
            </div>
          ) : previewData ? (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              {/* Meta */}
              <div className="flex-shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 min-w-16">Subject:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{previewData.subject}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 min-w-16">To:</span>
                  <span className="text-slate-700 dark:text-slate-300">{previewData.recipientEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 min-w-16">Sent:</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatDateTime(previewData.sentAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 min-w-16">Type:</span>
                  <Badge
                    className={`text-xs px-1.5 py-0 font-normal ${EMAIL_TYPE_COLORS[previewData.emailType] ?? EMAIL_TYPE_COLORS["System Email"]}`}
                    variant="outline"
                  >
                    {previewData.emailType}
                  </Badge>
                  {previewData.status === "failed" && (
                    <Badge className="text-xs px-1.5 py-0 bg-red-100 text-red-700" variant="outline">
                      Failed to send
                    </Badge>
                  )}
                </div>
              </div>

              {/* HTML preview in sandboxed iframe */}
              <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-white">
                {previewData.htmlBody ? (
                  <iframe
                    srcDoc={previewData.htmlBody}
                    sandbox="allow-same-origin"
                    style={{ width: "100%", height: "100%", minHeight: "420px", border: "none" }}
                    title="Email preview"
                  />
                ) : (
                  <div className="p-4 whitespace-pre-wrap text-sm text-slate-700 font-mono overflow-auto h-full">
                    {previewData.textBody || "No content available"}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
