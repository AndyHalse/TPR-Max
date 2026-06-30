import { useState, useMemo, useEffect, useRef } from "react";
import { printPassViaIframe } from "@/lib/printUtils";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ContractorWorker, CardOffence, CardIssue, WorkerCertification } from "@shared/schema";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format } from "date-fns";
import { 
  Building2, Users, FileText, Shield, AlertTriangle, CheckCircle2, 
  Calendar, MapPin, Phone, Mail, User, Award, Leaf, TrendingUp,
  XCircle, Clock, AlertCircle, CalendarPlus, Lock, CheckSquare,
  ChevronRight, Upload, Eye, QrCode, Printer, Download, Sparkles, RotateCcw, Trash2,
  Send, Loader2, Archive, ArchiveRestore
} from "lucide-react";
import { CO2SustainabilityReports } from "@/components/CO2SustainabilityReports";
import RAMSManagement from "@/components/RAMSManagement";
import { apiRequest, getCsrfToken, objectUrl } from "@/lib/queryClient";
import { WorkerCard } from "@/components/WorkerCard";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
import { ContractorEditModal } from "@/components/ContractorEditModal";
import ContractorWorkerDbsTab from "@/components/ContractorWorkerDbsTab";
import WorkerCertificatesTab from "@/components/WorkerCertificatesTab";
import ContractorEquipmentTab from "@/components/ContractorEquipmentTab";
// Removed ContractorHSModal - H&S acceptance now happens via e-pass link


