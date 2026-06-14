import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Globe, Send, Users, Building2, Loader2,
  CheckCircle2, Clock, Plus, MailCheck, ShieldOff, FileText,
  CheckCheck, XCircle, Eye, RefreshCw, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import GlassCard from "@/components/GlassCard";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

const OVERVIEW_KEY = ["/api/contractor-portal/admin-overview"];

const EMPTY_CONTRACTOR = {
  name: "", email: "", contactFirstName: "", contactLastName: "",
  phone: "", address: "", postcode: "", website: "", description: "",
  industry: "", status: "pending",
  publicLiabilityExpiry: "", employersLiabilityExpiry: "",
  healthSafetyExpiry: "", cisRegistration: "",
};

export default function ContractorPortalAdmin() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [contractorForm, setContractorForm] = useState({ ...EMPTY_CONTRACTOR });
  const [postCreateInviteOpen, setPostCreateInviteOpen] = useState(false);
  const [postCreateCompanyId, setPostCreateCompanyId] = useState("");
  const [postCreateEmail, setPostCreateEmail] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ docId: string; documentName: string; companyName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/contractors"] });

  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useQuery<{ portalUsers: any[]; pendingDocs: any[] }>({
    queryKey: OVERVIEW_KEY,
  });

  const allPortalUsers: any[] = overview?.portalUsers ?? [];
  const allPendingDocs: any[] = overview?.pendingDocs ?? [];

  const createContractorMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contractors", data);
      return res.json();
    },
    onSuccess: (created: any) => {
      toast({ title: "Contractor added", description: `${contractorForm.name} has been created.` });
      qc.invalidateQueries({ queryKey: ["/api/contractors"] });
      setAddOpen(false);
      const email = contractorForm.email;
      const id = created?.id ?? created?.contractor?.id;
      setContractorForm({ ...EMPTY_CONTRACTOR });
      if (id) {
        setPostCreateCompanyId(id);
        setPostCreateEmail(email);
        setPostCreateInviteOpen(true);
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to add contractor", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: async ({ companyId, email }: { companyId: string; email: string }) => {
      const res = await apiRequest("POST", `/api/contractors/${companyId}/portal-invite`, { email });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Invitation sent", description: `Portal invite sent to ${variables.email}.` });
      setInviteEmail(""); setInviteCompanyId(""); setInviteOpen(false);
      setPostCreateInviteOpen(false);
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invite", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const resendLoginMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/contractors/portal-users/${userId}/resend-login`, {});
      return res.json();
    },
    onSuccess: (_data, userId) => {
      const u = allPortalUsers.find((p: any) => p.id === userId);
      toast({ title: "Login details sent", description: `Portal URL and username emailed to ${u?.email ?? "the user"}.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to resend login details", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/contractors/portal-users/${userId}/revoke`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Access revoked", description: `${revokeTarget?.email} can no longer log in.` });
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (err: any) => {
      toast({ title: "Failed to revoke access", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const reviewDocMutation = useMutation({
    mutationFn: async ({ docId, status, rejectedReason }: { docId: string; status: string; rejectedReason?: string }) => {
      const res = await apiRequest("PUT", `/api/contractors/documents/${docId}/review`, { status, rejectedReason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document updated" });
      setRejectTarget(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      qc.invalidateQueries({ queryKey: ["/api/contractors"] });
      qc.invalidateQueries({ queryKey: ["/api/compliance-dashboard"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update document", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const activeCount = allPortalUsers.filter((u) => u.isActive).length;
  const pendingCount = allPortalUsers.filter((u) => !u.isActive && u.hasPendingInvite).length;
  const revokedCount = allPortalUsers.filter((u) => !u.isActive && !u.hasPendingInvite).length;
  const companiesWithPortal = new Set(allPortalUsers.map((u) => u.companyId)).size;
  const pendingDocsCount = allPendingDocs.length;

  const cf = contractorForm;
  const addDisabled = !cf.name || !cf.email || !cf.contactFirstName || !cf.contactLastName || !cf.phone || !cf.address || createContractorMutation.isPending;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="p-3 sm:p-6 space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-8 w-8 text-orange-600" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">Contractor Portal</h1>
            <p className="text-sm text-muted-foreground">Manage contractor self-service portal access</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setInviteOpen(true)} className="flex items-center gap-2">
                <Send className="w-4 h-4" />
                Send Invite
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Send a portal invite to an existing contractor's contact email</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => setAddOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                Add Contractor
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Register a new contractor company and optionally send a portal invite</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Tooltip>
          <TooltipTrigger className="text-left w-full block">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{activeCount}</p>
                  <p className="text-xs text-muted-foreground">Active users</p>
                </div>
              </div>
            </GlassCard>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Contractors who have accepted their invite and can log in to upload documents</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger className="text-left w-full block">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending invites</p>
                </div>
              </div>
            </GlassCard>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Invitations sent but not yet accepted — use Resend if they've missed the email</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger className="text-left w-full block">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><Building2 className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{companiesWithPortal}</p>
                  <p className="text-xs text-muted-foreground">Companies</p>
                </div>
              </div>
            </GlassCard>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Distinct contractor companies that have at least one portal user</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger className="text-left w-full block">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg"><FileText className="w-5 h-5 text-orange-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{pendingDocsCount}</p>
                  <p className="text-xs text-muted-foreground">Docs to review</p>
                </div>
              </div>
            </GlassCard>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Documents uploaded by contractors via the portal that are waiting for your approval</TooltipContent>
        </Tooltip>
      </div>

      {/* Tabs: Portal Users + Pending Documents */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Portal Users {allPortalUsers.length > 0 && <Badge variant="secondary" className="ml-1">{allPortalUsers.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Pending Documents {pendingDocsCount > 0 && <Badge variant="destructive" className="ml-1">{pendingDocsCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Portal Users tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Portal Users</CardTitle>
              <CardDescription>Contractor contacts with portal access. Active users can log in and upload documents; pending invites haven't accepted yet.</CardDescription>
            </CardHeader>
            <CardContent>
              {overviewError ? (
                <div className="text-center py-12 space-y-3">
                  <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
                  <p className="font-medium text-slate-700 dark:text-slate-300">Failed to load portal users</p>
                  <p className="text-sm text-muted-foreground">There was an error fetching data from the server.</p>
                  <Button variant="outline" onClick={() => refetchOverview()} className="gap-2">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </Button>
                </div>
              ) : overviewLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading portal users…</span>
                </div>
              ) : allPortalUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No portal users yet</p>
                  <p className="text-sm mt-1">Add a contractor and send them a portal invite to get started.</p>
                  <div className="flex gap-2 justify-center mt-4">
                    <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-2" />Add Contractor</Button>
                    <Button variant="outline" onClick={() => setInviteOpen(true)}><Send className="w-4 h-4 mr-2" />Send Invite</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {allPortalUsers.map((u: any) => {
                    const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
                    const resendBusy = resendLoginMutation.isPending && resendLoginMutation.variables === u.id;
                    const resendInviteBusy = sendInviteMutation.isPending && (sendInviteMutation.variables as any)?.email === u.email;
                    return (
                      <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full flex-shrink-0">
                            <Users className="w-4 h-4 text-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{fullName || u.email}</p>
                            {fullName && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                            <button className="text-xs text-blue-600 hover:underline text-left" onClick={() => setLocation(`/contractors/${u.companyId}?tab=portal`)}>
                              {u.companyName}
                            </button>
                            {u.isActive && (() => {
                              if (!u.lastLoginAt) return (
                                <span className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Never logged in
                                </span>
                              );
                              const days = Math.floor((Date.now() - new Date(u.lastLoginAt).getTime()) / 86400000);
                              const label = days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
                              const stale = days > 30;
                              return (
                                <span className={`flex items-center gap-1 text-xs mt-0.5 ${stale ? "text-amber-600" : "text-muted-foreground"}`}>
                                  {stale && <AlertTriangle className="w-3 h-3" />}
                                  Last login: {label}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {u.invitedAt ? new Date(u.invitedAt).toLocaleDateString() : "—"}
                          </span>
                          <Badge variant={u.isActive ? "default" : u.hasPendingInvite ? "secondary" : "outline"}
                                 className={!u.isActive && !u.hasPendingInvite ? "text-red-600 border-red-300" : undefined}>
                            {u.isActive ? "Active" : u.hasPendingInvite ? "Invite pending" : "Revoked"}
                          </Badge>
                          {!u.isActive && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendInviteMutation.mutate({ companyId: u.companyId, email: u.email })} disabled={sendInviteMutation.isPending}>
                                  {resendInviteBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} {u.hasPendingInvite ? "Resend" : "Re-invite"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">Resend the invitation email to {u.email}</TooltipContent>
                            </Tooltip>
                          )}
                          {u.isActive && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resendLoginMutation.mutate(u.id)} disabled={resendLoginMutation.isPending}>
                                    {resendBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <MailCheck className="w-3 h-3 mr-1" />}
                                    Resend Link
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Email them the portal URL, username and access code (no password)</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:text-red-700 hover:border-red-300" onClick={() => setRevokeTarget({ id: u.id, email: u.email })} disabled={revokeMutation.isPending}>
                                    <ShieldOff className="w-3 h-3 mr-1" /> Revoke
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Immediately block this user from logging into the portal</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setLocation(`/contractors/${u.companyId}`)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">View contractor details</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Documents tab */}
        <TabsContent value="docs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Documents Pending Review</CardTitle>
              <CardDescription>Documents uploaded by contractors via the portal. Approving or rejecting them updates the contractor record and compliance dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              {overviewError ? (
                <div className="text-center py-12 space-y-3">
                  <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
                  <p className="font-medium text-slate-700 dark:text-slate-300">Failed to load pending documents</p>
                  <p className="text-sm text-muted-foreground">There was an error fetching data from the server.</p>
                  <Button variant="outline" onClick={() => refetchOverview()} className="gap-2">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </Button>
                </div>
              ) : overviewLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading documents…</span>
                </div>
              ) : allPendingDocs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">All clear!</p>
                  <p className="text-sm mt-1">No documents waiting for review.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allPendingDocs.map((doc: any) => {
                    const approveBusy = reviewDocMutation.isPending && (reviewDocMutation.variables as any)?.docId === doc.id && (reviewDocMutation.variables as any)?.status === 'approved';
                    const rejectBusy = reviewDocMutation.isPending && (reviewDocMutation.variables as any)?.docId === doc.id && (reviewDocMutation.variables as any)?.status === 'rejected';
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-full flex-shrink-0">
                            <FileText className="w-4 h-4 text-orange-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">{doc.documentName}</p>
                              {doc.workerId
                                ? <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Worker doc</Badge>
                                : <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">Company doc</Badge>
                              }
                            </div>
                            <p className="text-xs text-muted-foreground">{doc.documentType} · {doc.companyName}</p>
                            {doc.workerId && (doc.workerFirstName || doc.workerLastName) && (
                              <p className="text-xs text-blue-600">Worker: {[doc.workerFirstName, doc.workerLastName].filter(Boolean).join(' ')}</p>
                            )}
                            {doc.expiryDate && (
                              <p className="text-xs text-muted-foreground">Expires: {new Date(doc.expiryDate).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}
                          </span>
                          {doc.documentUrl && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(doc.documentUrl, "_blank")}>
                                  <Eye className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">Preview document in a new tab</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => reviewDocMutation.mutate({ docId: doc.id, status: "approved" })} disabled={reviewDocMutation.isPending}>
                                {approveBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCheck className="w-3 h-3 mr-1" />} Approve
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Mark as approved — updates contractor compliance status</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => { setRejectTarget({ docId: doc.id, documentName: doc.documentName, companyName: doc.companyName }); setRejectReason(""); }} disabled={reviewDocMutation.isPending}>
                                {rejectBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />} Reject
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Reject this document — contractor will be notified and can re-upload via the portal</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add Contractor Dialog ─────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Add New Contractor Company</DialogTitle>
            <DialogDescription>Create a new contractor company. They'll appear in Contractor Management and you can invite them to the portal straight away.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Company Name *</Label>
              <Input value={cf.name} onChange={(e) => setContractorForm({ ...cf, name: e.target.value })} placeholder="e.g. Apex Electrical Ltd" />
            </div>
            <div className="space-y-2">
              <Label>Contact First Name *</Label>
              <Input value={cf.contactFirstName} onChange={(e) => setContractorForm({ ...cf, contactFirstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact Last Name *</Label>
              <Input value={cf.contactLastName} onChange={(e) => setContractorForm({ ...cf, contactLastName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input type="email" value={cf.email} onChange={(e) => setContractorForm({ ...cf, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input type="tel" value={cf.phone} onChange={(e) => setContractorForm({ ...cf, phone: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Address *</Label>
              <Textarea value={cf.address} onChange={(e) => setContractorForm({ ...cf, address: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input value={cf.postcode} onChange={(e) => setContractorForm({ ...cf, postcode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={cf.website} onChange={(e) => setContractorForm({ ...cf, website: e.target.value })} placeholder="https://" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <select value={cf.industry} onChange={(e) => setContractorForm({ ...cf, industry: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="">Select industry</option>
                <option value="construction">Construction</option>
                <option value="engineering">Engineering</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing &amp; Heating</option>
                <option value="mechanical">Mechanical</option>
                <option value="roofing">Roofing</option>
                <option value="scaffolding">Scaffolding</option>
                <option value="demolition">Demolition</option>
                <option value="groundworks">Groundworks</option>
                <option value="painting">Painting &amp; Decorating</option>
                <option value="security">Security</option>
                <option value="cleaning">Cleaning &amp; Maintenance</option>
                <option value="landscaping">Landscaping</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>CIS Registration Number</Label>
              <Input value={cf.cisRegistration} onChange={(e) => setContractorForm({ ...cf, cisRegistration: e.target.value })} />
            </div>
            <div className="col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Compliance Documents Expiry Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Public Liability Insurance</Label>
                  <Input type="date" value={cf.publicLiabilityExpiry} onChange={(e) => setContractorForm({ ...cf, publicLiabilityExpiry: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Employers Liability Insurance</Label>
                  <Input type="date" value={cf.employersLiabilityExpiry} onChange={(e) => setContractorForm({ ...cf, employersLiabilityExpiry: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Health &amp; Safety Policy</Label>
                  <Input type="date" value={cf.healthSafetyExpiry} onChange={(e) => setContractorForm({ ...cf, healthSafetyExpiry: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createContractorMutation.mutate(contractorForm)} disabled={addDisabled} className="bg-blue-600 hover:bg-blue-700">
              {createContractorMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding…</> : "Add Contractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Post-create: Send invite now? ─────────────────────────────────────── */}
      <Dialog open={postCreateInviteOpen} onOpenChange={setPostCreateInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-green-600" />Send Portal Invite?</DialogTitle>
            <DialogDescription>The contractor has been added. Would you like to send them a portal invite now so they can upload compliance documents?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Email address</Label>
            <Input type="email" value={postCreateEmail} onChange={(e) => setPostCreateEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostCreateInviteOpen(false)}>Skip for now</Button>
            <Button onClick={() => sendInviteMutation.mutate({ companyId: postCreateCompanyId, email: postCreateEmail })} disabled={!postCreateEmail.trim() || sendInviteMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {sendInviteMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending…</> : <><Send className="w-4 h-4 mr-2" />Send Invite</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Standalone Send Invite ────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Portal Invite</DialogTitle>
            <DialogDescription>Choose a contractor company and enter the contact's email. They'll receive a link to set their password and access the portal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contractor company</Label>
              <Select value={inviteCompanyId} onValueChange={setInviteCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select a company…" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input type="email" placeholder="contact@contractorcompany.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => sendInviteMutation.mutate({ companyId: inviteCompanyId, email: inviteEmail.trim() })} disabled={!inviteEmail.trim() || !inviteCompanyId || sendInviteMutation.isPending}>
              {sendInviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke Confirm ───────────────────────────────────────────────────── */}
      <Dialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><ShieldOff className="w-5 h-5" />Revoke Portal Access</DialogTitle>
            <DialogDescription>This will immediately prevent <strong>{revokeTarget?.email}</strong> from logging into the portal. You can re-invite them at any time.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)} disabled={revokeMutation.isPending}>
              {revokeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Document Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><XCircle className="w-5 h-5" />Reject Document</DialogTitle>
            <DialogDescription>
              Rejecting <strong>{rejectTarget?.documentName}</strong> from <strong>{rejectTarget?.companyName}</strong>. The contractor will be notified by email and can re-upload via the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason for rejection *</Label>
            <Textarea
              placeholder="e.g. Document is expired, incorrect document type, illegible scan…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || reviewDocMutation.isPending}
              onClick={() => rejectTarget && reviewDocMutation.mutate({ docId: rejectTarget.docId, status: "rejected", rejectedReason: rejectReason.trim() })}
            >
              {reviewDocMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Reject Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
