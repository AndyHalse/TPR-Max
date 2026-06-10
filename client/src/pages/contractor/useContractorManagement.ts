import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { ContractorCompany, ContractorWorker } from "@shared/schema";
import { type ExtendedContractorCompany, type CdmProject, isF10Overdue } from "./types";
import { printPassViaIframe } from "@/lib/printUtils";

export function useContractorManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [showQRScanner, setShowQRScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<"previous"|"walkin"|"prebook"|"contractors"|"co2"|"assign-hs"|"rams"|"ppm"|"cdm">("previous");
  const [selectedCO2CompanyId, setSelectedCO2CompanyId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [companyViewMode, setCompanyViewMode] = useState<"grid"|"list">("grid");
  const [previousViewMode, setPreviousViewMode] = useState<"grid"|"list">("list");
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<ContractorWorker | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>("");
  const [showAddContractorDialog, setShowAddContractorDialog] = useState(false);
  const [showContractorEditModal, setShowContractorEditModal] = useState(false);
  const [showCompanyEditDialog, setShowCompanyEditDialog] = useState(false);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerCompanyName, setSelectedWorkerCompanyName] = useState<string>("");
  const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCompany | null>(null);
  const [showHSModal, setShowHSModal] = useState(false);
  const [workerForCheckIn, setWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [companyForCheckIn, setCompanyForCheckIn] = useState<string>("");
  const [preBookingWorker, setPreBookingWorker] = useState<ContractorWorker | null>(null);
  const [preBookCompanyName, setPreBookCompanyName] = useState("");
  const [showCheckInHostDialog, setShowCheckInHostDialog] = useState(false);
  const [checkInWorkerId, setCheckInWorkerId] = useState<string | null>(null);
  const [checkInWorkerName, setCheckInWorkerName] = useState("");
  const [selectedCheckInHost, setSelectedCheckInHost] = useState("");
  const [viewingWorker, setViewingWorker] = useState<any | null>(null);
  const [qrPassWorker, setQrPassWorker] = useState<any | null>(null);

  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string; role?: string }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5000,
  });

  const customerId = currentUser?.customerId;

  const { data: companies = [] } = useQuery<ExtendedContractorCompany[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!currentUser,
  });

  const { data: allCdmProjects = [] } = useQuery<CdmProject[]>({
    queryKey: ["/api/cdm/projects", customerId],
    enabled: !!currentUser,
    refetchInterval: 60000,
  });

  const headerF10OverdueCount = allCdmProjects.filter(isF10Overdue).length;

  const { data: allWorkers = [], refetch: refetchWorkers } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all", customerId],
    enabled: activeTab === "previous" && !!customerId,
  });

  const { data: staffList = [] } = useQuery<any[]>({ queryKey: ["/api/staff"] });
  const { data: zones = [] } = useQuery<any[]>({ queryKey: ["/api/zones"] });
  const { data: activeLoneWorkers = [] } = useQuery<any[]>({
    queryKey: ["/api/lone-worker/active"],
    refetchInterval: 30000,
  });
  const { data: companySettings } = useQuery<any>({ queryKey: ["/api/settings"] });

  useEffect(() => {
    const gatedTabs: Record<string, boolean | null | undefined> = {
      co2: companySettings?.featureContractors,
      ppm: companySettings?.featurePPM,
      cdm: companySettings?.featureContractors,
    };
    if (activeTab in gatedTabs && gatedTabs[activeTab] === false) {
      setActiveTab("previous");
    }
  }, [activeTab, companySettings]);

  const startContractorLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/lone-worker/active"] }),
    onError: () => toast({ title: "Error", description: "Failed to start lone worker session.", variant: "destructive" }),
  });

  const endContractorLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/end`, { endedBy: "supervisor" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/lone-worker/active"] }),
    onError: () => toast({ title: "Error", description: "Failed to end lone worker session.", variant: "destructive" }),
  });

  const getContractorLoneWorkerSession = (workerId: string) =>
    activeLoneWorkers.find((s: any) => s.personId === workerId && s.personType === "contractor");

  const getLoneWorkerCountdown = (session: any): string => {
    if (!session?.nextDeadline) return "Lone Worker";
    const minsLeft = Math.round((new Date(session.nextDeadline).getTime() - Date.now()) / 60000);
    if (minsLeft < 0) return `${Math.abs(minsLeft)}m overdue`;
    return `Next: ${minsLeft}m`;
  };

  const generateTestWorkersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/contractors/generate-test-workers");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Test Workers Generated", description: "Successfully created test workers for all contractor companies" });
      refetchWorkers();
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: () => toast({ title: "Error", description: "Failed to generate test workers", variant: "destructive" }),
  });

  const deleteContractorMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("DELETE", `/api/contractors/${contractorId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      toast({ title: "Success", description: "Contractor deleted successfully" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete contractor", variant: "destructive" }),
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("DELETE", `/api/workers/${workerId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      toast({ title: "Success", description: "Worker deleted successfully" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete worker", variant: "destructive" }),
  });

  const checkInMutation = useMutation({
    mutationFn: async (data: { workerId: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${data.workerId}/checkin`, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
        purpose: "Work",
        hostStaffId: data.hostStaffId,
        hostName: data.hostName,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      if (data.ePassSent) {
        toast({ title: "Digital Pass Sent", description: `E-Pass has been sent to ${data.worker?.email || "contractor"}. They can use it to check out.`, duration: 5000 });
      } else {
        const worker = data.worker;
        const company = companies.find((c: any) => c.id === worker.companyId);
        setSelectedWorker(worker);
        setSelectedCompanyName(company?.name || "Unknown Company");
        setShowPassPreview(true);
        printPassViaIframe(`/api/passes/print/contractor/${worker.id}`);
        const ePassFailed = data.hasEmail && data.ePassEnabled && !data.ePassSent;
        toast({ title: "Checked In", description: ePassFailed ? "E-pass could not be sent — pass is printing." : "Contractor checked in. Pass is printing.", variant: ePassFailed ? "destructive" : "default", duration: 6000 });
      }
    },
    onError: (error: any) => toast({ title: "Cannot Check In", description: error?.message || "Failed to check in contractor", variant: "destructive" }),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      toast({ title: "Success", description: "Contractor checked out successfully!" });
    },
    onError: () => toast({ title: "Error", description: "Failed to check out contractor", variant: "destructive" }),
  });

  const sendInductionMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("POST", `/api/contractors/${contractorId}/send-induction`);
      return response.json();
    },
    onSuccess: () => toast({ title: "Induction Email Sent ✅", description: "The induction link has been emailed to the contractor. They must complete it before site access.", duration: 5000 }),
    onError: (error: any) => toast({ title: "Failed to Send Induction", description: error.message || "Unable to send induction email. Please try again.", variant: "destructive" }),
  });

  const handleViewContractorDetails = (contractorId: string) => {
    setLocation(`/contractors/${contractorId}`);
  };

  const handleEditContractor = (contractorId: string) => {
    const company = companies.find((c: any) => c.id === contractorId);
    if (company) {
      setSelectedContractor(company as any);
      setShowCompanyEditDialog(true);
    }
  };

  const handleDeleteContractor = (contractorId: string, contractorName: string) => {
    if (window.confirm(`Are you sure you want to delete "${contractorName}"? This action cannot be undone.`)) {
      deleteContractorMutation.mutate(contractorId);
    }
  };

  const handleDeleteWorker = (workerId: string, workerName: string) => {
    if (window.confirm(`Are you sure you want to delete "${workerName}"? This action cannot be undone.`)) {
      deleteWorkerMutation.mutate(workerId);
    }
  };

  const previousContractors = allWorkers
    .map((worker) => {
      const company = companies.find((c: any) => c.id === worker.companyId);
      return { ...worker, companyName: company?.name || "Unknown Company", companyStatus: company?.status || "unknown", safetyRating: company?.complianceScore || "N/A" };
    })
    .filter((c) =>
      (c.firstName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.lastName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.companyName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

  return {
    toast,
    setLocation,
    showQRScanner, setShowQRScanner,
    activeTab, setActiveTab,
    selectedCO2CompanyId, setSelectedCO2CompanyId,
    searchTerm, setSearchTerm,
    showWalkInForm, setShowWalkInForm,
    showAllWorkers, setShowAllWorkers,
    showAllCompanies, setShowAllCompanies,
    companyViewMode, setCompanyViewMode,
    previousViewMode, setPreviousViewMode,
    showPassPreview, setShowPassPreview,
    selectedWorker, setSelectedWorker,
    selectedCompanyName, setSelectedCompanyName,
    showAddContractorDialog, setShowAddContractorDialog,
    showContractorEditModal, setShowContractorEditModal,
    showCompanyEditDialog, setShowCompanyEditDialog,
    selectedWorkerForEdit, setSelectedWorkerForEdit,
    selectedWorkerCompanyName, setSelectedWorkerCompanyName,
    showAddWorkerDialog, setShowAddWorkerDialog,
    selectedContractor, setSelectedContractor,
    showHSModal, setShowHSModal,
    workerForCheckIn, setWorkerForCheckIn,
    companyForCheckIn, setCompanyForCheckIn,
    preBookingWorker, setPreBookingWorker,
    preBookCompanyName, setPreBookCompanyName,
    showCheckInHostDialog, setShowCheckInHostDialog,
    checkInWorkerId, setCheckInWorkerId,
    checkInWorkerName, setCheckInWorkerName,
    selectedCheckInHost, setSelectedCheckInHost,
    viewingWorker, setViewingWorker,
    qrPassWorker, setQrPassWorker,
    customerId,
    companies,
    headerF10OverdueCount,
    allWorkers,
    staffList,
    zones,
    companySettings,
    startContractorLoneWorkerMutation,
    endContractorLoneWorkerMutation,
    generateTestWorkersMutation,
    deleteContractorMutation,
    checkInMutation,
    checkOutMutation,
    sendInductionMutation,
    getContractorLoneWorkerSession,
    getLoneWorkerCountdown,
    handleViewContractorDetails,
    handleEditContractor,
    handleDeleteContractor,
    handleDeleteWorker,
    previousContractors,
  };
}
