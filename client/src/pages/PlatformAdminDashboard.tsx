import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, LogOut, Plus, Building2, Users, Calendar, CheckCircle2, XCircle, Settings, Edit, Palette, Trash2, AlertTriangle, UserPlus, BookOpen, FileText, Eye, EyeOff, Globe, Bug, TrendingUp, RotateCcw, FlameKindling, ClipboardList, Layers, Star } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PlatformAdminCustomerForm from "./PlatformAdminCustomerForm";
import PlatformAdminBugReports from "./PlatformAdminBugReports";
import { ShieldCheck } from "lucide-react";

interface PlatformAdmin {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Customer {
  id: string;
  companyName: string;
  slug: string;
  contactEmail: string;
  isActive: boolean;
  onboardingCompleted: boolean;
  maxVisitorsPerMonth: number;
  stripeCustomerId: string | null;
  isEnterprise: boolean;
  enterpriseGroupId: string | null;
  enterpriseRole: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

interface EnterpriseGroup {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AuditRow {
  id: string;
  adminId: string;
  adminUsername: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  author: string;
  status: 'draft' | 'published';
  coverImageUrl: string | null;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BlogPostForm {
  title: string;
  slug: string;
  summary: string;
  content: string;
  author: string;
  status: 'draft' | 'published';
  coverImageUrl: string;
  tags: string;
}

interface BrandingSettings {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  platformName: string;
  companyName: string;
  updatedAt: string;
}

function AuditLogTab() {
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading, error } = useQuery<{ success: boolean; audit: AuditRow[]; pagination: { limit: number; offset: number } }>({
    queryKey: ["/platform-admin/audit", offset],
    queryFn: async () => {
      const res = await fetch(`/platform-admin/audit?limit=${limit}&offset=${offset}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });

  const rows = data?.audit ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5" />Platform Admin Audit Log</CardTitle>
        <CardDescription>All sensitive platform admin actions are recorded here. Visible to super admins only.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" /><p className="text-sm text-gray-600">Loading audit log…</p></div>
        ) : error ? (
          <div className="text-center py-8 text-red-600"><AlertTriangle className="w-6 h-6 mx-auto mb-2" /><p className="text-sm">Failed to load audit log</p></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>No audit entries yet</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2 pr-4">When</th>
                    <th className="pb-2 pr-4">Admin</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2 pr-4">Target</th>
                    <th className="pb-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 pr-4 whitespace-nowrap text-gray-500 text-xs">{new Date(row.createdAt).toLocaleString('en-GB')}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.adminUsername}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={row.action.includes('purge') || row.action.includes('delete') ? 'destructive' : row.action.includes('restore') ? 'default' : 'secondary'} className="text-xs font-mono">
                          {row.action}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs">{row.targetLabel ?? row.targetId ?? '—'}</td>
                      <td className="py-2 text-xs text-gray-400 truncate max-w-xs">{row.details ? JSON.stringify(row.details) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}>Previous</Button>
              <span className="text-xs text-gray-500">Showing {offset + 1}–{offset + rows.length}</span>
              <Button variant="outline" size="sm" disabled={rows.length < limit} onClick={() => setOffset(o => o + limit)}>Next</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EnterpriseSettingsDialog({
  customer,
  groups,
  open,
  onOpenChange,
  onSuccess,
  isSuperAdmin,
}: {
  customer: Customer | null;
  groups: EnterpriseGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isSuperAdmin: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEnterprise, setIsEnterprise] = useState(customer?.isEnterprise ?? false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(customer?.enterpriseGroupId ?? '__none__');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSlug, setNewGroupSlug] = useState('');
  const [newGroupEmail, setNewGroupEmail] = useState('');

  // Sync local state when the customer prop changes
  useEffect(() => {
    setIsEnterprise(customer?.isEnterprise ?? false);
    setSelectedGroupId(customer?.enterpriseGroupId ?? '__none__');
    setShowCreateGroup(false);
    setNewGroupName('');
    setNewGroupSlug('');
    setNewGroupEmail('');
  }, [customer?.id, open]);

  const { data: statsData } = useQuery<{ success: boolean; siteCount: number; complianceScore: number | null; complianceDate: string | null }>({
    queryKey: ['/platform-admin/customers', customer?.id, 'enterprise-stats'],
    queryFn: async () => {
      const res = await fetch(`/platform-admin/customers/${customer?.id}/enterprise-stats`, { credentials: 'include' });
      return res.json();
    },
    enabled: open && !!customer?.id && !!customer?.isEnterprise,
  });

  const flagMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/platform-admin/customers/${customer?.id}/enterprise`, {
        isEnterprise,
        enterpriseGroupId: (isEnterprise && selectedGroupId && selectedGroupId !== '__none__') ? selectedGroupId : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/platform-admin/customers'] });
      onSuccess();
      onOpenChange(false);
      toast({ title: 'Saved', description: `${customer?.companyName} enterprise status updated.` });
    },
    onError: (e: any) => {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/platform-admin/enterprise-groups', {
        name: newGroupName.trim(),
        slug: newGroupSlug.trim(),
        contactEmail: newGroupEmail.trim() || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/platform-admin/enterprise-groups'] });
      setSelectedGroupId(data.group.id);
      setShowCreateGroup(false);
      setNewGroupName(''); setNewGroupSlug(''); setNewGroupEmail('');
      toast({ title: 'Group created', description: `"${data.group.name}" ready to use.` });
    },
    onError: (e: any) => {
      toast({ title: 'Failed to create group', description: e.message, variant: 'destructive' });
    },
  });

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function scoreColor(s: number | null) {
    if (s == null) return 'text-slate-400';
    if (s >= 80) return 'text-green-600';
    if (s >= 50) return 'text-amber-600';
    return 'text-red-600';
  }

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Enterprise Settings — {customer.companyName}
          </DialogTitle>
          <DialogDescription>
            Flag this customer as an enterprise account and optionally assign them to a group.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Enterprise customer</Label>
              <p className="text-xs text-gray-500 mt-0.5">Enables multi-site management, compliance dashboard, and estate reporting.</p>
            </div>
            <Switch checked={isEnterprise} onCheckedChange={setIsEnterprise} disabled={!isSuperAdmin} />
          </div>

          {isEnterprise && (
            <div className="space-y-2">
              <Label>Enterprise group <span className="text-gray-400 font-normal">(optional)</span></Label>
              {!showCreateGroup ? (
                <div className="flex gap-2">
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="None (standalone enterprise)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (standalone)</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isSuperAdmin && (
                    <Button variant="outline" size="icon" title="Create new group" onClick={() => setShowCreateGroup(true)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">New enterprise group</p>
                  <Input
                    placeholder="Group name (e.g. Cowiesburn Ltd)"
                    value={newGroupName}
                    onChange={e => { setNewGroupName(e.target.value); if (!newGroupSlug || newGroupSlug === autoSlug(newGroupName)) setNewGroupSlug(autoSlug(e.target.value)); }}
                  />
                  <Input
                    placeholder="Slug (e.g. cowiesburn-ltd)"
                    value={newGroupSlug}
                    onChange={e => setNewGroupSlug(e.target.value)}
                  />
                  <Input
                    placeholder="Contact email (optional)"
                    type="email"
                    value={newGroupEmail}
                    onChange={e => setNewGroupEmail(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createGroupMutation.mutate()} disabled={!newGroupName.trim() || !newGroupSlug.trim() || createGroupMutation.isPending}>
                      {createGroupMutation.isPending ? 'Creating…' : 'Create group'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateGroup(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400">Groups let you organise multiple enterprise customers (e.g. subsidiaries of the same parent) together.</p>
            </div>
          )}

          {customer.isEnterprise && statsData?.success && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current stats</p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Active sites</span>
                <span className="font-semibold">{statsData.siteCount}</span>
              </div>
              {statsData.complianceScore !== null && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Estate compliance score</span>
                    <span className={`font-semibold ${scoreColor(statsData.complianceScore)}`}>{statsData.complianceScore} / 100</span>
                  </div>
                  {statsData.complianceDate && (
                    <p className="text-xs text-slate-400">Score as at {statsData.complianceDate.split('-').reverse().join('/')}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => flagMutation.mutate()} disabled={flagMutation.isPending}>
            {flagMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [purgingCustomer, setPurgingCustomer] = useState<Customer | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [showDeletedCustomers, setShowDeletedCustomers] = useState(false);
  const [enterpriseCustomer, setEnterpriseCustomer] = useState<Customer | null>(null);

  // Blog state
  const [showBlogForm, setShowBlogForm] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<BlogPost | null>(null);
  const [blogForm, setBlogForm] = useState<BlogPostForm>({
    title: '', slug: '', summary: '', content: '', author: '', status: 'draft',
    coverImageUrl: '', tags: '',
  });
  const [blogCoverUploading, setBlogCoverUploading] = useState(false);
  const [blogCoverDragOver, setBlogCoverDragOver] = useState(false);
  const blogCoverInputRef = useRef<HTMLInputElement>(null);

  // Check authentication
  const { data: admin, isLoading: adminLoading, error } = useQuery<PlatformAdmin>({
    queryKey: ["/platform-admin/auth/me"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/auth/me", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      return response.json();
    },
    retry: false,
  });

  // Traffic analytics state — must be declared AFTER admin to avoid TDZ crash in production bundle
  const [trafficRange, setTrafficRange] = useState<'7d' | '30d' | '90d'>('30d');

  const { data: trafficData, isLoading: trafficLoading } = useQuery({
    queryKey: ['/platform-admin/traffic', trafficRange],
    queryFn: async () => {
      const res = await fetch(`/platform-admin/traffic?range=${trafficRange}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch traffic data');
      return res.json() as Promise<{
        totals: { views: number; uniqueVisitors: number };
        series: { date: string; views: number; uniqueVisitors: number }[];
        topPages: { path: string; views: number }[];
        topReferrers: { referrerHost: string; views: number }[];
      }>;
    },
    enabled: !!admin,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!adminLoading && error) {
      window.location.href = "/platform-admin/login";
    }
  }, [adminLoading, error]);

  const isSuperAdmin = admin?.role === 'super_admin';

  // Fetch customers
  const { data: customersData, isLoading: customersLoading } = useQuery<{ success: boolean; customers: Customer[] }>({
    queryKey: ["/platform-admin/customers", showDeletedCustomers],
    queryFn: async () => {
      const url = showDeletedCustomers
        ? "/platform-admin/customers?includeDeleted=true"
        : "/platform-admin/customers";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch customers");
      return response.json();
    },
    enabled: !!admin,
  });

  const customers = customersData?.customers || [];

  // Fetch enterprise groups (for the enterprise settings dialog)
  const { data: enterpriseGroupsData } = useQuery<{ success: boolean; groups: EnterpriseGroup[] }>({
    queryKey: ['/platform-admin/enterprise-groups'],
    queryFn: async () => {
      const res = await fetch('/platform-admin/enterprise-groups', { credentials: 'include' });
      return res.json();
    },
    enabled: !!admin,
  });
  const enterpriseGroups = enterpriseGroupsData?.groups ?? [];

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/auth/logout", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/platform-admin/login";
    },
  });

  // Toggle customer status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ customerId, isActive }: { customerId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/platform-admin/customers/${customerId}/status`, {
        isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      toast({
        title: "Success",
        description: "Customer status updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer status",
        variant: "destructive",
      });
    },
  });

  // Fetch branding settings
  const { data: brandingData } = useQuery<{ success: boolean; branding: BrandingSettings }>({
    queryKey: ["/platform-admin/branding"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/branding", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch branding");
      return response.json();
    },
    enabled: !!admin,
  });

  const [brandingForm, setBrandingForm] = useState({
    primaryColor: '',
    secondaryColor: '',
    accentColor: '',
    logoUrl: '',
    platformName: '',
    companyName: '',
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [managingUsersCustomer, setManagingUsersCustomer] = useState<any | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const emptyUserForm = { username: '', email: '', password: '', role: 'user', firstName: '', lastName: '' };
  const [userForm, setUserForm] = useState({ ...emptyUserForm });

  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [newAdminForm, setNewAdminForm] = useState({
    username: '', email: '', password: '', firstName: '', lastName: '', role: 'admin',
  });
  const [editAdminForm, setEditAdminForm] = useState({
    email: '', firstName: '', lastName: '', password: '', role: 'admin',
  });

  const { data: adminsData, isLoading: adminsLoading, error: adminsError } = useQuery<{ success: boolean; admins: any[] }>({
    queryKey: ["/platform-admin/admins"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/admins", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch admins");
      return response.json();
    },
    enabled: !!admin && showSettings,
  });

  const createAdminMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/admins", newAdminForm);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/admins"] });
      setShowAddAdmin(false);
      setNewAdminForm({ username: '', email: '', password: '', firstName: '', lastName: '', role: 'admin' });
      toast({ title: "Success", description: "Admin user created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create admin", variant: "destructive" });
    },
  });

  const updateAdminMutation = useMutation({
    mutationFn: async () => {
      if (!editingAdmin) throw new Error("No admin selected");
      const payload: any = {};
      if (editAdminForm.email) payload.email = editAdminForm.email;
      if (editAdminForm.firstName) payload.firstName = editAdminForm.firstName;
      if (editAdminForm.lastName) payload.lastName = editAdminForm.lastName;
      if (editAdminForm.password) payload.password = editAdminForm.password;
      if (editAdminForm.role) payload.role = editAdminForm.role;
      const response = await apiRequest("PATCH", `/platform-admin/admins/${editingAdmin.id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/admins"] });
      setEditingAdmin(null);
      toast({ title: "Success", description: "Admin user updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update admin", variant: "destructive" });
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiRequest("DELETE", `/platform-admin/admins/${adminId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/admins"] });
      toast({ title: "Success", description: "Admin user deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete admin", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (brandingData?.branding) {
      setBrandingForm({
        primaryColor: brandingData.branding.primaryColor,
        secondaryColor: brandingData.branding.secondaryColor,
        accentColor: brandingData.branding.accentColor,
        logoUrl: brandingData.branding.logoUrl || '',
        platformName: brandingData.branding.platformName,
        companyName: brandingData.branding.companyName,
      });
    }
  }, [brandingData]);

  // Update branding settings mutation
  const updateBrandingMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = brandingForm.logoUrl;
      
      // Upload logo file if one was selected
      if (logoFile) {
        // Get CSRF token first
        const csrfResponse = await fetch('/api/csrf-token', {
          credentials: 'include',
        });
        const { csrfToken } = await csrfResponse.json();
        
        const formData = new FormData();
        formData.append('logo', logoFile);
        
        const uploadResponse = await fetch('/platform-admin/branding/upload-logo', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-CSRF-Token': csrfToken,
          },
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to upload logo');
        }
        
        const uploadData = await uploadResponse.json();
        logoUrl = uploadData.logoUrl;
      }
      
      const response = await apiRequest("PUT", "/platform-admin/branding", {
        ...brandingForm,
        logoUrl,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/branding"] });
      setShowSettings(false);
      setLogoFile(null);
      toast({
        title: "Success",
        description: "Branding settings updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update branding settings",
        variant: "destructive",
      });
    },
  });

  // Edit customer mutation
  const [editForm, setEditForm] = useState({
    companyName: '',
    contactEmail: '',
  });

  const [credentialReset, setCredentialReset] = useState({
    username: '',
    password: '',
    email: '',
  });

  useEffect(() => {
    if (editingCustomer) {
      setEditForm({
        companyName: editingCustomer.companyName,
        contactEmail: editingCustomer.contactEmail,
      });
      setCredentialReset({ username: '', password: '', email: '' });
    }
  }, [editingCustomer]);

  const editCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!editingCustomer) throw new Error("No customer selected");
      
      const response = await apiRequest("PATCH", `/platform-admin/customers/${editingCustomer.id}`, editForm);
      
      if (credentialReset.username || credentialReset.password || credentialReset.email) {
        const credPayload: Record<string, string> = {};
        if (credentialReset.username) credPayload.username = credentialReset.username;
        if (credentialReset.password) credPayload.password = credentialReset.password;
        if (credentialReset.email)    credPayload.email    = credentialReset.email;
        try {
          await apiRequest("PATCH", `/platform-admin/customers/${editingCustomer.id}/credentials`, credPayload);
        } catch (credError: any) {
          const detailsUpdated = await response.json();
          queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
          throw new Error(`Customer details saved, but credential reset failed: ${credError.message || 'Unknown error'}`);
        }
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      setEditingCustomer(null);
      setCredentialReset({ username: '', password: '', email: '' });
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  const CORE_MODULES = [
    { key: 'featureDashboard', label: 'Dashboard' },
    { key: 'featureComplianceDashboard', label: 'Compliance Score' },
    { key: 'featureVisitors', label: 'Visitors' },
    { key: 'featureContractors', label: 'Contractors' },
    { key: 'featureStaff', label: 'Staff' },
    { key: 'featureMembers', label: 'Members' },
    { key: 'featureMeetingRooms', label: 'Meeting Rooms' },
    { key: 'featureTimeAttendance', label: 'T&A Report' },
    { key: 'featureMusterList', label: 'Muster List' },
    { key: 'featureIncidentReports', label: 'Incident Reports' },
    { key: 'featureHsIncidents', label: 'H&S Incidents' },
    { key: 'featureFireRiskAssessment', label: 'Fire Risk Assessment' },
    { key: 'featureMartynLaw', label: "Martyn's Law" },
    { key: 'featureReports', label: 'Reports' },
    { key: 'featureInductionSettings', label: 'Induction Settings' },
    { key: 'featureKiosk', label: 'Kiosk Mode' },
    { key: 'featureEmailOutbox', label: 'Email Outbox' },
    { key: 'featureHrModule', label: 'HR' },
    { key: 'featureSettingsPage', label: 'Settings' },
  ];
  const ADDON_MODULES = [
    { key: 'featurePPM', label: 'PPM (Planned Preventative Maintenance)' },
    { key: 'featureAuditEngine', label: 'Audits & Inspections' },
    { key: 'featureComplianceCertificates', label: 'Compliance Register' },
    { key: 'featurePermitToWork', label: 'Permit to Work' },
    { key: 'featureRaBuilder', label: 'RA Builder' },
    { key: 'featureHelpDesk', label: 'Help Desk' },
    { key: 'featureContractorPortal', label: 'Contractor Self-Service Portal' },
  ];

  // Fetch the selected customer's platform feature locks when the edit dialog opens
  const { data: customerFeatures } = useQuery<{ platformDisabledFeatures: string[] }>({
    queryKey: ["/platform-admin/customers", editingCustomer?.id, "features"],
    queryFn: async () => {
      const response = await fetch(`/platform-admin/customers/${editingCustomer!.id}/features`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch features");
      return response.json();
    },
    enabled: !!editingCustomer,
  });

  const [localDisabledFeatures, setLocalDisabledFeatures] = useState<string[] | null>(null);
  const disabledFeatures = localDisabledFeatures ?? customerFeatures?.platformDisabledFeatures ?? [];

  useEffect(() => {
    setLocalDisabledFeatures(null);
  }, [editingCustomer?.id]);

  const updateFeaturesMutation = useMutation({
    mutationFn: async ({ customerId, platformDisabledFeatures }: { customerId: string; platformDisabledFeatures: string[] }) => {
      const response = await apiRequest("PATCH", `/platform-admin/customers/${customerId}/features`, { platformDisabledFeatures });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers", editingCustomer?.id, "features"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update module features", variant: "destructive" });
    },
  });

  const toggleFeature = (key: string, enabled: boolean) => {
    const next = enabled
      ? disabledFeatures.filter(k => k !== key)
      : [...disabledFeatures.filter(k => k !== key), key];
    setLocalDisabledFeatures(next);
    updateFeaturesMutation.mutate({ customerId: editingCustomer!.id, platformDisabledFeatures: next });
  };

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const response = await apiRequest("DELETE", `/platform-admin/customers/${customerId}`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      setDeletingCustomer(null);
      setDeleteConfirmText('');
      toast({
        title: "Customer Deactivated",
        description: data.message || "Customer account has been soft-deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer account",
        variant: "destructive",
      });
    },
  });

  const restoreCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const response = await apiRequest("POST", `/platform-admin/customers/${customerId}/restore`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      toast({ title: "Customer Restored", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to restore customer", variant: "destructive" });
    },
  });

  const purgeCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const response = await apiRequest("DELETE", `/platform-admin/customers/${customerId}/purge`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      setPurgingCustomer(null);
      setPurgeConfirmText('');
      toast({ title: "Customer Purged", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to purge customer", variant: "destructive" });
    },
  });

  // ── User Management queries & mutations ──────────────────────────────────
  const { data: usersData, isLoading: usersLoading } = useQuery<{ success: boolean; users: any[] }>({
    queryKey: ["/platform-admin/customers", managingUsersCustomer?.id, "users"],
    queryFn: async () => {
      const response = await fetch(`/platform-admin/customers/${managingUsersCustomer!.id}/users`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: !!managingUsersCustomer,
  });

  const createUserMutation = useMutation({
    mutationFn: async (form: typeof userForm) => {
      const response = await apiRequest("POST", `/platform-admin/customers/${managingUsersCustomer!.id}/users`, form);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to create user");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers", managingUsersCustomer?.id, "users"] });
      setShowAddUser(false);
      setUserForm({ ...emptyUserForm });
      toast({ title: "User created", description: "New login added successfully." });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: any }) => {
      const response = await apiRequest("PATCH", `/platform-admin/customers/${managingUsersCustomer!.id}/users/${userId}`, patch);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to update user");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers", managingUsersCustomer?.id, "users"] });
      setEditingUser(null);
      setUserForm({ ...emptyUserForm });
      toast({ title: "User updated", description: "Login details saved." });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/platform-admin/customers/${managingUsersCustomer!.id}/users/${userId}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to delete user");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers", managingUsersCustomer?.id, "users"] });
      toast({ title: "User deleted" });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });
  // ── End User Management ────────────────────────────────────────────────

  // Blog queries and mutations
  const { data: blogData, isLoading: blogLoading } = useQuery<{ success: boolean; posts: BlogPost[] }>({
    queryKey: ["/api/admin/blog"],
    queryFn: async () => {
      const response = await fetch("/api/admin/blog", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch blog posts");
      return response.json();
    },
    enabled: !!admin,
  });

  const blogPosts = blogData?.posts || [];

  const openCreateBlog = () => {
    setBlogForm({ title: '', slug: '', summary: '', content: '', author: `${admin?.firstName || ''} ${admin?.lastName || ''}`.trim(), status: 'draft', coverImageUrl: '', tags: '' });
    setEditingPost(null);
    setShowBlogForm(true);
  };

  const openEditBlog = (post: BlogPost) => {
    setBlogForm({
      title: post.title,
      slug: post.slug,
      summary: post.summary,
      content: post.content,
      author: post.author,
      status: post.status,
      coverImageUrl: post.coverImageUrl || '',
      tags: (post.tags || []).join(', '),
    });
    setEditingPost(post);
    setShowBlogForm(true);
  };

  const autoSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const createBlogMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...blogForm,
        tags: blogForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        coverImageUrl: blogForm.coverImageUrl || null,
      };
      const response = await apiRequest("POST", "/api/admin/blog", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setShowBlogForm(false);
      toast({ title: "Post created", description: "Blog post saved successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create post", variant: "destructive" });
    },
  });

