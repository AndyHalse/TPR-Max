import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Globe, Send, Users, Building2, Loader2, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import GlassCard from "@/components/GlassCard";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

export default function ContractorPortalAdmin() {
  const [, setLocation] = useLocation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");

  const { data: companies = [] } = useQuery<any[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: allPortalUsers = [], refetch: refetchPortalUsers } = useQuery<any[]>({
    queryKey: ["/api/contractor-portal/all-users"],
    queryFn: async () => {
      const results: any[] = [];
      for (const company of companies) {
        try {
          const res = await fetch(`/api/contractors/${company.id}/portal-users`, { credentials: "include" });
          if (res.ok) {
            const users = await res.json();
            users.forEach((u: any) => results.push({ ...u, companyName: company.companyName, companyId: company.id }));
          }
        } catch {}
      }
      return results;
    },
    enabled: companies.length > 0,
  });

  const sendInviteMutation = useMutation({
    mutationFn: async ({ companyId, email }: { companyId: string; email: string }) => {
      const res = await apiRequest("POST", `/api/contractors/${companyId}/portal-invite`, { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", description: `Portal invite sent to ${inviteEmail}.` });
      setInviteEmail("");
      setInviteCompanyId("");
      setInviteOpen(false);
      refetchPortalUsers();
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invite", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const activeCount = allPortalUsers.filter((u) => u.inviteAccepted).length;
  const pendingCount = allPortalUsers.filter((u) => !u.inviteAccepted).length;
  const companiesWithPortal = new Set(allPortalUsers.map((u) => u.companyId)).size;

  return (
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/contractor-portal/login", "_blank")}
            className="flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open Portal
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Send Invite
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active portal users</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending invites</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{companiesWithPortal}</p>
              <p className="text-xs text-muted-foreground">Companies with portal access</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Portal users list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Portal Users
          </CardTitle>
          <CardDescription>
            All contractor contacts who have been invited to or have access to the self-service portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allPortalUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No portal users yet</p>
              <p className="text-sm mt-1">Send an invite to give a contractor company access to the portal.</p>
              <Button className="mt-4" onClick={() => setInviteOpen(true)}>
                <Send className="w-4 h-4 mr-2" />
                Send First Invite
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {allPortalUsers.map((u: any) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full flex-shrink-0">
                      <Users className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{u.email}</p>
                      <button
                        className="text-xs text-blue-600 hover:underline text-left"
                        onClick={() => setLocation(`/contractors/${u.companyId}?tab=portal`)}
                      >
                        {u.companyName}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {u.invitedAt ? `Invited ${new Date(u.invitedAt).toLocaleDateString()}` : "—"}
                    </span>
                    <Badge variant={u.inviteAccepted ? "default" : "secondary"}>
                      {u.inviteAccepted ? "Active" : "Invite pending"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Portal Invite</DialogTitle>
            <DialogDescription>
              Choose a contractor company and enter the contact's email. They'll receive a link to set their password and access the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contractor company</Label>
              <Select value={inviteCompanyId} onValueChange={setInviteCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a company…" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email address</Label>
              <Input
                id="inv-email"
                type="email"
                placeholder="contact@contractorcompany.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendInviteMutation.mutate({ companyId: inviteCompanyId, email: inviteEmail.trim() })}
              disabled={!inviteEmail.trim() || !inviteCompanyId || sendInviteMutation.isPending}
            >
              {sendInviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