export default function ContractorDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Read ?tab= and ?filter= from URL to support direct navigation (e.g. ?tab=documents&filter=missing)
  const initialTab = new URLSearchParams(window.location.search).get("tab") || "workers";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filterMissing, setFilterMissing] = useState(
    new URLSearchParams(window.location.search).get("filter") === "missing"
  );
  // Capture ?workerId= and optional ?workerTab= once on mount
  const [autoOpenWorkerId] = useState(() => new URLSearchParams(window.location.search).get("workerId"));
  const [autoOpenWorkerTab] = useState(() => new URLSearchParams(window.location.search).get("workerTab"));

  // Keep the URL in sync with tab + filter state so switching tabs preserves the filter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    if (filterMissing) {
      params.set("filter", "missing");
    } else {
      params.delete("filter");
    }
    params.delete("workerId");   // consumed on mount — strip from URL
    params.delete("workerTab");  // consumed on mount — strip from URL
    const newSearch = `?${params.toString()}`;
    if (window.location.search !== newSearch) {
      setLocation(`/contractors/${id}${newSearch}`);
    }
  }, [activeTab, filterMissing, id]);

  // Upload dialog state
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; docKey: string; docName: string; requiresExpiry: boolean; existingId?: string }>({
    open: false, docKey: "", docName: "", requiresExpiry: false
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadIssuer, setUploadIssuer] = useState("");
  const [uploadPolicy, setUploadPolicy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);

  // Document detail modal state
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState<{ doc: { key: string; name: string; basis: string; note: string; category: string; requiresExpiry: boolean }; uploaded: any } | null>(null);

  // Delete document confirmation state
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteDocumentConfirm, setShowDeleteDocumentConfirm] = useState(false);
  const deleteDocumentConfirmedRef = useRef(false);
  const deleteInitiatedFromDetailRef = useRef(false);
  const deleteConfirmCloseHandledRef = useRef(false);

  const handleDeleteConfirmClose = (confirmed: boolean) => {
    if (deleteConfirmCloseHandledRef.current) return;
    deleteConfirmCloseHandledRef.current = true;
    setShowDeleteDocumentConfirm(false);
    if (!confirmed && deleteInitiatedFromDetailRef.current) {
      setShowDocumentModal(true);
    }
    deleteDocumentConfirmedRef.current = false;
    deleteInitiatedFromDetailRef.current = false;
    setDocumentToDelete(null);
    setTimeout(() => { deleteConfirmCloseHandledRef.current = false; }, 0);
  };

  const [issuingCard, setIssuingCard] = useState(false);
  const [addingCertification, setAddingCertification] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [showArchivedWorkers, setShowArchivedWorkers] = useState(false);
  const [portalInviteOpen, setPortalInviteOpen] = useState(false);
  const [portalInviteEmail, setPortalInviteEmail] = useState("");
  const [workerWizardStep, setWorkerWizardStep] = useState(1);
  const [workerWizardSavedName, setWorkerWizardSavedName] = useState("");
  const [workerWizardLastValues, setWorkerWizardLastValues] = useState<any>(null);
  const [viewingWorker, setViewingWorker] = useState<ContractorWorker | null>(null);
  const [viewingWorkerDbsRequired, setViewingWorkerDbsRequired] = useState(false);
  const [qrPassWorker, setQrPassWorker] = useState<ContractorWorker | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; workerName: string } | null>(null);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerForPrint, setSelectedWorkerForPrint] = useState<ContractorWorker | null>(null);
  const [preBookingWorker, setPreBookingWorker] = useState<ContractorWorker | null>(null);
  const [preBookDate, setPreBookDate] = useState<Date>(new Date());
  const [preBookTime, setPreBookTime] = useState(() => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0);
    nextHour.setHours(nextHour.getHours() + 1);
    return `${String(nextHour.getHours()).padStart(2, '0')}:00`;
  });
  const [preBookPurpose, setPreBookPurpose] = useState("Site work");
  const [preBookDuration, setPreBookDuration] = useState("8");
  const [preBookNotes, setPreBookNotes] = useState("");

  // Fetch current user to get customerId (needed for list-level cache invalidation)
  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string; role: string }>({
    queryKey: ['/api/auth/me'],
  });
  const customerId = currentUser?.customerId;
  const currentUserRole = currentUser?.role || '';
  const canConfirmInduction = ['admin', 'manager'].includes(currentUserRole);

  // Fetch contractor details
  const { data: contractor, isLoading } = useQuery({
    queryKey: [`/api/contractors/${id}`],
    staleTime: 0, // Always fetch fresh data for dynamic ratings
    cacheTime: 0, // Don't cache since ratings are dynamic
  });

  // Auto-open a specific worker's dialog when ?workerId= is in the URL.
  // If ?workerTab= is also set, open the edit modal at that tab instead of the read-only dialog.
  useEffect(() => {
    if (!autoOpenWorkerId || !contractor) return;
    const workers: ContractorWorker[] = (contractor as any).workers || [];
    const target = workers.find((w) => w.id === autoOpenWorkerId);
    if (target) {
      if (autoOpenWorkerTab) {
        setSelectedWorkerForEdit(target);
      } else {
        setViewingWorker(target);
        setViewingWorkerDbsRequired(!!(target as any).dbsRequired);
      }
    }
  }, [autoOpenWorkerId, autoOpenWorkerTab, contractor]);

  // Fetch card offences for card issue form
  const { data: cardOffences = [] } = useQuery<CardOffence[]>({
    queryKey: ['/api/card-offences'],
  });

  // Staff query for host selection (same as visitor workflow)
  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ['/api/staff'],
  });

  // Company audit trail / notes
  const { data: companyNotes = [], isLoading: notesLoading } = useQuery<any[]>({
    queryKey: [`/api/contractors/${id}/notes`],
    enabled: !!id,
  });

  // RAMS docs for this contractor — used to synthesise activity events
  const { data: ramsDocsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/rams", id],
    queryFn: async () => {
      const res = await fetch(`/api/rams?companyId=${id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

  // Archived workers for this contractor company
  const { data: archivedWorkers = [], isLoading: archivedWorkersLoading } = useQuery<any[]>({
    queryKey: [`/api/contractors/${id}/archived-workers`],
    enabled: !!id && showArchivedWorkers,
  });

  // Portal users for this contractor company
  const { data: portalUsers = [], refetch: refetchPortalUsers } = useQuery<any[]>({
    queryKey: [`/api/contractors/${id}/portal-users`],
    enabled: !!id && !!companySettings?.featureContractorPortal,
  });

  // Send portal invite mutation
  const sendPortalInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", `/api/contractors/${id}/portal-invite`, { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", description: `Portal invite sent to ${portalInviteEmail}.` });
      setPortalInviteEmail("");
      setPortalInviteOpen(false);
      refetchPortalUsers();
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invite", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  // Resend login details to an already-active portal user
  const resendLoginMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/contractors/portal-users/${userId}/resend-login`, {});
      if (!res.ok) { const b = await res.json(); throw new Error(b?.error || "Failed"); }
      return res.json();
    },
    onSuccess: (_data, userId) => {
      const u = (portalUsers as any[]).find((p: any) => p.id === userId);
      toast({ title: "Login details sent", description: `Email with portal URL and username sent to ${u?.email ?? "the user"}.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to resend login details", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  // Form for issuing card violations
  const cardIssueForm = useForm({
    resolver: zodResolver(z.object({
      workerId: z.string().min(1, "Worker is required"),
      offenceId: z.string().min(1, "Offence is required"),
      cardType: z.enum(["red", "yellow"]),
      description: z.string().min(1, "Description is required"),
      witness: z.string().optional(),
      location: z.string().optional(),
    })),
    defaultValues: {
      workerId: "",
      offenceId: "",
      cardType: "yellow" as const,
      description: "",
      witness: "",
      location: "",
    }
  });

  // Form for adding certifications
  const certificationForm = useForm({
    resolver: zodResolver(z.object({
      workerId: z.string().min(1, "Worker is required"),
      certificationType: z.string().min(1, "Certification type is required"),
      certificationNumber: z.string().optional(),
      issuer: z.string().optional(),
      notes: z.string().optional(),
    })),
    defaultValues: {
      workerId: "",
      certificationType: "",
      certificationNumber: "",
      issuer: "",
      notes: "",
    }
  });

  // Form for adding workers
  const workerForm = useForm({
    resolver: zodResolver(z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().min(1, "Email is required").email("Valid email address required"),
      phone: z.string().min(1, "Phone number is required"),
      postcode: z.string().optional(),
      transportMethod: z.string().optional(),
      rightToWork: z.string().min(1, "Right to work status is required"),
      rightToWorkExpiryDate: z.string().optional(),
      cscsCard: z.string().optional(),
      cscsStatus: z.enum(["valid", "expired", "none", "pending"]),
      ipafStatus: z.enum(["valid", "expired", "none", "pending"]),
      asbestosAwareness: z.boolean(),
      manualHandling: z.boolean(),
      workingAtHeight: z.boolean(),
      inductionCompleted: z.boolean(),
      isActive: z.boolean(),
    }).superRefine((data, ctx) => {
      if (data.rightToWork === 'valid' && !data.rightToWorkExpiryDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rightToWorkExpiryDate'], message: 'Expiry date is required when Right to Work is valid' });
      }
    })),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      postcode: "",
      transportMethod: "",
      rightToWork: "pending",
      rightToWorkExpiryDate: "",
      cscsCard: "",
      cscsStatus: "none" as const,
      ipafStatus: "none" as const,
      asbestosAwareness: false,
      manualHandling: false,
      workingAtHeight: false,
      inductionCompleted: false,
      isActive: true,
    }
  });

  // Issue card mutation
  const issueCardMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/card-issues`, data),
    onSuccess: () => {
      toast({ title: "Card issued successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setIssuingCard(false);
      cardIssueForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to issue card", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Add certification mutation
  const addCertificationMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/workers/${data.workerId}/certifications`, data),
    onSuccess: () => {
      toast({ title: "Certification added successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setAddingCertification(false);
      certificationForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add certification", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Add worker mutation
  const addWorkerMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/contractors/${id}/workers`, data),
    onSuccess: (_data: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setWorkerWizardSavedName(`${variables.firstName} ${variables.lastName}`);
      setWorkerWizardLastValues(variables);
      setWorkerWizardStep(4);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add worker", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleIssueCard = (data: any) => {
    // Prepare the data with required fields for the API
    const cardData = {
      ...data,
      issuedBy: currentUser?.id,
      status: "active",
      photos: [],
      contractorId: id
    };
    console.info("🔴 Issuing card with data:", cardData);
    issueCardMutation.mutate(cardData);
  };

  const handleAddCertification = (data: any) => {
    // Prepare certification data
    const certData = {
      ...data,
      status: "valid",
      contractorId: id
    };
    console.info("🎓 Adding certification with data:", certData);
    addCertificationMutation.mutate(certData);
  };

  const handleAddWorker = (data: any) => {
    const workerData = {
      ...data,
      companyId: id,
      rightToWorkExpiryDate: data.rightToWorkExpiryDate ? new Date(data.rightToWorkExpiryDate).toISOString() : undefined,
    };
    console.info("👷 Adding worker with data:", workerData);
    addWorkerMutation.mutate(workerData);
  };

  // Check-in mutation - sends e-pass directly like visitor flow
  const checkInMutation = useMutation({
    mutationFn: async (data: { worker: any; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${data.worker.id}/checkin`, {
        purpose: 'Site work',
        hsRulesAccepted: false,
        hostStaffId: data.hostStaffId,
        hostName: data.hostName,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.hasEmail && data.ePassEnabled && data.ePassSent) {
        toast({ 
          title: "E-Pass sent successfully",
          description: "Check-in e-pass has been sent to the worker's email"
        });
      } else if (data.hasEmail && data.ePassEnabled && !data.ePassSent) {
        toast({ 
          title: "Check-in initiated",
          description: "Failed to send e-pass, but worker is registered",
          variant: "destructive"
        });
      } else {
        toast({ 
          title: "Check-in initiated",
          description: "Worker checked in (physical pass required)",
          variant: "secondary"
        });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to check in worker", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Check-out mutation
  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Worker checked out successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to check out worker", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Request Documents via secure email link
  const requestDocumentsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/contractors/${id}/request-documents`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Document request sent",
        description: `A secure upload link has been emailed to the contractor. It expires in 7 days.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send request", description: error.message, variant: "destructive" });
    },
  });

  // Worker documents query — fetches when a worker details modal is open
  const { data: viewingWorkerDocs = [], refetch: refetchViewingWorkerDocs } = useQuery<any[]>({
    queryKey: [`/api/contractors/workers/${viewingWorker?.id}/documents`],
    enabled: !!viewingWorker?.id,
  });

  // Approve worker document mutation (used inside Worker Details modal)
  const approveWorkerDocumentMutation = useMutation({
    mutationFn: async ({ workerId, documentId }: { workerId: string; documentId: string }) => {
      const response = await apiRequest('PATCH', `/api/contractors/workers/${workerId}/documents/${documentId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Document approved", description: "Approval recorded successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${viewingWorker?.id}/documents`] });
      refetchViewingWorkerDocs();
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve document", description: error.message, variant: "destructive" });
    }
  });

  // Approve company document mutation
  const approveDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest('PATCH', `/api/contractors/${id}/documents/${documentId}/approve`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Document approved", description: "Approval recorded with your name and timestamp." });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-dashboard"] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve document", description: error.message, variant: "destructive" });
    }
  });

  // Delete company document mutation — invalidates both the contractor detail cache and the
  // contractor list cache so compliance scores stay in sync across both views.
  const deleteCompanyDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return apiRequest('DELETE', `/api/contractors/${id}/documents/${documentId}`);
    },
    onSuccess: () => {
      toast({ title: "Document deleted", description: "The document has been removed." });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete document", description: error.message, variant: "destructive" });
    }
  });

  // Reset card to yellow mutation
  const resetCardMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/reset-card`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Card status reset successfully",
        description: "Worker card has been reset to yellow status" 
      });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to reset card status", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const preBookWorkerMutation = useMutation({
    mutationFn: async (data: { worker: ContractorWorker; date: Date; time: string; purpose: string; duration: string; notes: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest('POST', '/api/contractors/prebookings', {
        companyName: contractorData?.name || '',
        contactEmail: data.worker.email || '',
        contactPhone: data.worker.phone || '',
        workerName: `${data.worker.firstName} ${data.worker.lastName}`,
        workerEmail: data.worker.email || '',
        purpose: data.purpose,
        scheduledDate: data.date.toISOString(),
        scheduledTime: data.time,
        duration: data.duration,
        notes: data.notes,
        documentsRequired: [],
        hostStaffId: data.hostStaffId,
        hostName: data.hostName,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Worker pre-booked successfully", 
        description: data?.emailSent 
          ? "Pre-booking pass with QR code has been emailed to the contractor" 
          : "The booking has been created and will appear in the Reception Diary" 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reception/diary'] });
      setPreBookingWorker(null);
      setPreBookDate(new Date());
      const now2 = new Date();
      const nextHour2 = new Date(now2);
      nextHour2.setMinutes(0);
      nextHour2.setHours(nextHour2.getHours() + 1);
      setPreBookTime(`${String(nextHour2.getHours()).padStart(2, '0')}:00`);
      setPreBookPurpose("Site work");
      setPreBookDuration("8");
      setPreBookNotes("");
      setPreBookHost('');
    },
    onError: (error: any) => {
      toast({ title: "Failed to pre-book worker", description: error.message, variant: "destructive" });
    }
  });

  const handlePreBookWorker = () => {
    if (!preBookingWorker) return;
    const host = staffList.find((s: any) => s.id === preBookHost);
    preBookWorkerMutation.mutate({
      worker: preBookingWorker,
      date: preBookDate,
      time: preBookTime,
      purpose: preBookPurpose,
      duration: preBookDuration,
      notes: preBookNotes,
      hostStaffId: preBookHost || undefined,
      hostName: host ? `${host.firstName} ${host.lastName}` : undefined,
    });
  };

  const isWorkerClearForWork = (worker: ContractorWorker) => {
    const isBanned = worker.currentCardStatus === 'red' && worker.redCardBanUntil && new Date(worker.redCardBanUntil) > new Date();
    return !isBanned && worker.isActive && (!worker.currentCardStatus || worker.currentCardStatus === 'clear' || worker.currentCardStatus === 'yellow');
  };

  // Host selection state for contractor check-in
  const [showCheckInHostDialog, setShowCheckInHostDialog] = useState(false);
  const [checkInWorker, setCheckInWorker] = useState<any>(null);
  const [selectedCheckInHost, setSelectedCheckInHost] = useState('');

  // Host selection state for pre-booking
  const [preBookHost, setPreBookHost] = useState('');

  const handleWorkerCheckIn = (worker: ContractorWorker) => {
    setCheckInWorker(worker);
    setShowCheckInHostDialog(true);
  };

  const handleWorkerCheckOut = (workerId: string) => {
    checkOutMutation.mutate(workerId);
  };

  const handleWorkerEdit = (worker: ContractorWorker) => {
    setSelectedWorkerForEdit(worker);
  };

  const handleWorkerPrint = (worker: ContractorWorker) => {
    setSelectedWorkerForPrint(worker);
  };

  useEffect(() => {
    if ((qrPassWorker as any)?.qrCode) {
      setQrPassData({ qrCode: (qrPassWorker as any).qrCode, workerName: `${qrPassWorker!.firstName} ${qrPassWorker!.lastName}` });
    } else if (!qrPassWorker) {
      setQrPassData(null);
    }
  }, [qrPassWorker]);

  const sendWorkerQrPassMutation = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${id}/send-qr-pass`, { method });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.qrCode) setQrPassData({ qrCode: data.qrCode, workerName: data.workerName || '' });
      if (data.method === 'email') toast({ title: "QR Pass Sent", description: data.message || "QR pass emailed to contractor" });
    },
    onError: () => toast({ title: "Error", description: "Failed to send QR pass", variant: "destructive" }),
  });

  const getWorkerPassBranding = () => {
    const brandColor = companySettings?.backgroundColor || '#2460A9';
    const companyName = companySettings?.companyName || 'Company';
    const logoPath = companySettings?.logoUrl || '';
    const logoUrl = logoPath ? (logoPath.startsWith('http') ? logoPath : `${window.location.origin}/objects${logoPath.startsWith('/') ? '' : '/'}${logoPath}`) : '';
    return { brandColor, companyName, logoUrl };
  };

  const getBrandedWorkerPassHtml = async (qrCode: string, workerName: string, workerCompanyName: string) => {
    const QRCode = await import('qrcode');
    const qrUrl = await QRCode.toDataURL(qrCode, { width: 300, margin: 1 });
    const { brandColor, companyName, logoUrl } = getWorkerPassBranding();
    const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:40px;max-width:160px;margin:0 auto 6px;display:block;" crossorigin="anonymous">` : '';
    return `<div style="border:2px solid ${brandColor};border-radius:14px;padding:20px 18px;max-width:280px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;text-align:center;background:#fff;"><div style="background:${brandColor};margin:-20px -18px 12px -18px;border-radius:12px 12px 0 0;padding:14px 12px 10px 12px;">${logoHtml}<div style="color:#fff;font-size:15px;font-weight:700;">${companyName}</div><div style="color:rgba(255,255,255,0.8);font-size:10px;margin-top:2px;">CONTRACTOR CHECK-IN PASS</div></div><img src="${qrUrl}" style="width:180px;height:180px;margin:6px auto 10px;display:block;border-radius:8px;border:1px solid #e5e7eb;"><h3 style="margin:0 0 2px;font-size:16px;color:#111;">${workerName}</h3><p style="margin:2px 0;color:#555;font-size:13px;">${workerCompanyName}</p><div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:10px;color:#aaa;">Scan at kiosk to check in / check out</p></div></div>`;
  };

  const handlePrintWorkerQrPass = (workerId: string) => {
    printPassViaIframe(`/api/passes/print/contractor/${workerId}`);
  };

  const handleDownloadWorkerQrPass = async (qrCode: string, workerName: string, workerCompanyName: string) => {
    toast({ title: "Generating Pass", description: "Creating branded QR pass image..." });
    const QRCodeLib = await import('qrcode');
    const qrUrl = await QRCodeLib.toDataURL(qrCode, { width: 300, margin: 1 });
    const { brandColor, companyName } = getWorkerPassBranding();
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 420);
    ctx.strokeStyle = brandColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(2, 2, 316, 416, 12); ctx.stroke();
    ctx.fillStyle = brandColor; ctx.fillRect(2, 2, 316, 70);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.fillText(companyName, 160, 32);
    ctx.font = '11px Arial'; ctx.fillText('CONTRACTOR CHECK-IN PASS', 160, 52);
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 60, 80, 200, 200);
      ctx.fillStyle = '#111111'; ctx.font = 'bold 16px Arial'; ctx.fillText(workerName, 160, 305);
      ctx.fillStyle = '#555555'; ctx.font = '13px Arial'; ctx.fillText(workerCompanyName, 160, 325);
      ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial'; ctx.fillText('Scan at kiosk to check in / check out', 160, 365);
      const link = document.createElement('a');
      link.download = `qr-pass-${workerName.replace(/\s/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast({ title: "Download Complete", description: "QR pass saved to your downloads" });
    };
    img.onerror = () => toast({ title: "Download Failed", description: "Could not generate pass image", variant: "destructive" });
    img.src = qrUrl;
    img.crossOrigin = undefined;
  };


  const getCertificationStatusBadge = (status: string, expiryDate?: string | null) => {
    if (status === "expired") return <Badge variant="destructive">Expired</Badge>;
    if (status === "expiring" || (expiryDate && new Date(expiryDate) < new Date())) {
      return <Badge className="bg-orange-500 hover:bg-orange-600">Expiring</Badge>;
    }
    if (status === "suspended") return <Badge variant="secondary">Suspended</Badge>;
    return <Badge className="bg-green-500 hover:bg-green-600">Valid</Badge>;
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="p-8">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">Contractor Not Found</h2>
          <p className="text-muted-foreground">The contractor you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation('/contractors')} data-testid="button-back-contractors">
            Back to Contractors
          </Button>
        </div>
      </div>
    );
  }

  // AI document scan handler
  const scanDocument = async () => {
    if (!uploadFile) return;
    setIsScanningDoc(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      const resp = await apiRequest("POST", "/api/contractors/documents/scan", {
        fileData: base64,
        mimeType: uploadFile.type,
        documentType: uploadDialog.docKey,
      });

      const data = await resp.json();
      const { fields } = data as { fields: { expiryDate: string | null; issuedBy: string | null; policyNumber: string | null } };
      if (fields.expiryDate && !uploadExpiry) setUploadExpiry(fields.expiryDate);
      if (fields.issuedBy && !uploadIssuer) setUploadIssuer(fields.issuedBy);
      if (fields.policyNumber && !uploadPolicy) setUploadPolicy(fields.policyNumber);
      setAiExtracted(true);
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message || "Could not extract data from the document", variant: "destructive" });
    } finally {
      setIsScanningDoc(false);
    }
  };

  // Document upload handler
  const handleDocumentUpload = async () => {
    if (!uploadFile) {
      toast({ title: "No file selected", description: "Please choose a file to upload", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Step 1: Upload file through our server (avoids GCS CORS on signed PUTs)
      const formData = new FormData();
      formData.append("file", uploadFile);
      const token = sessionStorage.getItem("session_token");
      const csrfToken = getCsrfToken();
      const uploadRes = await fetch(`/api/contractors/${id}/documents/upload`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: formData,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        throw new Error((errBody as any).error || "File upload failed");
      }
      const { fileUrl } = await uploadRes.json();
      const documentUrl = fileUrl;

      // Step 2: Determine if this is an update or create
      const docs = (contractor as any).documents || [];
      const existing = docs.find((d: any) => d.documentType === uploadDialog.docKey);

      if (existing) {
        await apiRequest("PATCH", `/api/contractors/${id}/documents/${existing.id}`, {
          documentUrl,
          expiryDate: uploadExpiry || null,
          issuedBy: uploadIssuer || null,
          policyNumber: uploadPolicy || null,
        });
      } else {
        await apiRequest("POST", `/api/contractors/${id}/documents`, {
          documentType: uploadDialog.docKey,
          documentName: uploadDialog.docName,
          documentUrl,
          expiryDate: uploadExpiry || null,
          issuedBy: uploadIssuer || null,
          policyNumber: uploadPolicy || null,
        });
      }

      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-dashboard"] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      }
      setUploadDialog({ open: false, docKey: "", docName: "", requiresExpiry: false });
      setUploadFile(null);
      setUploadExpiry("");
      setUploadIssuer("");
      setUploadPolicy("");
      setAiExtracted(false);
      toast({ title: "Document uploaded", description: `${uploadDialog.docName} has been saved successfully.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Type safety for contractor data
  const contractorData = contractor as any;

  return (
    <div className="p-6 space-y-6" data-testid="contractor-details-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/contractors')}
            className="mb-2"
            data-testid="button-back-contractors"
          >
            ← Back to Contractors
          </Button>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-contractor-name">
            {contractorData.name}
          </h1>
          <p className="text-muted-foreground" data-testid="text-contractor-description">
            {contractorData.description || "No description available"}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={issuingCard} onOpenChange={setIssuingCard}>
            <DialogTrigger asChild>
              <Button variant="destructive" data-testid="button-issue-card">
                <Shield className="w-4 h-4 mr-2" />
                Issue Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Issue Red or Yellow Card</DialogTitle>
                <DialogDescription>
                  Issue a safety violation card to a contractor worker for non-compliance or safety infractions.
                </DialogDescription>
              </DialogHeader>
              <Form {...cardIssueForm}>
                <form onSubmit={cardIssueForm.handleSubmit(handleIssueCard)} className="space-y-4">
                  <FormField
                    control={cardIssueForm.control}
                    name="workerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Worker</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-worker">
                              <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contractorData.workers?.map((worker: ContractorWorker) => (
                              <SelectItem key={worker.id} value={worker.id}>
                                {worker.firstName} {worker.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={cardIssueForm.control}
                    name="cardType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-card-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="yellow">Yellow Card</SelectItem>
                            <SelectItem value="red">Red Card</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={cardIssueForm.control}
                    name="offenceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Offence</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-offence">
                              <SelectValue placeholder="Select offence" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cardOffences
                              .filter(offence => offence.cardType === cardIssueForm.watch('cardType'))
                              .map((offence) => (
                                <SelectItem key={offence.id} value={offence.id}>
                                  {offence.offenceName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={cardIssueForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe the incident..."
                            {...field}
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIssuingCard(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={issueCardMutation.isPending}
                      data-testid="button-issue-card-submit"
                    >
                      {issueCardMutation.isPending ? "Issuing..." : "Issue Card"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          
          <Button 
            onClick={() => setAddingWorker(true)}
            data-testid="button-add-worker"
          >
            <User className="w-4 h-4 mr-2" />
            Add Worker
          </Button>
          
          <Dialog open={addingCertification} onOpenChange={setAddingCertification}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-certification">
                <Award className="w-4 h-4 mr-2" />
                Add Certification
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Worker Certification</DialogTitle>
                <DialogDescription>
                  Add a professional certification or training qualification for a contractor worker.
                </DialogDescription>
              </DialogHeader>
              <Form {...certificationForm}>
                <form onSubmit={certificationForm.handleSubmit(handleAddCertification)} className="space-y-4">
                  <FormField
                    control={certificationForm.control}
                    name="workerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Worker</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-certification-worker">
                              <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contractorData.workers?.map((worker: ContractorWorker) => (
                              <SelectItem key={worker.id} value={worker.id}>
                                {worker.firstName} {worker.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={certificationForm.control}
                    name="certificationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certification Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-certification-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CIBT">CIBT</SelectItem>
                            <SelectItem value="CPCS">CPCS</SelectItem>
                            <SelectItem value="NVQ">NVQ</SelectItem>
                            <SelectItem value="CSCS">CSCS</SelectItem>
                            <SelectItem value="IPAF">IPAF</SelectItem>
                            <SelectItem value="PASMA">PASMA</SelectItem>
                            <SelectItem value="Other1">Other 1</SelectItem>
                            <SelectItem value="Other2">Other 2</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={certificationForm.control}
                    name="certificationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certification Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter certification number"
                            {...field}
                            data-testid="input-certification-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={certificationForm.control}
                    name="issuer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Issuer</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Certification issuer"
                            {...field}
                            data-testid="input-issuer"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddingCertification(false)}
                      data-testid="button-cancel-certification"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={addCertificationMutation.isPending}
                      data-testid="button-add-certification-submit"
                    >
                      {addCertificationMutation.isPending ? "Adding..." : "Add Certification"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Company Overview Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="glass" data-testid="card-workers-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-workers-count">
              {contractorData.workers?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card variant="glass" data-testid="card-documents-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-documents-count">
              {contractorData.documents?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card variant="glass" data-testid="card-compliance-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-compliance-status">
              Active
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4" data-testid="contractor-tabs">
        <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
          <TabsTrigger value="workers" data-testid="tab-workers">Workers</TabsTrigger>
          <TabsTrigger value="equipment" data-testid="tab-equipment">Equipment</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="safety" data-testid="tab-safety">Safety</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          <TabsTrigger value="reporting" data-testid="tab-reporting">Reporting</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
          {companySettings?.featureContractorPortal && (
            <TabsTrigger value="portal" data-testid="tab-portal">Portal</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="workers" className="space-y-4" data-testid="workers-tab-content">
          {/* Active workers grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {contractorData.workers?.length > 0 ? (
              contractorData.workers.map((worker: ContractorWorker) => (
                <WorkerCard
                  key={worker.id}
                  worker={worker}
                  onCheckIn={handleWorkerCheckIn}
                  onCheckOut={handleWorkerCheckOut}
                  onEdit={handleWorkerEdit}
                  onPrint={handleWorkerPrint}
                  onQrPass={(worker) => setQrPassWorker(worker)}
                  onPreBook={(worker) => setPreBookingWorker(worker)}
                  onIssueCard={(workerId) => {
                    cardIssueForm.setValue('workerId', workerId);
                    setIssuingCard(true);
                  }}
                  onResetCard={(workerId) => {
                    resetCardMutation.mutate(workerId);
                  }}
                  onViewDetails={(worker) => {
                    setViewingWorker(worker);
                    setViewingWorkerDbsRequired(!!(worker as any).dbsRequired);
                  }}
                  canManageCards={true}
                />
              ))
            ) : (
              <Card variant="glass" className="p-8 text-center col-span-full" data-testid="no-workers-message">
                <CardContent>
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Workers Found</h3>
                  <p className="text-muted-foreground">This contractor has no workers registered yet.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Archived workers toggle */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchivedWorkers((v) => !v)}
              className={showArchivedWorkers ? 'border-amber-400 text-amber-700 bg-amber-50' : 'text-muted-foreground'}
              data-testid="button-toggle-archived-workers"
            >
              {showArchivedWorkers ? (
                <><ArchiveRestore className="w-4 h-4 mr-2" />Hide Archived Workers</>
              ) : (
                <><Archive className="w-4 h-4 mr-2" />Show Archived Workers</>
              )}
            </Button>
            {showArchivedWorkers && (
              <span className="text-xs text-muted-foreground">
                {archivedWorkersLoading ? 'Loading...' : `${archivedWorkers.length} archived worker${archivedWorkers.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>

          {/* Archived workers grid */}
          {showArchivedWorkers && (
            <div>
              <h4 className="text-sm font-medium text-amber-700 mb-3 flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Archived Workers
              </h4>
              {archivedWorkersLoading ? (
                <p className="text-sm text-muted-foreground">Loading archived workers...</p>
              ) : archivedWorkers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No archived workers for this contractor.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {archivedWorkers.map((archivedWorker: any) => (
                    <Card
                      key={archivedWorker.id}
                      variant="glass"
                      className="p-4 opacity-70 border-amber-200 bg-amber-50/30 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedWorkerForEdit(archivedWorker as ContractorWorker)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{archivedWorker.firstName} {archivedWorker.lastName}</p>
                          <p className="text-xs text-muted-foreground">{archivedWorker.trade || archivedWorker.jobTitle || 'Worker'}</p>
                        </div>
                        <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">
                          <Archive className="w-3 h-3 mr-1" />
                          Archived
                        </Badge>
                      </div>
                      {archivedWorker.archiveReason && (
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={archivedWorker.archiveReason}>
                          Reason: {archivedWorker.archiveReason}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">Click to view / reactivate</p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4" data-testid="documents-tab-content">
          {/* UK Document Checklist */}
          {(() => {
            const docs = contractorData.documents || [];

            const UK_DOC_FRAMEWORK = [
              // Legally Required
              { key: 'publicLiability', name: 'Public Liability Insurance', basis: 'Common law duty of care', note: 'Minimum £2m', category: 'legal', requiresExpiry: true },
              { key: 'employersLiability', name: "Employers' Liability Insurance", basis: "Employers' Liability Act 1969", note: 'Minimum £5m', category: 'legal', requiresExpiry: true },
              { key: 'cisRegistration', name: 'CIS Registration', basis: 'Finance Act 2004', note: 'Construction industry only', category: 'legal', requiresExpiry: false },
              // Site Required
              { key: 'healthSafety', name: 'Health & Safety Policy', basis: 'H&S at Work Act 1974', note: 'Required before work commences', category: 'site', requiresExpiry: true },
              { key: 'rams', name: 'Risk Assessment & Method Statement (RAMS)', basis: 'MHSWR 1999', note: 'Site-specific, required before each job', category: 'site', requiresExpiry: true },
              // Good Practice
              { key: 'modernSlavery', name: 'Modern Slavery Statement', basis: 'Modern Slavery Act 2015', note: 'Mandatory for businesses >£36m turnover', category: 'good', requiresExpiry: false },
              { key: 'environmentalPolicy', name: 'Environmental Policy', basis: 'Client / ISO 14001', note: 'Increasingly required by clients', category: 'good', requiresExpiry: false },
              { key: 'professionalIndemnity', name: 'Professional Indemnity Insurance', basis: 'Client / design work', note: 'Required for design/consultancy roles', category: 'good', requiresExpiry: true },
            ];

            const getDocStatus = (key: string) => {
              const uploaded = docs.find((d: any) => d.documentType === key);
              if (!uploaded) return 'missing';
              if (uploaded.expiryDate) {
                const expiry = new Date(uploaded.expiryDate);
                const now = new Date();
                const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (expiry < now) return 'expired';
                if (daysToExpiry <= 30) return 'expiring';
              }
              return uploaded.status || 'pending';
            };

            const getStatusBadge = (status: string) => {
              switch (status) {
                case 'approved': return <Badge className="bg-green-100 text-green-700">✅ Valid</Badge>;
                case 'expiring': return <Badge className="bg-amber-100 text-amber-700">⚠️ Expiring soon</Badge>;
                case 'expired': return <Badge className="bg-red-100 text-red-700">❌ Expired</Badge>;
                case 'pending': return <Badge className="bg-blue-100 text-blue-700">🔄 Pending review</Badge>;
                case 'missing': return <Badge variant="outline" className="text-gray-400 border-gray-300">— Missing</Badge>;
                default: return <Badge className="bg-blue-100 text-blue-700">{status}</Badge>;
              }
            };

            const legalDocs = UK_DOC_FRAMEWORK.filter(d => d.category === 'legal');
            const siteDocs = UK_DOC_FRAMEWORK.filter(d => d.category === 'site');
            const goodDocs = UK_DOC_FRAMEWORK.filter(d => d.category === 'good');

            const requiredDocs = [...legalDocs, ...siteDocs];
            // Count any uploaded doc (approved, expiring, or pending review) as satisfying the requirement
            // Only 'missing' and 'expired' are non-compliant
            const compliantCount = requiredDocs.filter(d => ['approved', 'expiring', 'pending'].includes(getDocStatus(d.key))).length;
            const missingCount = requiredDocs.filter(d => getDocStatus(d.key) === 'missing').length;
            const expiredCount = requiredDocs.filter(d => getDocStatus(d.key) === 'expired').length;
            const pct = Math.round((compliantCount / requiredDocs.length) * 100);
            const totalGapCount = [...legalDocs, ...siteDocs, ...goodDocs].filter(d => ['missing', 'expired'].includes(getDocStatus(d.key))).length;

            const DocSection = ({ title, icon, badge, items }: { title: string; icon: any; badge: any; items: typeof UK_DOC_FRAMEWORK }) => {
              const visibleItems = filterMissing
                ? items.filter(d => ['missing', 'expired'].includes(getDocStatus(d.key)))
                : items;
              if (visibleItems.length === 0) return null;
              const displayBadge = filterMissing
                ? <Badge className="bg-orange-100 text-orange-700 text-xs">{visibleItems.length} {visibleItems.length === 1 ? 'gap' : 'gaps'}</Badge>
                : badge;
              return (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    {icon}
                    <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                    {displayBadge}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleItems.map(doc => {
                    const status = getDocStatus(doc.key);
                    const uploaded = docs.find((d: any) => d.documentType === doc.key);
                    return (
                      <div key={doc.key} className={`border rounded-lg p-3 ${status === 'missing' ? 'border-gray-200' : status === 'expired' ? 'border-red-200 bg-red-50' : status === 'expiring' ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm text-gray-900">{doc.name}</p>
                              {getStatusBadge(status)}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{doc.basis} — {doc.note}</p>
                            {uploaded?.expiryDate && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-gray-600">
                                <Clock className="w-3 h-3" />
                                Expires: {new Date(uploaded.expiryDate).toLocaleDateString('en-GB')}
                                {status === 'expiring' && <span className="text-amber-700 font-medium ml-1">⚠️ Renew soon</span>}
                              </div>
                            )}
                            {uploaded?.approvedBy && uploaded?.approvedAt && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-green-700">
                                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                Approved by <strong className="ml-0.5">{uploaded.approvedBy}</strong>
                                <span className="text-green-600 ml-0.5">· {new Date(uploaded.approvedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {uploaded && (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-50 px-2 py-1 border border-gray-200 rounded font-medium"
                                onClick={() => {
                                  setSelectedDocumentDetail({ doc, uploaded });
                                  setShowDocumentModal(true);
                                }}
                                title="View document details"
                              >
                                <Eye className="w-3 h-3" /> Details
                              </button>
                            )}
                            {uploaded && uploaded.status === 'pending' && (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-green-700 hover:bg-green-50 px-2 py-1 border border-green-300 rounded font-medium disabled:opacity-50"
                                onClick={() => approveDocumentMutation.mutate(uploaded.id)}
                                disabled={approveDocumentMutation.isPending}
                                title="Approve this document"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                            )}
                            <button
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 border border-blue-200 rounded font-medium"
                              onClick={() => {
                                setUploadFile(null);
                                setUploadExpiry(uploaded?.expiryDate ? new Date(uploaded.expiryDate).toISOString().split('T')[0] : "");
                                setUploadIssuer(uploaded?.issuedBy || "");
                                setUploadPolicy(uploaded?.policyNumber || "");
                                setUploadDialog({ open: true, docKey: doc.key, docName: doc.name, requiresExpiry: doc.requiresExpiry, existingId: uploaded?.id });
                              }}
                            >
                              <Upload className="w-3 h-3" /> {uploaded ? 'Replace' : 'Upload'}
                            </button>
                            {uploaded && (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 px-2 py-1 border border-red-200 rounded font-medium disabled:opacity-50"
                                onClick={() => {
                                  deleteInitiatedFromDetailRef.current = false;
                                  setDocumentToDelete({ id: uploaded.id, name: doc.name });
                                  setShowDeleteDocumentConfirm(true);
                                }}
                                disabled={deleteCompanyDocumentMutation.isPending}
                                title="Delete this document"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              );
            };

            return (
              <div className="space-y-4">
                {/* Compliance score bar */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">Required Documents Complete</p>
                      <span className="text-sm font-bold text-blue-700">{compliantCount} of {requiredDocs.length} — {pct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {pct < 100 && missingCount > 0 && (
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-gray-500">
                          {missingCount} document{missingCount > 1 ? 's' : ''} still need{missingCount === 1 ? 's' : ''} uploading to reach 100% compliance.
                        </p>
                        <button
                          className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 whitespace-nowrap ml-3 shrink-0"
                          onClick={() => setFilterMissing(true)}
                        >
                          View gaps →
                        </button>
                      </div>
                    )}
                    {pct < 100 && missingCount === 0 && expiredCount > 0 && (
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-amber-600">
                          {expiredCount} document{expiredCount > 1 ? 's' : ''} {expiredCount === 1 ? 'has' : 'have'} expired — please renew to maintain compliance.
                        </p>
                        <button
                          className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 whitespace-nowrap ml-3 shrink-0"
                          onClick={() => setFilterMissing(true)}
                        >
                          View gaps →
                        </button>
                      </div>
                    )}
                    {pct === 100 && (
                      <p className="text-xs text-green-600 mt-1.5">All required documents uploaded. Documents marked pending are awaiting admin review.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Request Documents action */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Request documents by email</p>
                    <p className="text-xs text-blue-600 mt-0.5">Send the contractor a secure link to upload their compliance documents directly.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 whitespace-nowrap shrink-0 gap-1.5"
                    onClick={() => requestDocumentsMutation.mutate()}
                    disabled={requestDocumentsMutation.isPending}
                  >
                    {requestDocumentsMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" />Request Documents</>
                    )}
                  </Button>
                </div>

                {filterMissing && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-amber-800 font-medium">
                      <span>⚠️ Showing {totalGapCount} {totalGapCount === 1 ? 'gap' : 'gaps'} — missing and expired documents</span>
                    </div>
                    <button
                      className="text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
                      onClick={() => setFilterMissing(false)}
                    >
                      Show all
                    </button>
                  </div>
                )}

                <DocSection
                  title="Legally Required"
                  icon={<div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center"><Lock className="w-3.5 h-3.5 text-red-600" /></div>}
                  badge={<Badge className="bg-red-100 text-red-700 text-xs">UK Law</Badge>}
                  items={legalDocs}
                />

                <DocSection
                  title="Site Required"
                  icon={<div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-amber-600" /></div>}
                  badge={<Badge className="bg-amber-100 text-amber-700 text-xs">Most sites</Badge>}
                  items={siteDocs}
                />

                <DocSection
                  title="Good Practice"
                  icon={<div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center"><CheckSquare className="w-3.5 h-3.5 text-green-600" /></div>}
                  badge={<Badge className="bg-green-100 text-green-700 text-xs">Recommended</Badge>}
                  items={goodDocs}
                />
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="safety" className="space-y-4" data-testid="safety-tab-content">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Red & Yellow Card System
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-600">Red Card Offences</h4>
                      <div className="text-sm text-muted-foreground">
                        Immediate 3-year site ban for serious safety violations
                      </div>
                      <Badge variant="outline" className="text-red-600">0 Active Issues</Badge>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-yellow-600">Yellow Card Warnings</h4>
                      <div className="text-sm text-muted-foreground">
                        3 yellow cards result in automatic red card
                      </div>
                      <Badge variant="outline" className="text-yellow-600">1 Active Warning</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4" data-testid="compliance-tab-content">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Enhanced Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">CIBT Certifications</h4>
                      <Badge variant="outline" className="text-green-600">2 Valid</Badge>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">CPCS Licenses</h4>
                      <Badge variant="outline" className="text-green-600">3 Valid</Badge>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">NVQ Qualifications</h4>
                      <Badge variant="outline" className="text-orange-600">1 Expiring</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="w-5 h-5 text-blue-600" />
                  RAMS Documents
                </CardTitle>
                <CardDescription>Risk Assessments & Method Statements — live documents, approvals and acknowledgements for this contractor</CardDescription>
              </CardHeader>
              <CardContent>
                <RAMSManagement companyId={id} embedded />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reporting" className="space-y-4" data-testid="reporting-tab-content">
          <CO2SustainabilityReports 
            companyId={contractor?.id} 
            companyName={contractor?.name} 
          />
        </TabsContent>

        <TabsContent value="activity" className="space-y-4" data-testid="activity-tab-content">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-4 h-4" />
                Company Activity Log
              </CardTitle>
              <CardDescription>Full audit trail of all actions taken on this contractor company record</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Synthesise RAMS activity events from RAMS documents
                const ramsEvents: any[] = [];
                for (const doc of ramsDocsRaw) {
                  if (doc.uploadedAt) ramsEvents.push({ id: `rams-upload-${doc.id}`, changeType: 'rams_uploaded', changedAt: doc.uploadedAt, notes: `RAMS document uploaded: "${doc.documentName}" (Ref: ${doc.ramsIdRef})` });
                  if (doc.approvedAt) ramsEvents.push({ id: `rams-approved-${doc.id}`, changeType: 'rams_approved', changedAt: doc.approvedAt, notes: `RAMS approved: "${doc.documentName}" — approved by ${doc.approvedBy || doc.reviewedBy || 'system'}${doc.reviewNotes ? ` · Notes: ${doc.reviewNotes}` : ''}` });
                  if (doc.reviewedAt && doc.status === 'rejected') ramsEvents.push({ id: `rams-rejected-${doc.id}`, changeType: 'rams_rejected', changedAt: doc.reviewedAt, notes: `RAMS rejected: "${doc.documentName}"${doc.rejectionReason ? ` — Reason: ${doc.rejectionReason}` : ''}` });
                  if (doc.previousVersionId && doc.uploadedAt) ramsEvents.push({ id: `rams-version-${doc.id}`, changeType: 'rams_new_version', changedAt: doc.uploadedAt, notes: `New version uploaded for RAMS: "${doc.documentName}" (v${doc.version})` });
                }
                // Merge company notes + RAMS events, sorted newest-first
                const allEvents = [...companyNotes, ...ramsEvents].sort((a, b) => {
                  const ta = new Date(a.changedAt || 0).getTime();
                  const tb = new Date(b.changedAt || 0).getTime();
                  return tb - ta;
                });

                const changeTypeColors: Record<string, string> = {
                  company_created: 'bg-green-100 text-green-800 border-green-200',
                  company_updated: 'bg-blue-100 text-blue-800 border-blue-200',
                  worker_added: 'bg-purple-100 text-purple-800 border-purple-200',
                  document_uploaded: 'bg-amber-100 text-amber-800 border-amber-200',
                  document_replaced: 'bg-orange-100 text-orange-800 border-orange-200',
                  document_updated: 'bg-sky-100 text-sky-800 border-sky-200',
                  rams_uploaded: 'bg-blue-100 text-blue-800 border-blue-200',
                  rams_approved: 'bg-green-100 text-green-800 border-green-200',
                  rams_rejected: 'bg-red-100 text-red-800 border-red-200',
                  rams_new_version: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                };
                const changeTypeLabels: Record<string, string> = {
                  company_created: 'Company Created',
                  company_updated: 'Details Updated',
                  worker_added: 'Worker Added',
                  document_uploaded: 'Document Uploaded',
                  document_replaced: 'Document Replaced',
                  document_updated: 'Document Updated',
                  rams_uploaded: 'RAMS Uploaded',
                  rams_approved: 'RAMS Approved',
                  rams_rejected: 'RAMS Rejected',
                  rams_new_version: 'RAMS New Version',
                };
                const changeTypeIcons: Record<string, JSX.Element> = {
                  rams_uploaded: <Shield className="w-4 h-4 text-blue-500" />,
                  rams_approved: <CheckCircle2 className="w-4 h-4 text-green-500" />,
                  rams_rejected: <XCircle className="w-4 h-4 text-red-500" />,
                  rams_new_version: <Shield className="w-4 h-4 text-indigo-500" />,
                };

                if (notesLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading activity...</div>;
                if (allEvents.length === 0) return (
                  <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No activity recorded yet.</p>
                    <p className="text-xs mt-1">Actions like adding workers, uploading documents and RAMS will appear here.</p>
                  </div>
                );
                return (
                  <div className="space-y-0">
                    {allEvents.map((event: any, index: number) => {
                      const colorClass = changeTypeColors[event.changeType] || 'bg-gray-100 text-gray-800 border-gray-200';
                      const label = changeTypeLabels[event.changeType] || event.changeType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                      const icon = changeTypeIcons[event.changeType] || <FileText className="w-4 h-4 text-muted-foreground" />;
                      const isLast = index === allEvents.length - 1;
                      return (
                        <div key={event.id} className="flex gap-3 py-3 relative">
                          {!isLast && <div className="absolute left-[17px] top-9 bottom-0 w-0.5 bg-border" />}
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-muted border flex items-center justify-center mt-0.5">
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${colorClass}`}>
                                {label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {event.changedAt ? new Date(event.changedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' }) : ''}
                              </span>
                            </div>
                            <p className="text-sm text-foreground">{event.notes}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Equipment Register tab */}
        <TabsContent value="equipment" className="space-y-4" data-testid="equipment-tab-content">
          <Card>
            <CardContent className="p-6">
              {contractorData && (
                <ContractorEquipmentTab companyId={contractorData.id} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contractor Self-Service Portal tab */}
        {companySettings?.featureContractorPortal && (
          <TabsContent value="portal" className="space-y-4" data-testid="portal-tab-content">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="w-5 h-5 text-blue-600" />
                      Contractor Self-Service Portal
                    </CardTitle>
                    <CardDescription>
                      Invite contacts from this company to the self-service portal where they can upload compliance documents.
                    </CardDescription>
                  </div>
                  <Button onClick={() => setPortalInviteOpen(true)} className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Send Invite
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {portalUsers.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Send className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No portal users yet</p>
                    <p className="text-sm mt-1">Send an invite to give this contractor company access to the portal.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {portalUsers.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 gap-3">
                        <div className="min-w-0">
                          {(u.firstName || u.lastName) && (
                            <p className="font-medium text-sm">{`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()}</p>
                          )}
                          <p className={u.firstName || u.lastName ? "text-xs text-muted-foreground" : "font-medium text-sm"}>{u.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Invited {u.invitedAt ? new Date(u.invitedAt).toLocaleDateString() : "—"}
                          </p>
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={u.isActive ? "default" : "secondary"}>
                            {u.isActive ? "Active" : "Invite pending"}
                          </Badge>
                          {u.isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => resendLoginMutation.mutate(u.id)}
                              disabled={resendLoginMutation.isPending}
                            >
                              {resendLoginMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                              Resend Link
                            </Button>
                          )}
                          {!u.isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => sendPortalInviteMutation.mutate(u.email)}
                              disabled={sendPortalInviteMutation.isPending}
                            >
                              {sendPortalInviteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                              Resend Invite
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Send invite dialog */}
            <Dialog open={portalInviteOpen} onOpenChange={setPortalInviteOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Send Portal Invite</DialogTitle>
                  <DialogDescription>
                    The recipient will receive an email with a link to set their password and access the portal.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <Label htmlFor="portal-invite-email">Email address</Label>
                  <Input
                    id="portal-invite-email"
                    type="email"
                    placeholder="contact@contractorcompany.com"
                    value={portalInviteEmail}
                    onChange={(e) => setPortalInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && portalInviteEmail.trim()) {
                        sendPortalInviteMutation.mutate(portalInviteEmail.trim());
                      }
                    }}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPortalInviteOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => sendPortalInviteMutation.mutate(portalInviteEmail.trim())}
                    disabled={!portalInviteEmail.trim() || sendPortalInviteMutation.isPending}
                  >
                    {sendPortalInviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                    Send Invite
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}
      </Tabs>

      {/* Worker Details Modal */}
      <Dialog open={!!viewingWorker} onOpenChange={() => setViewingWorker(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Worker Details: {viewingWorker?.firstName} {viewingWorker?.lastName}
            </DialogTitle>
          </DialogHeader>
          
          {viewingWorker && (
            <div className="space-y-6">
              {/* Current Card Status - Prominent Display */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Current Safety Status
                </h3>
                <div className="flex items-center gap-3">
                  {viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'red' && (
                    <Badge variant="destructive" className="text-sm px-3 py-1">
                      <XCircle className="w-4 h-4 mr-1" />
                      RED CARD - BANNED
                    </Badge>
                  )}
                  {viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'yellow' && (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1">
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      YELLOW CARD - WARNING
                    </Badge>
                  )}
                  {!viewingWorker.hasActiveDisciplinaryCard && (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      CLEAR - COMPLIANT
                    </Badge>
                  )}
                  {viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'red' && viewingWorker.redCardBanUntil && (
                    <span className="text-sm text-muted-foreground">
                      Ban until: {new Date(viewingWorker.redCardBanUntil).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {viewingWorker.cardStatusUpdatedAt && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Status updated: {new Date(viewingWorker.cardStatusUpdatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Personal Information</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="text-sm">{viewingWorker.email || 'Not provided'}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone</label>
                      <p className="text-sm">{viewingWorker.phone || 'Not provided'}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Home Postcode</label>
                      <p className="text-sm" data-testid="text-worker-postcode">{viewingWorker.postcode || 'Not provided'}</p>
                      <p className="text-xs text-muted-foreground">For CO2 emissions calculations</p>
                    </div>
                  </div>
                </div>

                {/* Work Status */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Work Status</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Right to Work</span>
                      <Badge variant={
                        viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'red' && 
                        viewingWorker.redCardBanUntil && 
                        new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? "destructive" 
                          : viewingWorker.rightToWork ? "default" : "destructive"
                      }>
                        {viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'red' && 
                         viewingWorker.redCardBanUntil && 
                         new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? 'Invalid (Banned)' 
                          : viewingWorker.rightToWork ? 'Valid' : 'Invalid'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Active Status</span>
                      <Badge variant={
                        viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'red' && 
                        viewingWorker.redCardBanUntil && 
                        new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? "destructive" 
                          : viewingWorker.isActive ? "default" : "secondary"
                      }>
                        {viewingWorker.hasActiveDisciplinaryCard && viewingWorker.currentCardStatus === 'red' && 
                         viewingWorker.redCardBanUntil && 
                         new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? 'Banned' 
                          : viewingWorker.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Induction</span>
                      <Badge variant={viewingWorker.inductionCompleted ? "default" : "outline"}>
                        {viewingWorker.inductionCompleted ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">CSCS Status</span>
                      <Badge variant={
                        viewingWorker.cscsStatus === 'valid' ? "default" : 
                        viewingWorker.cscsStatus === 'expired' ? "destructive" : 
                        "outline"
                      }>
                        {viewingWorker.cscsStatus || 'None'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">IPAF Status</span>
                      <Badge variant={
                        viewingWorker.ipafStatus && viewingWorker.ipafStatus !== 'none' && viewingWorker.ipafStatus !== 'expired' ? "default" : 
                        viewingWorker.ipafStatus === 'expired' ? "destructive" :
                        "outline"
                      }>
                        {viewingWorker.ipafStatus === 'none' ? 'None' : 
                         viewingWorker.ipafStatus === '3a' ? '3a - Mobile Vertical' :
                         viewingWorker.ipafStatus === '3b' ? '3b - Mobile Boom' :
                         viewingWorker.ipafStatus === '1+' ? '1+ - Static Vertical' :
                         viewingWorker.ipafStatus || 'None'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Transport Method</span>
                      <Badge variant="outline">
                        {viewingWorker.transportMethod === 'car_diesel' ? 'Diesel Car' :
                         viewingWorker.transportMethod === 'car_petrol' ? 'Petrol Car' :
                         viewingWorker.transportMethod === 'electric_car' ? 'Electric Car' :
                         viewingWorker.transportMethod === 'van_diesel' ? 'Diesel Van' :
                         viewingWorker.transportMethod === 'van_petrol' ? 'Petrol Van' :
                         viewingWorker.transportMethod === 'electric_van' ? 'Electric Van' :
                         viewingWorker.transportMethod === 'motorbike' ? 'Motorbike' :
                         viewingWorker.transportMethod === 'public_transport' ? 'Public Transport' :
                         viewingWorker.transportMethod === 'bicycle' ? 'Bicycle' :
                         viewingWorker.transportMethod === 'walk' ? 'Walk' :
                         'Not provided'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificates & Qualifications — catalogue-driven evidenced certs */}
              <WorkerCertificatesTab workerId={viewingWorker.id} />

              {/* DBS Certificates & Safeguarding */}
              <div className="border-t pt-4">
                <ContractorWorkerDbsTab
                  workerId={viewingWorker.id}
                  dbsRequired={viewingWorkerDbsRequired}
                  onDbsRequiredChange={setViewingWorkerDbsRequired}
                />
              </div>

              {/* Uploaded Documents */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Uploaded Documents
                  {viewingWorkerDocs.filter((d: any) => d.status === 'pending').length > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-xs ml-1">
                      {viewingWorkerDocs.filter((d: any) => d.status === 'pending').length} pending
                    </Badge>
                  )}
                </h3>
                {viewingWorkerDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {viewingWorkerDocs.map((doc: any) => {
                      const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                      return (
                        <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.documentName}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {doc.status === 'approved' ? (
                                <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
                                </Badge>
                              ) : doc.status === 'rejected' ? (
                                <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs">
                                  <XCircle className="h-3 w-3 mr-1" /> Rejected
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-xs">
                                  <Clock className="h-3 w-3 mr-1" /> Pending Review
                                </Badge>
                              )}
                              {doc.approvedBy && doc.approvedAt && (
                                <span className="text-xs text-muted-foreground">
                                  by <strong>{doc.approvedBy}</strong> · {new Date(doc.approvedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              )}
                              {isExpired && (
                                <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs">Expired</Badge>
                              )}
                              {doc.expiryDate && !isExpired && (
                                <span className="text-xs text-muted-foreground">
                                  Expires {format(new Date(doc.expiryDate), 'dd/MM/yyyy')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => window.open(objectUrl(doc.documentUrl), '_blank')}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            {doc.status === 'pending' && (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white h-7 px-3 text-xs"
                                onClick={() => approveWorkerDocumentMutation.mutate({ workerId: viewingWorker.id, documentId: doc.id })}
                                disabled={approveWorkerDocumentMutation.isPending}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isWorkerClearForWork(viewingWorker) && (
                <div className="pt-4 border-t">
                  <Button
                    onClick={() => {
                      setPreBookingWorker(viewingWorker);
                      setViewingWorker(null);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                    size="lg"
                  >
                    <CalendarPlus className="w-5 h-5 mr-2" />
                    Pre-Book This Worker
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* H&S acceptance now happens via e-pass link - no modal needed */}

      {/* Edit Worker Modal */}
      {selectedWorkerForEdit && (
        <ContractorEditModal
          worker={selectedWorkerForEdit}
          companyName={contractorData.name}
          open={!!selectedWorkerForEdit}
          onOpenChange={(open) => !open && setSelectedWorkerForEdit(null)}
          initialTab={autoOpenWorkerTab || undefined}
        />
      )}

      {/* Print Pass Modal */}
      {selectedWorkerForPrint && (
        <ContractorPassPreviewModal
          isOpen={!!selectedWorkerForPrint}
          onClose={() => setSelectedWorkerForPrint(null)}
          worker={selectedWorkerForPrint}
          companyName={contractorData.name}
        />
      )}

      {/* Pre-Book Worker Modal */}
      <Dialog open={!!preBookingWorker} onOpenChange={(open) => !open && setPreBookingWorker(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-indigo-600" />
              Pre-Book Worker
            </DialogTitle>
            <DialogDescription>
              Schedule {preBookingWorker?.firstName} {preBookingWorker?.lastName} from {contractorData?.name} for an upcoming site visit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {preBookingWorker?.firstName} {preBookingWorker?.lastName} - Cleared for Work
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(preBookDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={preBookDate}
                    onSelect={(date) => date && setPreBookDate(date)}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const checkDate = new Date(date);
                      checkDate.setHours(0, 0, 0, 0);
                      return checkDate < today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Arrival Time</Label>
                <Input
                  type="time"
                  value={preBookTime}
                  onChange={(e) => setPreBookTime(e.target.value)}
                  min={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const selectedDay = new Date(preBookDate);
                    selectedDay.setHours(0, 0, 0, 0);
                    if (selectedDay.getTime() === today.getTime()) {
                      const now = new Date();
                      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    }
                    return undefined;
                  })()}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (hours)</Label>
                <Select value={preBookDuration} onValueChange={setPreBookDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="4">4 hours (Half day)</SelectItem>
                    <SelectItem value="8">8 hours (Full day)</SelectItem>
                    <SelectItem value="10">10 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select value={preBookPurpose} onValueChange={setPreBookPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Site work">Site Work</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="Installation">Installation</SelectItem>
                  <SelectItem value="Inspection">Inspection</SelectItem>
                  <SelectItem value="Repair">Repair</SelectItem>
                  <SelectItem value="Survey">Survey</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <Select value={preBookHost} onValueChange={setPreBookHost}>
                <SelectTrigger>
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.filter((s: any) => s.isActive !== false).map((staff: any) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}{staff.department ? ` - ${staff.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={preBookNotes}
                onChange={(e) => setPreBookNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreBookingWorker(null)}>
              Cancel
            </Button>
            <Button
              onClick={handlePreBookWorker}
              disabled={preBookWorkerMutation.isPending || !preBookHost}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {preBookWorkerMutation.isPending ? "Booking..." : "Confirm Pre-Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Worker — 3-step Wizard */}
      <Dialog open={addingWorker} onOpenChange={(open) => { setAddingWorker(open); if (!open) { setWorkerWizardStep(1); setWorkerWizardSavedName(""); workerForm.reset(); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          {/* Header + Progress */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
              <User className="h-5 w-5 text-blue-600" />
              Add Worker — {contractorData?.name}
            </DialogTitle>
            <div className="flex items-center gap-0">
              {[{ n: 1, label: "Personal Details" }, { n: 2, label: "Right to Work & Cards" }, { n: 3, label: "Training & Review" }].map((s, i) => (
                <div key={s.n} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${workerWizardStep >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{workerWizardStep > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline transition-colors ${workerWizardStep >= s.n ? 'text-blue-700' : 'text-gray-400'}`}>{s.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${workerWizardStep > s.n ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>
          </div>

          <Form {...workerForm}>
            <form onSubmit={workerForm.handleSubmit(handleAddWorker)} className="flex flex-col flex-1 min-h-0">

              {/* Step 1 — Personal Details */}
              {workerWizardStep === 1 && (
                <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={workerForm.control} name="firstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input {...field} data-testid="input-worker-first-name" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={workerForm.control} name="lastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input {...field} data-testid="input-worker-last-name" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={workerForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email Address *</FormLabel><FormControl><Input type="email" {...field} placeholder="e.g. worker@company.com" data-testid="input-worker-email" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={workerForm.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Phone *</FormLabel><FormControl><Input {...field} placeholder="e.g. 07700 900000" data-testid="input-worker-phone" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={workerForm.control} name="postcode" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Home Postcode</FormLabel>
                        <FormControl><Input {...field} data-testid="input-worker-postcode" /></FormControl>
                        <p className="text-xs text-gray-500">Used for CO2 reporting</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={workerForm.control} name="transportMethod" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transport Method</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                          value={field.value ? field.value : "__none__"}
                        >
                          <FormControl><SelectTrigger data-testid="select-worker-transport"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Not specified</SelectItem>
                            <SelectItem value="car_diesel">Car (Diesel)</SelectItem>
                            <SelectItem value="car_petrol">Car (Petrol)</SelectItem>
                            <SelectItem value="electric_car">Electric Car</SelectItem>
                            <SelectItem value="hybrid_car">Hybrid Car</SelectItem>
                            <SelectItem value="van_diesel">Van (Diesel)</SelectItem>
                            <SelectItem value="van_petrol">Van (Petrol)</SelectItem>
                            <SelectItem value="motorcycle">Motorcycle</SelectItem>
                            <SelectItem value="public_transport">Public Transport</SelectItem>
                            <SelectItem value="bicycle">Bicycle</SelectItem>
                            <SelectItem value="walking">Walking</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}

              {/* Step 2 — Right to Work & Competence Cards */}
              {workerWizardStep === 2 && (
                <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">

                  {/* Right to Work */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Lock className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Right to Work</h4>
                        <p className="text-xs text-gray-500">Immigration Act 2014 — <span className="font-semibold text-red-600">Legally required before commencing work</span></p>
                      </div>
                    </div>
                    <FormField control={workerForm.control} name="rightToWork" render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger data-testid="input-worker-right-to-work"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="pending">⏳ Pending — check in progress</SelectItem>
                            <SelectItem value="valid">✅ Valid — check complete</SelectItem>
                            <SelectItem value="expired">❌ Expired — requires re-check</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {(workerForm.watch('rightToWork') === 'valid' || workerForm.watch('rightToWork') === 'expired') && (
                      <FormField control={workerForm.control} name="rightToWorkExpiryDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600">
                            {workerForm.watch('rightToWork') === 'expired' ? 'Expiry Date (when it expired)' : 'Expiry Date *'}
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-worker-rtw-expiry" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                    {workerForm.watch('rightToWork') === 'pending' && (
                      <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                        Worker cannot be permitted on site unsupervised until Right to Work is confirmed.
                      </div>
                    )}
                    {workerForm.watch('rightToWork') === 'valid' && (
                      <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                        <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800"><span className="font-semibold">Document evidence required.</span> After saving, upload a copy of the Right to Work document (passport, visa, share code) in the worker's H&S Documents tab.</p>
                      </div>
                    )}
                  </div>

                  {/* CSCS Card */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Shield className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">CSCS Card</h4>
                        <p className="text-xs text-gray-500">CDM 2015 / Site policy — required on most construction sites</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField control={workerForm.control} name="cscsCard" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Card Number</FormLabel>
                          <FormControl><Input {...field} placeholder="e.g. CS-1234567" data-testid="input-worker-cscs-card" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={workerForm.control} name="cscsStatus" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger data-testid="select-worker-cscs-status"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="none">Not held / not applicable</SelectItem>
                              <SelectItem value="pending">Pending — awaiting verification</SelectItem>
                              <SelectItem value="valid">Valid</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    {workerForm.watch('cscsStatus') === 'valid' && (
                      <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                        <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800"><span className="font-semibold">Card copy required.</span> After saving, upload a scan of the CSCS card in the worker's H&S Documents tab.</p>
                      </div>
                    )}
                  </div>

                  {/* IPAF */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Shield className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">IPAF Card</h4>
                        <p className="text-xs text-gray-500">PUWER / WAHR 2005 — required for MEWP operation</p>
                      </div>
                    </div>
                    <FormField control={workerForm.control} name="ipafStatus" render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger data-testid="select-worker-ipaf-status"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">Not applicable / not held</SelectItem>
                            <SelectItem value="valid">Valid</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}

              {/* Step 3 — Training & Summary */}
              {workerWizardStep === 3 && (
                <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
                  {/* Training certificates */}
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm mb-1">Training Certificates</h4>
                    <p className="text-xs text-gray-500 mb-3">Tick only if the worker holds a valid certificate. Upload a copy in the H&S Documents tab after saving.</p>
                    <div className="space-y-2">
                      <FormField control={workerForm.control} name="asbestosAwareness" render={({ field }) => (
                        <div className="border rounded-lg overflow-hidden">
                          <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" checked={field.value} onChange={field.onChange} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-worker-asbestos" />
                            <div><p className="font-medium text-sm">Asbestos Awareness</p><p className="text-xs text-gray-500">CAR 2012 — required for most construction/refurbishment work</p></div>
                          </label>
                          {field.value && <div className="bg-blue-50 border-t border-blue-100 px-3 py-2 flex items-center gap-2"><Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" /><p className="text-xs text-blue-800">Upload the supporting certificate in the <span className="font-semibold">H&S Documents</span> tab after saving.</p></div>}
                        </div>
                      )} />
                      <FormField control={workerForm.control} name="manualHandling" render={({ field }) => (
                        <div className="border rounded-lg overflow-hidden">
                          <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" checked={field.value} onChange={field.onChange} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-worker-manual-handling" />
                            <div><p className="font-medium text-sm">Manual Handling</p><p className="text-xs text-gray-500">MHOR 1992 — required for roles involving lifting or carrying</p></div>
                          </label>
                          {field.value && <div className="bg-blue-50 border-t border-blue-100 px-3 py-2 flex items-center gap-2"><Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" /><p className="text-xs text-blue-800">Upload the supporting certificate in the <span className="font-semibold">H&S Documents</span> tab after saving.</p></div>}
                        </div>
                      )} />
                      <FormField control={workerForm.control} name="workingAtHeight" render={({ field }) => (
                        <div className="border rounded-lg overflow-hidden">
                          <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" checked={field.value} onChange={field.onChange} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-worker-working-height" />
                            <div><p className="font-medium text-sm">Working at Height</p><p className="text-xs text-gray-500">WAHR 2005 — required when using ladders, scaffolding, or MEWPs</p></div>
                          </label>
                          {field.value && <div className="bg-blue-50 border-t border-blue-100 px-3 py-2 flex items-center gap-2"><Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" /><p className="text-xs text-blue-800">Upload the supporting certificate in the <span className="font-semibold">H&S Documents</span> tab after saving.</p></div>}
                        </div>
                      )} />
                      <FormField control={workerForm.control} name="inductionCompleted" render={({ field }) => (
                        <div className={`border rounded-lg overflow-hidden ${!canConfirmInduction ? 'opacity-60' : ''}`}>
                          <label className={`flex items-start gap-3 p-3 ${canConfirmInduction ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed'}`}>
                            <input type="checkbox" checked={field.value} onChange={canConfirmInduction ? field.onChange : undefined} disabled={!canConfirmInduction} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-worker-induction" />
                            <div>
                              <p className="font-medium text-sm flex items-center gap-1.5">Site Induction Completed <span className="text-xs font-normal bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Manager / Admin only</span></p>
                              <p className="text-xs text-gray-500">Site-specific H&S briefing completed — confirmation logged with your name, date and time</p>
                              {!canConfirmInduction && <p className="text-xs text-red-600 mt-0.5">Only managers and administrators can confirm site induction.</p>}
                            </div>
                          </label>
                          {field.value && <div className="bg-green-50 border-t border-green-100 px-3 py-2 text-xs text-green-800">✅ Will be logged to worker notes: confirmed by <span className="font-semibold">{currentUser?.username}</span></div>}
                        </div>
                      )} />
                    </div>
                  </div>

                  {/* Compliance summary */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Compliance Summary</h4>
                    <div className="space-y-1.5 text-sm">
                      {[
                        { label: 'Right to Work', val: workerForm.watch('rightToWork'), valid: 'valid', pending: 'pending' },
                        { label: 'CSCS Card', val: workerForm.watch('cscsStatus'), valid: 'valid', pending: 'pending' },
                        { label: 'IPAF', val: workerForm.watch('ipafStatus'), valid: 'valid', pending: 'none' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className="text-gray-600">{item.label}</span>
                          <Badge className={item.val === item.valid ? 'bg-green-100 text-green-700' : item.val === item.pending ? 'bg-gray-100 text-gray-500' : item.val === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                            {item.val === item.valid ? '✅ Valid' : item.val === 'expired' ? '❌ Expired' : item.val === 'none' ? '— N/A' : `⏳ ${item.val}`}
                          </Badge>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Asbestos Awareness</span>
                        <Badge className={workerForm.watch('asbestosAwareness') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{workerForm.watch('asbestosAwareness') ? '✅ Held' : '— Not recorded'}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Manual Handling</span>
                        <Badge className={workerForm.watch('manualHandling') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{workerForm.watch('manualHandling') ? '✅ Held' : '— Not recorded'}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4 — Success */}
              {workerWizardStep === 4 && (
                <div className="overflow-y-auto flex-1 min-h-0 px-6 py-8 flex flex-col items-center justify-center gap-5 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Worker Added</h3>
                    <p className="text-sm text-gray-500">
                      <span className="font-medium text-gray-800">{workerWizardSavedName}</span> has been registered to {contractorData?.name}.
                    </p>
                  </div>
                  {/* Document checklist reminder */}
                  {(workerWizardLastValues?.rightToWork === 'valid' || workerWizardLastValues?.cscsStatus === 'valid' || workerWizardLastValues?.asbestosAwareness || workerWizardLastValues?.manualHandling || workerWizardLastValues?.workingAtHeight) && (
                    <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
                      <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5"><Upload className="w-4 h-4" /> Documents still required</p>
                      <ul className="space-y-1">
                        {workerWizardLastValues?.rightToWork === 'valid' && <li className="text-xs text-amber-700">• Right to Work — upload passport / visa / share code</li>}
                        {workerWizardLastValues?.cscsStatus === 'valid' && <li className="text-xs text-amber-700">• CSCS Card — upload front &amp; back scan</li>}
                        {workerWizardLastValues?.asbestosAwareness && <li className="text-xs text-amber-700">• Asbestos Awareness certificate</li>}
                        {workerWizardLastValues?.manualHandling && <li className="text-xs text-amber-700">• Manual Handling certificate</li>}
                        {workerWizardLastValues?.workingAtHeight && <li className="text-xs text-amber-700">• Working at Height certificate</li>}
                      </ul>
                      <p className="text-xs text-amber-600 mt-2">Open the worker's profile → <span className="font-semibold">H&S Documents</span> tab to upload.</p>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                    <Button variant="outline" className="flex-1" onClick={() => { setAddingWorker(false); setWorkerWizardStep(1); setWorkerWizardSavedName(""); setWorkerWizardLastValues(null); workerForm.reset(); }}>
                      Done
                    </Button>
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => { setWorkerWizardStep(1); setWorkerWizardSavedName(""); setWorkerWizardLastValues(null); workerForm.reset(); }}>
                      Add Another Worker →
                    </Button>
                  </div>
                </div>
              )}

              {/* Footer navigation */}
              {workerWizardStep < 4 && (
              <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={() => workerWizardStep > 1 ? setWorkerWizardStep(workerWizardStep - 1) : setAddingWorker(false)}>
                  {workerWizardStep > 1 ? '← Back' : 'Cancel'}
                </Button>
                {workerWizardStep < 3 ? (
                  <Button
                    type="button"
                    onClick={() => setWorkerWizardStep(workerWizardStep + 1)}
                    disabled={
                      addWorkerMutation.isPending ||
                      (workerWizardStep === 1 && (!workerForm.watch('firstName') || !workerForm.watch('lastName') || !workerForm.watch('email') || !workerForm.watch('phone'))) ||
                      (workerWizardStep === 2 && workerForm.watch('rightToWork') === 'valid' && !workerForm.watch('rightToWorkExpiryDate'))
                    }
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Next →
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={addWorkerMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="button-submit-add-worker"
                    onClick={() => workerForm.handleSubmit(handleAddWorker)()}
                  >
                    {addWorkerMutation.isPending ? "Saving…" : "Save Worker"}
                  </Button>
                )}
              </div>
              )}
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Host Selection Dialog for Contractor Check-in */}
      <Dialog open={showCheckInHostDialog} onOpenChange={(open) => { if (!open) { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorker(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Host for {checkInWorker?.firstName} {checkInWorker?.lastName}</DialogTitle>
            <DialogDescription>Who is {checkInWorker?.firstName} {checkInWorker?.lastName} visiting today?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <Select value={selectedCheckInHost} onValueChange={setSelectedCheckInHost}>
                <SelectTrigger data-testid="select-contractor-host">
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.filter((s: any) => s.isActive !== false).map((staff: any) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}{staff.department ? ` - ${staff.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorker(null); }} data-testid="button-cancel-host-selection">
              Cancel
            </Button>
            <Button
              disabled={!selectedCheckInHost || checkInMutation.isPending}
              onClick={() => {
                if (!checkInWorker) return;
                const host = staffList.find((s: any) => s.id === selectedCheckInHost);
                checkInMutation.mutate({
                  worker: checkInWorker,
                  hostStaffId: selectedCheckInHost,
                  hostName: host ? `${host.firstName} ${host.lastName}` : undefined,
                });
                setShowCheckInHostDialog(false);
                setSelectedCheckInHost('');
                setCheckInWorker(null);
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-confirm-host-selection"
            >
              {checkInMutation.isPending ? "Checking In..." : "Check In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Upload Dialog */}
      <Dialog open={uploadDialog.open} onOpenChange={(open) => { if (!open) { setUploadDialog({ open: false, docKey: "", docName: "", requiresExpiry: false }); setUploadFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              {uploadDialog.existingId ? "Replace Document" : "Upload Document"}
            </DialogTitle>
            <DialogDescription>{uploadDialog.docName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">File <span className="text-red-500">*</span></Label>
              <div className="mt-1.5">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-md"
                  onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setAiExtracted(false); }}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-gray-500">PDF, Word, or image files accepted</p>
                  {uploadFile && ['application/pdf', 'image/jpeg', 'image/png'].includes(uploadFile.type) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={scanDocument}
                      disabled={isScanningDoc}
                      className="h-7 px-2 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                    >
                      {isScanningDoc ? (
                        <><RotateCcw className="w-3 h-3 mr-1 animate-spin" />Scanning…</>
                      ) : (
                        <><Sparkles className="w-3 h-3 mr-1" />Scan with AI</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {uploadDialog.requiresExpiry && (
              <div>
                <Label htmlFor="upload-expiry" className="text-sm font-medium">
                  Expiry Date {uploadDialog.requiresExpiry && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="upload-expiry"
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                  className="mt-1.5"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
            <div>
              <Label htmlFor="upload-issuer" className="text-sm font-medium">Issued by (optional)</Label>
              <Input
                id="upload-issuer"
                placeholder="e.g. Zurich Insurance, QBE"
                value={uploadIssuer}
                onChange={(e) => setUploadIssuer(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="upload-policy" className="text-sm font-medium">Policy / Certificate Number (optional)</Label>
              <Input
                id="upload-policy"
                placeholder="e.g. PL-2024-001234"
                value={uploadPolicy}
                onChange={(e) => setUploadPolicy(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          {aiExtracted && (
            <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-3 py-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 shrink-0" />
              AI-extracted — please verify the values before saving.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setUploadDialog({ open: false, docKey: "", docName: "", requiresExpiry: false }); setAiExtracted(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleDocumentUpload}
              disabled={uploading || !uploadFile}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {uploading ? "Uploading..." : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contractor Worker QR Pass Dialog */}
      <Dialog open={!!qrPassWorker} onOpenChange={(open) => { if (!open) { setQrPassWorker(null); setQrPassData(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              Contractor QR Check-In Pass
            </DialogTitle>
            <DialogDescription>
              Send a QR code pass to {qrPassWorker?.firstName} {qrPassWorker?.lastName} for quick kiosk check-in and check-out.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {qrPassWorker ? `${qrPassWorker.firstName[0]}${qrPassWorker.lastName[0]}` : ''}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{qrPassWorker?.firstName} {qrPassWorker?.lastName}</p>
                  <p className="text-sm text-gray-600">{(qrPassWorker as any)?.companyName || contractorData?.name}</p>
                </div>
              </div>
            </div>

            {qrPassData && (
              <div className="text-center p-4 bg-white rounded-lg border">
                <img
                  src=""
                  alt="Contractor QR Code"
                  className="w-40 h-40 mx-auto mb-2 rounded-lg shadow-sm"
                  ref={el => { if (!el || !qrPassData?.qrCode) return; import('qrcode').then(Q => Q.toDataURL(qrPassData.qrCode, { width: 160, margin: 1 })).then(u => { el.src = u; }); }}
                />
                <p className="text-xs text-gray-500 font-mono">{qrPassData.qrCode}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => qrPassWorker && sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'email' })}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Mail size={20} />
                <div className="text-left">
                  <div className="font-medium">Email QR Pass</div>
                  <div className="text-xs opacity-80">Send branded pass to {qrPassWorker?.email}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassWorker) return;
                  handlePrintWorkerQrPass(qrPassWorker.id);
                }}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Printer size={20} className="text-green-600" />
                <div className="text-left">
                  <div className="font-medium">Print QR Pass</div>
                  <div className="text-xs text-gray-500">Print a card-sized pass with QR code</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassWorker) return;
                  sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'download' }, {
                    onSuccess: (data: any) => {
                      handleDownloadWorkerQrPass(data.qrCode, data.workerName, (qrPassWorker as any).companyName || contractorData?.name || '');
                    }
                  });
                }}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Download size={20} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-medium">Download QR Image</div>
                  <div className="text-xs text-gray-500">Download branded pass as image</div>
                </div>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrPassWorker(null); setQrPassData(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Detail Modal */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedDocumentDetail?.doc.name}
            </DialogTitle>
            <DialogDescription>
              Document details and actions for this compliance document.
            </DialogDescription>
          </DialogHeader>
          {selectedDocumentDetail && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Status</p>
                  <p className="mt-0.5 font-medium capitalize">{selectedDocumentDetail.uploaded.status}</p>
                </div>
                {selectedDocumentDetail.uploaded.expiryDate && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Expires</p>
                    <p className="mt-0.5">{new Date(selectedDocumentDetail.uploaded.expiryDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
                {selectedDocumentDetail.uploaded.issuedBy && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Issued By</p>
                    <p className="mt-0.5">{selectedDocumentDetail.uploaded.issuedBy}</p>
                  </div>
                )}
                {selectedDocumentDetail.uploaded.policyNumber && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Policy Number</p>
                    <p className="mt-0.5">{selectedDocumentDetail.uploaded.policyNumber}</p>
                  </div>
                )}
                {selectedDocumentDetail.uploaded.approvedBy && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Approved By</p>
                    <p className="mt-0.5">{selectedDocumentDetail.uploaded.approvedBy} · {new Date(selectedDocumentDetail.uploaded.approvedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                {selectedDocumentDetail.uploaded.documentUrl && (
                  <Button variant="outline" className="w-full" onClick={() => window.open(objectUrl(selectedDocumentDetail.uploaded.documentUrl), '_blank')}>
                    <Eye className="h-4 w-4 mr-2" /> View Document
                  </Button>
                )}
                {selectedDocumentDetail.uploaded.status === 'pending' && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      approveDocumentMutation.mutate(selectedDocumentDetail.uploaded.id);
                      setShowDocumentModal(false);
                    }}
                    disabled={approveDocumentMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve Document
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    deleteInitiatedFromDetailRef.current = true;
                    deleteDocumentConfirmedRef.current = false;
                    setDocumentToDelete({ id: selectedDocumentDetail.uploaded.id, name: selectedDocumentDetail.doc.name });
                    setShowDocumentModal(false);
                    setShowDeleteDocumentConfirm(true);
                  }}
                  disabled={deleteCompanyDocumentMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Document
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Document Confirmation Dialog */}
      <Dialog
        open={showDeleteDocumentConfirm}
        onOpenChange={(open) => {
          if (!open) handleDeleteConfirmClose(deleteDocumentConfirmedRef.current);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{documentToDelete?.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDeleteConfirmClose(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCompanyDocumentMutation.isPending}
              onClick={() => {
                if (documentToDelete) {
                  deleteDocumentConfirmedRef.current = true;
                  deleteCompanyDocumentMutation.mutate(documentToDelete.id, {
                    onSuccess: () => handleDeleteConfirmClose(true),
                    onError: () => { deleteDocumentConfirmedRef.current = false; }
                  });
                }
              }}
            >
              {deleteCompanyDocumentMutation.isPending ? 'Deleting...' : 'Delete Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}