  const updateBlogPostMutation = useMutation({
    mutationFn: async () => {
      if (!editingPost) throw new Error("No post selected");
      const payload = {
        ...blogForm,
        tags: blogForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        coverImageUrl: blogForm.coverImageUrl || null,
      };
      const response = await apiRequest("PATCH", `/api/admin/blog/${editingPost.id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setShowBlogForm(false);
      setEditingPost(null);
      toast({ title: "Post updated", description: "Blog post updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update post", variant: "destructive" });
    },
  });

  const deleteBlogMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/blog/${postId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setDeletingPost(null);
      toast({ title: "Post deleted", description: "Blog post removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete post", variant: "destructive" });
    },
  });

  // ── Blog cover image upload ────────────────────────────────────────────────
  const uploadBlogCoverFile = async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Only JPEG, PNG, GIF and WebP images are allowed.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 5 MB.', variant: 'destructive' });
      return;
    }
    setBlogCoverUploading(true);
    try {
      const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfResponse.json();
      const formData = new FormData();
      formData.append('image', file);
      const uploadResponse = await fetch('/platform-admin/blog/upload-image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
      });
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload image');
      }
      const { coverImageUrl } = await uploadResponse.json();
      setBlogForm((f) => ({ ...f, coverImageUrl }));
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload image', variant: 'destructive' });
    } finally {
      setBlogCoverUploading(false);
    }
  };

  const handleBlogCoverDrop = (e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Not an image', description: 'Please drop an image file (JPEG, PNG, GIF or WebP).', variant: 'destructive' });
      return;
    }
    uploadBlogCoverFile(file);
  };

  const handleBlogCoverPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) { uploadBlogCoverFile(file); return; }
      }
    }
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return null;
  }

  const primaryColor = brandingData?.branding?.primaryColor || '#2460A9';
  const accentColor = brandingData?.branding?.accentColor || '#3B82F6';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header 
        className="shadow"
        style={{
          background: `linear-gradient(to right, ${primaryColor}, ${accentColor})`,
          color: 'white'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {brandingData?.branding?.logoUrl ? (
                <img 
                  src={brandingData.branding.logoUrl.startsWith('http') || brandingData.branding.logoUrl.startsWith('/') 
                    ? brandingData.branding.logoUrl 
                    : `/public-objects/${brandingData.branding.logoUrl}`
                  } 
                  alt={brandingData?.branding?.platformName || "Platform Admin"} 
                  className="h-10 object-contain bg-white/90 rounded p-1"
                  data-testid="img-dashboard-logo"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {brandingData?.branding?.platformName || "Platform Admin"}
                </h1>
                <p className="text-sm text-white/80">
                  Welcome, {admin.firstName} {admin.lastName}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                onClick={() => setShowSettings(true)}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                onClick={() => logoutMutation.mutate()}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="customers">
          <TabsList className="mb-6">
            <TabsTrigger value="customers">
              <Building2 className="w-4 h-4 mr-2" />Customers
            </TabsTrigger>
            <TabsTrigger value="blog">
              <BookOpen className="w-4 h-4 mr-2" />Blog
            </TabsTrigger>
            <TabsTrigger value="bug-reports">
              <Bug className="w-4 h-4 mr-2" />Bug Reports
            </TabsTrigger>
            <TabsTrigger value="traffic">
              <TrendingUp className="w-4 h-4 mr-2" />Traffic
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="audit">
                <ClipboardList className="w-4 h-4 mr-2" />Audit Log
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="customers">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Customers</CardDescription>
              <CardTitle className="text-3xl">{customers.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <Building2 className="w-4 h-4 text-gray-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {customers.filter(c => c.isActive).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Inactive</CardDescription>
              <CardTitle className="text-3xl text-red-600">
                {customers.filter(c => !c.isActive).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <XCircle className="w-4 h-4 text-red-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Onboarded</CardDescription>
              <CardTitle className="text-3xl text-blue-600">
                {customers.filter(c => c.onboardingCompleted).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Enterprise</CardDescription>
              <CardTitle className="text-3xl text-purple-600">
                {customers.filter(c => c.isEnterprise).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Layers className="w-4 h-4 text-purple-400" />
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Customer Accounts</CardTitle>
                <CardDescription>Manage all customer accounts from here</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <Button
                    variant={showDeletedCustomers ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowDeletedCustomers(v => !v)}
                  >
                    {showDeletedCustomers ? "Hide Deleted" : "Show Deleted"}
                  </Button>
                )}
                <Button onClick={() => setShowCustomerForm(true)} data-testid="button-add-customer">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {customersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading customers...</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-600">No customers yet</p>
                <p className="text-sm text-gray-400">Add your first customer to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid={`customer-${customer.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {customer.companyName}
                        </h3>
                        {customer.isActive ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                        {customer.onboardingCompleted && (
                          <Badge variant="outline" className="text-blue-700 border-blue-300">Onboarded</Badge>
                        )}
                        {customer.isEnterprise && (
                          <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700">
                            <Layers className="w-3 h-3 mr-1" />Enterprise
                          </Badge>
                        )}
                        {customer.deletedAt && (
                          <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Deleted</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {customer.contactEmail} • {customer.slug}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span>Created {new Date(customer.createdAt).toLocaleDateString('en-GB')}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setManagingUsersCustomer(customer); setShowAddUser(false); setEditingUser(null); setUserForm({ ...emptyUserForm }); }}
                        data-testid={`button-users-${customer.id}`}
                      >
                        <Users className="w-3 h-3 mr-1" />
                        Users
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCustomer(customer)}
                        data-testid={`button-edit-${customer.id}`}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEnterpriseCustomer(customer)}
                          data-testid={`button-enterprise-${customer.id}`}
                          className={customer.isEnterprise ? "text-purple-700 border-purple-300" : ""}
                        >
                          <Layers className="w-3 h-3 mr-1" />
                          Enterprise
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleStatusMutation.mutate({
                            customerId: customer.id,
                            isActive: !customer.isActive,
                          })
                        }
                        data-testid={`button-toggle-status-${customer.id}`}
                      >
                        {customer.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      {customer.deletedAt ? (
                        <>
                          {isSuperAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreCustomerMutation.mutate(customer.id)}
                              disabled={restoreCustomerMutation.isPending}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />Restore
                            </Button>
                          )}
                          {isSuperAdmin && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => { setPurgingCustomer(customer); setPurgeConfirmText(''); }}
                            >
                              <FlameKindling className="w-3 h-3 mr-1" />Purge
                            </Button>
                          )}
                        </>
                      ) : (
                        isSuperAdmin && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => { setDeletingCustomer(customer); setDeleteConfirmText(''); }}
                            data-testid={`button-delete-${customer.id}`}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />Delete
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          {/* ── Blog Tab ─────────────────────────────────────────── */}
          <TabsContent value="blog">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />Blog Posts
                    </CardTitle>
                    <CardDescription>Manage public-facing marketing blog posts</CardDescription>
                  </div>
                  <Button onClick={openCreateBlog} data-testid="button-new-post">
                    <Plus className="w-4 h-4 mr-2" />New Post
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {blogLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">Loading posts...</p>
                  </div>
                ) : blogPosts.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-600 font-medium">No blog posts yet</p>
                    <p className="text-sm text-gray-400 mb-4">Create your first post to get started</p>
                    <Button size="sm" onClick={openCreateBlog}>
                      <Plus className="w-4 h-4 mr-2" />Create Post
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blogPosts.map((post: BlogPost) => (
                      <div key={post.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 dark:text-white truncate">{post.title}</span>
                            {post.status === 'published' ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 shrink-0">
                                <Globe className="w-3 h-3 mr-1" />Published
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="shrink-0">
                                <EyeOff className="w-3 h-3 mr-1" />Draft
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate max-w-xl">{post.summary}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>/{post.slug}</span>
                            <span>by {post.author}</span>
                            {post.publishedAt && (
                              <span>{new Date(post.publishedAt).toLocaleDateString('en-GB')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          {post.status === 'published' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`/blog/${post.slug}`, '_blank')}
                              title="View post"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openEditBlog(post)}>
                            <Edit className="w-3 h-3 mr-1" />Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeletingPost(post)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bug-reports" className="mt-0">
            <PlatformAdminBugReports />
          </TabsContent>

          {/* ── Traffic Tab ─────────────────────────────────────────── */}
          <TabsContent value="traffic">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Website Traffic</h2>
                  <p className="text-sm text-gray-500">Public marketing pages only — no cookies, no PII, GDPR-friendly</p>
                </div>
                <div className="flex gap-2">
                  {(['7d', '30d', '90d'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setTrafficRange(r)}
                      className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                        trafficRange === r
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
                    </button>
                  ))}
                </div>
              </div>

              {trafficLoading ? (
                <div className="text-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading traffic data...</p>
                </div>
              ) : !trafficData || (trafficData.totals.views === 0 && trafficData.series.every(d => d.views === 0)) ? (
                <div className="text-center py-16">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No traffic recorded yet</p>
                  <p className="text-sm text-gray-400 mt-1">Visits to the public site will appear here once the tracker fires</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total page views</CardDescription>
                        <CardTitle className="text-3xl">{trafficData.totals.views.toLocaleString('en-GB')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-gray-500">
                          Last {trafficRange === '7d' ? '7' : trafficRange === '30d' ? '30' : '90'} days — bots excluded
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Unique visitors</CardDescription>
                        <CardTitle className="text-3xl">{trafficData.totals.uniqueVisitors.toLocaleString('en-GB')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-gray-500">Daily fingerprint — no cookies or PII stored</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Page views per day</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={trafficData.series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: '#6b7280' }}
                            tickFormatter={(d: string) => {
                              try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch { return d; }
                            }}
                            interval="preserveStartEnd"
                          />
                          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                          <Tooltip
                            formatter={(val: number) => [val.toLocaleString('en-GB'), 'Views']}
                            labelFormatter={(d: string) => {
                              try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; }
                            }}
                          />
                          <Area type="monotone" dataKey="views" stroke="#2563eb" strokeWidth={2} fill="url(#trafficGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Top pages</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {trafficData.topPages.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No data</p>
                        ) : (
                          <div className="space-y-2">
                            {trafficData.topPages.map((p) => (
                              <div key={p.path} className="flex items-center justify-between text-sm">
                                <span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[70%]">{p.path}</span>
                                <span className="text-gray-500 font-medium tabular-nums">{p.views.toLocaleString('en-GB')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Top referrers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {trafficData.topReferrers.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No data</p>
                        ) : (
                          <div className="space-y-2">
                            {trafficData.topReferrers.map((r) => (
                              <div key={r.referrerHost} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[70%]">{r.referrerHost}</span>
                                <span className="text-gray-500 font-medium tabular-nums">{r.views.toLocaleString('en-GB')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Audit Log Tab (super admin only) ─────────────────── */}
          {isSuperAdmin && (
            <TabsContent value="audit">
              <AuditLogTab />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Customer Form Dialog */}
      <Dialog open={showCustomerForm} onOpenChange={setShowCustomerForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer account without payment processing
            </DialogDescription>
          </DialogHeader>
          <PlatformAdminCustomerForm
            onSuccess={() => {
              setShowCustomerForm(false);
              queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Soft-Delete Confirmation Dialog */}
      <Dialog open={!!deletingCustomer} onOpenChange={(open) => { if (!open) { setDeletingCustomer(null); setDeleteConfirmText(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              <span>Deactivate Customer Account</span>
            </DialogTitle>
            <DialogDescription>
              This hides the customer from normal views. A super admin can restore it later, or purge it to permanently erase all data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                You are about to deactivate:
              </p>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100 mt-1">
                {deletingCustomer?.companyName}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                {deletingCustomer?.contactEmail}
              </p>
            </div>
            <div>
              <Label htmlFor="delete-confirm" className="text-sm font-medium">
                Type <span className="font-bold text-amber-600">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="mt-1"
                data-testid="input-delete-confirm"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => { setDeletingCustomer(null); setDeleteConfirmText(''); }}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteConfirmText !== 'DELETE' || deleteCustomerMutation.isPending}
                onClick={() => { if (deletingCustomer) deleteCustomerMutation.mutate(deletingCustomer.id); }}
                data-testid="button-confirm-delete"
              >
                {deleteCustomerMutation.isPending ? 'Deactivating...' : 'Deactivate Customer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purge Confirmation Dialog (super admin only) */}
      <Dialog open={!!purgingCustomer} onOpenChange={(open) => { if (!open) { setPurgingCustomer(null); setPurgeConfirmText(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-red-700">
              <FlameKindling className="w-5 h-5" />
              <span>Permanently Purge Customer</span>
            </DialogTitle>
            <DialogDescription>
              This drops the tenant database schema and removes all records. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">PERMANENT ERASURE — cannot be recovered:</p>
              <p className="text-lg font-bold text-red-900 dark:text-red-100 mt-1">{purgingCustomer?.companyName}</p>
            </div>
            <div>
              <Label htmlFor="purge-confirm" className="text-sm font-medium">
                Type <span className="font-bold text-red-700">PURGE</span> to confirm
              </Label>
              <Input
                id="purge-confirm"
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                placeholder="Type PURGE to confirm"
                className="mt-1 border-red-300"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => { setPurgingCustomer(null); setPurgeConfirmText(''); }}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={purgeConfirmText !== 'PURGE' || purgeCustomerMutation.isPending}
                onClick={() => { if (purgingCustomer) purgeCustomerMutation.mutate(purgingCustomer.id); }}
              >
                {purgeCustomerMutation.isPending ? 'Purging...' : 'Purge Forever'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enterprise Settings Dialog */}
      <EnterpriseSettingsDialog
        customer={enterpriseCustomer}
        groups={enterpriseGroups}
        open={!!enterpriseCustomer}
        onOpenChange={(open) => { if (!open) setEnterpriseCustomer(null); }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/platform-admin/customers'] });
        }}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={(open) => { setShowSettings(open); if (!open) { setShowAddAdmin(false); setEditingAdmin(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Platform Settings</span>
            </DialogTitle>
            <DialogDescription>
              Manage branding and admin users
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="branding" className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="branding"><Palette className="w-4 h-4 mr-2" />Branding</TabsTrigger>
              <TabsTrigger value="admins"><Users className="w-4 h-4 mr-2" />Admin Users</TabsTrigger>
            </TabsList>

            <TabsContent value="branding" className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input id="primaryColor" type="color" value={brandingForm.primaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })} className="w-20 h-10" data-testid="input-primary-color" />
                    <Input type="text" value={brandingForm.primaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })} placeholder="" className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input id="secondaryColor" type="color" value={brandingForm.secondaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })} className="w-20 h-10" data-testid="input-secondary-color" />
                    <Input type="text" value={brandingForm.secondaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })} placeholder="" className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accentColor">Accent Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input id="accentColor" type="color" value={brandingForm.accentColor} onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })} className="w-20 h-10" data-testid="input-accent-color" />
                    <Input type="text" value={brandingForm.accentColor} onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })} placeholder="" className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="logoFile">Logo Upload</Label>
                  <Input id="logoFile" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} data-testid="input-logo-file" />
                  {(logoFile || brandingForm.logoUrl) && (
                    <div className="mt-2">
                      <p className="text-sm text-gray-600">{logoFile ? `Selected: ${logoFile.name}` : `Current: ${brandingForm.logoUrl}`}</p>
                      {brandingForm.logoUrl && !logoFile && (<img src={brandingForm.logoUrl} alt="Logo preview" className="mt-2 h-16 object-contain" />)}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input id="platformName" type="text" value={brandingForm.platformName} onChange={(e) => setBrandingForm({ ...brandingForm, platformName: e.target.value })} placeholder="" data-testid="input-platform-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" type="text" value={brandingForm.companyName} onChange={(e) => setBrandingForm({ ...brandingForm, companyName: e.target.value })} placeholder="" data-testid="input-company-name" />
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
                <Button onClick={() => updateBrandingMutation.mutate()} disabled={updateBrandingMutation.isPending} data-testid="button-save-branding">
                  {updateBrandingMutation.isPending ? "Saving..." : "Save Branding"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="admins" className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Manage platform administrator accounts</p>
                <Button size="sm" onClick={() => { setShowAddAdmin(true); setNewAdminForm({ username: '', email: '', password: '', firstName: '', lastName: '', role: 'admin' }); }}>
                  <UserPlus className="w-4 h-4 mr-2" />Add Admin
                </Button>
              </div>

              {showAddAdmin && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">New Admin User</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">First Name</Label>
                        <Input value={newAdminForm.firstName} onChange={(e) => setNewAdminForm({ ...newAdminForm, firstName: e.target.value })} placeholder="" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Last Name</Label>
                        <Input value={newAdminForm.lastName} onChange={(e) => setNewAdminForm({ ...newAdminForm, lastName: e.target.value })} placeholder="" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Username</Label>
                        <Input value={newAdminForm.username} onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} placeholder="" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input type="email" value={newAdminForm.email} onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })} placeholder="" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Password</Label>
                        <Input type="password" value={newAdminForm.password} onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })} placeholder="Min 8 characters" />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAddAdmin(false)}>Cancel</Button>
                      <Button size="sm" onClick={() => createAdminMutation.mutate()} disabled={createAdminMutation.isPending}>
                        {createAdminMutation.isPending ? "Creating..." : "Create Admin"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {adminsLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading admins...</p>
                </div>
              ) : adminsError ? (
                <div className="text-center py-4 text-red-600">
                  <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm">Failed to load admin users. Please try again.</p>
                </div>
              ) : (adminsData?.admins || []).length === 0 ? (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No admin users found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(adminsData?.admins || []).map((adm: any) => (
                    <div key={adm.id} className="border rounded-lg p-4">
                      {editingAdmin?.id === adm.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">First Name</Label>
                              <Input value={editAdminForm.firstName} onChange={(e) => setEditAdminForm({ ...editAdminForm, firstName: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Last Name</Label>
                              <Input value={editAdminForm.lastName} onChange={(e) => setEditAdminForm({ ...editAdminForm, lastName: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Email</Label>
                              <Input type="email" value={editAdminForm.email} onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">New Password (leave blank to keep)</Label>
                              <Input type="password" value={editAdminForm.password} onChange={(e) => setEditAdminForm({ ...editAdminForm, password: e.target.value })} placeholder="Leave blank to keep current" />
                            </div>
                          </div>
                          <div className="flex justify-end space-x-2">
                            <Button variant="outline" size="sm" onClick={() => setEditingAdmin(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => updateAdminMutation.mutate()} disabled={updateAdminMutation.isPending}>
                              {updateAdminMutation.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold">{adm.firstName} {adm.lastName}</span>
                              <Badge variant="outline" className="text-xs">{adm.role}</Badge>
                              {adm.id === admin?.id && <Badge className="bg-blue-100 text-blue-800 text-xs">You</Badge>}
                            </div>
                            <p className="text-sm text-gray-500">{adm.username} &bull; {adm.email}</p>
                            {adm.lastLoginAt && <p className="text-xs text-gray-400 mt-1">Last login: {new Date(adm.lastLoginAt).toLocaleString()}</p>}
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={() => {
                              setEditingAdmin(adm);
                              setEditAdminForm({ email: adm.email, firstName: adm.firstName, lastName: adm.lastName, password: '', role: adm.role });
                            }}>
                              <Edit className="w-3 h-3 mr-1" />Edit
                            </Button>
                            {adm.id !== admin?.id && (
                              <Button variant="destructive" size="sm" onClick={() => {
                                if (confirm(`Delete admin "${adm.username}"? This cannot be undone.`)) {
                                  deleteAdminMutation.mutate(adm.id);
                                }
                              }}>
                                <Trash2 className="w-3 h-3 mr-1" />Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={(open) => { if (!open) { setEditingCustomer(null); setLocalDisabledFeatures(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer account details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-companyName">Company Name</Label>
              <Input
                id="edit-companyName"
                value={editForm.companyName}
                onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                data-testid="input-edit-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-contactEmail">Contact Email</Label>
              <Input
                id="edit-contactEmail"
                type="email"
                value={editForm.contactEmail}
                onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                data-testid="input-edit-contact-email"
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-1">Reset Login Details</h3>
              <p className="text-xs text-gray-500 mb-4">Use this to change the customer's login username or password — e.g. when the person who set up the account has left. Leave blank to keep the current details.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-username">New Username</Label>
                  <Input
                    id="reset-username"
                    value={credentialReset.username}
                    onChange={(e) => setCredentialReset({ ...credentialReset, username: e.target.value })}
                    placeholder="Leave blank to keep current"
                    data-testid="input-reset-username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reset-password">New Password</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={credentialReset.password}
                    onChange={(e) => setCredentialReset({ ...credentialReset, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                    data-testid="input-reset-password"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="reset-email">New Email (for the 6-digit login code)</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={credentialReset.email}
                    onChange={(e) => setCredentialReset({ ...credentialReset, email: e.target.value })}
                    placeholder="Leave blank to keep current"
                    data-testid="input-reset-email"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-1">Module Features</h3>
              <p className="text-xs text-muted-foreground mb-4">ON (green) = available to the customer. OFF = hidden and inaccessible. The customer can further hide ON modules from their own Settings page.</p>
              {!customerFeatures ? (
                <p className="text-xs text-muted-foreground">Loading feature data…</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Core Modules</p>
                    <div className="space-y-1">
                      {CORE_MODULES.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between py-1">
                          <Label className="text-sm cursor-pointer select-none">{label}</Label>
                          <Switch
                            checked={!disabledFeatures.includes(key)}
                            disabled={updateFeaturesMutation.isPending}
                            onCheckedChange={(checked) => toggleFeature(key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add-on Modules</p>
                    <div className="space-y-1">
                      {ADDON_MODULES.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between py-1">
                          <Label className="text-sm cursor-pointer select-none">{label}</Label>
                          <Switch
                            checked={!disabledFeatures.includes(key)}
                            disabled={updateFeaturesMutation.isPending}
                            onCheckedChange={(checked) => toggleFeature(key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setEditingCustomer(null)}>
                Cancel
              </Button>
              <Button 
                onClick={() => editCustomerMutation.mutate()}
                disabled={editCustomerMutation.isPending}
                data-testid="button-save-customer"
              >
                {editCustomerMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Blog Create/Edit Dialog */}
      <Dialog open={showBlogForm} onOpenChange={(open) => { if (!open) { setShowBlogForm(false); setEditingPost(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPost ? 'Edit Blog Post' : 'New Blog Post'}</DialogTitle>
            <DialogDescription>
              {editingPost ? 'Update the blog post details.' : 'Create a new blog post for the public site.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="blog-title">Title</Label>
              <Input
                id="blog-title"
                value={blogForm.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setBlogForm((f) => ({ ...f, title, slug: editingPost ? f.slug : autoSlug(title) }));
                }}
                placeholder="e.g. 5 Ways to Improve Site Safety"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blog-slug">URL Slug</Label>
              <Input
                id="blog-slug"
                value={blogForm.slug}
                onChange={(e) => setBlogForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                placeholder="e.g. 5-ways-to-improve-site-safety"
              />
              <p className="text-xs text-gray-400">Will be accessible at /blog/{blogForm.slug || 'your-slug'}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blog-summary">Summary</Label>
              <Input
                id="blog-summary"
                value={blogForm.summary}
                onChange={(e) => setBlogForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="A short description (shown on the blog listing page)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blog-content">Content</Label>
              <textarea
                id="blog-content"
                value={blogForm.content}
                onChange={(e) => setBlogForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write your blog post content here. Use blank lines to separate paragraphs."
                rows={10}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="blog-author">Author</Label>
                <Input
                  id="blog-author"
                  value={blogForm.author}
                  onChange={(e) => setBlogForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="e.g. ACS Safety Team"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-status">Status</Label>
                <select
                  id="blog-status"
                  value={blogForm.status}
                  onChange={(e) => setBlogForm((f) => ({ ...f, status: e.target.value as 'draft' | 'published' }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cover Image (optional)</Label>
              {/* Drop zone — drag, paste, or click to upload */}
              <div
                role="button"
                tabIndex={0}
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  blogCoverDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setBlogCoverDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setBlogCoverDragOver(false); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setBlogCoverDragOver(false); handleBlogCoverDrop(e); }}
                onPaste={handleBlogCoverPaste}
                onClick={() => !blogCoverUploading && blogCoverInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') blogCoverInputRef.current?.click(); }}
              >
                {blogCoverUploading ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <span className="text-sm text-gray-500">Uploading…</span>
                  </div>
                ) : blogForm.coverImageUrl ? (
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <img
                      src={blogForm.coverImageUrl}
                      alt="Cover preview"
                      className="h-16 w-24 rounded object-cover border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="text-left">
                      <p className="text-sm text-gray-600 break-all line-clamp-2">{blogForm.coverImageUrl}</p>
                      <button
                        type="button"
                        className="mt-1 text-xs text-red-500 hover:underline"
                        onClick={() => setBlogForm((f) => ({ ...f, coverImageUrl: '' }))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">Drag an image here, paste from your clipboard, click to upload, or paste a link below</p>
                    <p className="text-xs text-gray-400 mt-1">JPEG, PNG, GIF or WebP · max 5 MB</p>
                  </div>
                )}
                <input
                  ref={blogCoverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadBlogCoverFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {/* URL fallback input */}
              <Input
                id="blog-cover"
                value={blogForm.coverImageUrl}
                onChange={(e) => setBlogForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                placeholder="…or paste a URL: https://example.com/image.jpg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blog-tags">Tags (comma-separated, optional)</Label>
              <Input
                id="blog-tags"
                value={blogForm.tags}
                onChange={(e) => setBlogForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. Safety, Compliance, Contractors"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => setShowBlogForm(false)}>Cancel</Button>
              <Button
                onClick={() => editingPost ? updateBlogPostMutation.mutate() : createBlogMutation.mutate()}
                disabled={createBlogMutation.isPending || updateBlogPostMutation.isPending || !blogForm.title || !blogForm.slug || !blogForm.summary || !blogForm.content || !blogForm.author}
              >
                {(createBlogMutation.isPending || updateBlogPostMutation.isPending) ? 'Saving...' : editingPost ? 'Update Post' : 'Create Post'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Blog Delete Confirmation Dialog */}
      <Dialog open={!!deletingPost} onOpenChange={(open) => { if (!open) setDeletingPost(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <span>Delete Blog Post</span>
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the post from the public blog. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Deleting:</p>
              <p className="text-base font-bold text-red-900 dark:text-red-100 mt-1">{deletingPost?.title}</p>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setDeletingPost(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteBlogMutation.isPending}
                onClick={() => deletingPost && deleteBlogMutation.mutate(deletingPost.id)}
              >
                {deleteBlogMutation.isPending ? 'Deleting...' : 'Delete Post'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manage Users Dialog ──────────────────────────────────────── */}
      <Dialog open={!!managingUsersCustomer} onOpenChange={(open) => { if (!open) { setManagingUsersCustomer(null); setShowAddUser(false); setEditingUser(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Manage Users — {managingUsersCustomer?.companyName}
            </DialogTitle>
            <DialogDescription>
              View and manage every login for this customer. The 6-digit login code is sent to each user's email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Add User button / inline form */}
            {!showAddUser && !editingUser && (
              <Button size="sm" onClick={() => { setShowAddUser(true); setUserForm({ ...emptyUserForm }); }}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            )}

            {/* Add user form */}
            {showAddUser && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold">New Login</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Username *</Label>
                    <Input value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. jsmith" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Password * (min 8 chars)</Label>
                    <Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Email — the 6-digit login code is sent here</Label>
                    <Input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input value={userForm.firstName} onChange={e => setUserForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={userForm.lastName} onChange={e => setUserForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={createUserMutation.isPending} onClick={() => createUserMutation.mutate(userForm)}>
                    {createUserMutation.isPending ? "Creating…" : "Create User"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowAddUser(false); setUserForm({ ...emptyUserForm }); }}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Edit user form */}
            {editingUser && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold">Edit: {editingUser.username}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Username</Label>
                    <Input value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Password (leave blank to keep current)</Label>
                    <Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Email — the 6-digit login code is sent here</Label>
                    <Input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input value={userForm.firstName} onChange={e => setUserForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={userForm.lastName} onChange={e => setUserForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={updateUserMutation.isPending} onClick={() => {
                    const patch: any = {};
                    if (userForm.username !== editingUser.username) patch.username = userForm.username;
                    if (userForm.email !== (editingUser.email ?? '')) patch.email = userForm.email;
                    if (userForm.password) patch.password = userForm.password;
                    if (userForm.role !== editingUser.role) patch.role = userForm.role;
                    if (userForm.firstName !== (editingUser.firstName ?? '')) patch.firstName = userForm.firstName;
                    if (userForm.lastName !== (editingUser.lastName ?? '')) patch.lastName = userForm.lastName;
                    updateUserMutation.mutate({ userId: editingUser.id, patch });
                  }}>
                    {updateUserMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingUser(null); setUserForm({ ...emptyUserForm }); }}>Cancel</Button>
                </div>
              </div>
            )}

            {/* User list */}
            {usersLoading ? (
              <p className="text-sm text-muted-foreground">Loading users…</p>
            ) : (
              <div className="space-y-2">
                {(usersData?.users ?? []).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{u.username}</span>
                        {(u.firstName || u.lastName) && (
                          <span className="text-xs text-muted-foreground">({[u.firstName, u.lastName].filter(Boolean).join(' ')})</span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{u.role}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {u.email ? <span>📧 {u.email}</span> : <span className="italic">No email set — 2FA codes won't be delivered</span>}
                        <span className="ml-3">Last login: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-GB') : 'Never'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={!!u.isActive}
                        disabled={updateUserMutation.isPending}
                        onCheckedChange={(checked) => updateUserMutation.mutate({ userId: u.id, patch: { isActive: checked } })}
                        title={u.isActive ? "Deactivate" : "Activate"}
                      />
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingUser(u);
                        setShowAddUser(false);
                        setUserForm({ username: u.username, email: u.email ?? '', password: '', role: u.role, firstName: u.firstName ?? '', lastName: u.lastName ?? '' });
                      }}>Edit</Button>
                      <Button size="sm" variant="destructive" disabled={deleteUserMutation.isPending} onClick={() => deleteUserMutation.mutate(u.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(usersData?.users ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No users found.</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
