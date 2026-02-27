import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import WalkInContractorForm from "@/components/WalkInContractorForm";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import {
  HardHat,
  QrCode,
  Clock,
  Building2,
  Mail,
  Phone,
  CheckCircle,
  AlertTriangle,
  Search,
  LogIn,
  LogOut,
  UserPlus,
  CalendarPlus,
  Scan,
  ArrowLeft,
  Video,
} from "lucide-react";

import type { ContractorCompany, ContractorWorker, CompanySettings } from "@shared/schema";

export default function ContractorKiosk() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"main" | "scan" | "walkin" | "prebook" | "checkin">("main");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [checkedInWorker, setCheckedInWorker] = useState<ContractorWorker | null>(null);
  const [checkedInCompanyName, setCheckedInCompanyName] = useState<string>("");
  const [isQrLookupLoading, setIsQrLookupLoading] = useState(false);

  // Host selection state
  const [selectedWorkerForCheckIn, setSelectedWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostForWorker, setSelectedHostForWorker] = useState("");

  // H&S acceptance state
  const [showHSModal, setShowHSModal] = useState(false);
  const [pendingCheckin, setPendingCheckin] = useState<{ workerId: string; hostId: string } | null>(null);

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: workers = [] } = useQuery<ContractorWorker[]>({
    queryKey: [`/api/contractors/${selectedCompany}/workers`],
    enabled: !!selectedCompany,
  });

  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
  });

  const checkInMutation = useMutation({
    mutationFn: async ({ workerId, hostId, hsRulesAccepted }: { workerId: string; hostId: string; hsRulesAccepted?: boolean }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkin`, {
        hostId,
        ...(hsRulesAccepted ? { hsRulesAccepted: true } : {})
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });

      setShowHostSelection(false);
      setSelectedWorkerForCheckIn(null);
      setSelectedHostForWorker("");

      if (data.ePassSent) {
        toast({
          title: "Digital Pass Sent",
          description: `E-Pass has been sent to ${data.worker?.email || 'contractor'}. They can use it to check out.`,
          duration: 5000
        });
      } else {
        const worker = data.worker;
        const company = companies.find(c => c.id === worker.companyId);
        setCheckedInWorker(worker);
        setCheckedInCompanyName(company?.name || "Unknown Company");
        setShowPassPreview(true);
        toast({
          title: "Checked In",
          description: `${worker.firstName} ${worker.lastName} checked in successfully!`,
        });
      }
    },
    onError: (error) => {
      let errorDetails = "";
      try {
        const errorText = error.message;
        if (errorText.includes("details")) {
          const match = errorText.match(/details":"([^"]+)"/);
          if (match) errorDetails = match[1];
        }
      } catch (e) {}
      toast({
        title: "Cannot Check In",
        description: errorDetails || "Failed to check in worker",
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: (_, workerId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({
        title: "Checked Out",
        description: "Worker checked out successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out worker",
        variant: "destructive",
      });
    },
  });

  // QR scan handler — looks up worker by their ID (encoded in the QR code)
  const handleQrScan = async () => {
    const code = scannedCode.trim();
    if (!code) {
      toast({ title: "No code entered", description: "Please scan or type a QR code", variant: "destructive" });
      return;
    }

    setIsQrLookupLoading(true);
    try {
      const response = await fetch(`/api/contractors/workers/by-qr/${encodeURIComponent(code)}`, {
        credentials: "include",
      });

      if (response.status === 404) {
        toast({
          title: "QR Code Not Recognised",
          description: "This pass was not found. Please see reception for assistance.",
          variant: "destructive",
        });
        setScannedCode("");
        return;
      }

      if (!response.ok) {
        throw new Error("Lookup failed");
      }

      const { worker, companyName } = await response.json();
      setScannedCode("");

      if (worker.isCheckedIn) {
        // Immediately check out
        checkOutMutation.mutate(worker.id);
        toast({
          title: "Checking Out…",
          description: `Processing checkout for ${worker.firstName} ${worker.lastName}`,
        });
      } else {
        // Trigger host selection → H&S → check-in
        setSelectedWorkerForCheckIn(worker);
        setCheckedInCompanyName(companyName);
        setShowHostSelection(true);
      }
    } catch (err) {
      toast({
        title: "Scan Error",
        description: "Could not process the QR code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsQrLookupLoading(false);
    }
  };

  const handleWorkerCheckIn = (worker: ContractorWorker) => {
    setSelectedWorkerForCheckIn(worker);
    setShowHostSelection(true);
  };

  const handleHostSelectionConfirm = () => {
    if (!selectedHostForWorker) {
      toast({ title: "Error", description: "Please select a host", variant: "destructive" });
      return;
    }

    if (selectedWorkerForCheckIn) {
      const checkinData = { workerId: selectedWorkerForCheckIn.id, hostId: selectedHostForWorker };
      const settingsAny = settings as any;
      if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
        setShowHostSelection(false);
        setPendingCheckin(checkinData);
        setShowHSModal(true);
        return;
      }
      checkInMutation.mutate(checkinData);
    }
  };

  const handleHSAccepted = () => {
    setShowHSModal(false);
    if (pendingCheckin) {
      checkInMutation.mutate({ ...pendingCheckin, hsRulesAccepted: true });
      setPendingCheckin(null);
    }
  };

  const handleHSDeclined = () => {
    setShowHSModal(false);
    setPendingCheckin(null);
  };

  const filteredCompanies = companies.filter(company =>
    company.name.toLowerCase().includes(companySearchTerm.toLowerCase())
  );

  const filteredWorkers = workers.filter(worker =>
    worker.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ─── Walk-in sub-section ───────────────────────────────────────────────────
  if (activeSection === "walkin") {
    return (
      <div className="min-h-screen bg-background">
        <WalkInContractorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  // ─── QR Scan sub-section ───────────────────────────────────────────────────
  if (activeSection === "scan") {
    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-2 sm:p-3 flex flex-col">
        {settings?.bannerUrl && (
          <div className="w-full max-w-3xl mx-auto mb-2 sm:mb-3 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0">
            <img
              src={`/objects${settings.bannerUrl}`}
              alt={settings.companyName || ''}
              className="w-full h-auto object-contain max-h-28 sm:max-h-36 lg:max-h-40"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const container = e.currentTarget.parentElement;
                if (container) container.style.display = 'none';
              }}
            />
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 flex-1 flex flex-col justify-center">
          <div className="text-center flex-shrink-0">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-fixed mb-2 sm:mb-4">
              QR Code Scanner
            </h2>
            <p className="text-variable text-base sm:text-lg lg:text-xl">
              Scan your contractor pass to check in or check out
            </p>
          </div>

          <GlassCard className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col justify-center max-h-96">
            <div className="text-center space-y-4 sm:space-y-6">
              <div className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 mx-auto border-4 border-dashed border-purple-400 rounded-xl flex items-center justify-center bg-purple-50">
                <QrCode className="text-purple-600" size={40} />
              </div>

              <div className="space-y-3 sm:space-y-4">
                <Input
                  type="text"
                  placeholder="Scan QR code or enter ID manually…"
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQrScan()}
                  className="w-full px-4 sm:px-6 py-4 sm:py-6 rounded-xl text-center font-mono text-lg sm:text-xl lg:text-2xl"
                  data-testid="input-contractor-qr-code"
                  autoFocus
                />

                <div className="flex gap-3 sm:gap-4">
                  <Button
                    onClick={handleQrScan}
                    disabled={isQrLookupLoading || checkOutMutation.isPending}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white h-12 sm:h-14 lg:h-16 text-base sm:text-lg lg:text-xl font-semibold"
                    data-testid="button-scan-contractor-qr"
                  >
                    <Scan className="mr-2 sm:mr-3" size={20} />
                    {isQrLookupLoading || checkOutMutation.isPending ? "Processing…" : "Scan"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => { setActiveSection("main"); setScannedCode(""); }}
                    className="px-6 sm:px-8 h-12 sm:h-14 lg:h-16 text-base sm:text-lg"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </div>

              <div className="text-sm sm:text-base space-y-1 text-variable">
                <p>✓ Scan your contractor pass QR code to check in</p>
                <p>✓ If already checked in, scanning checks you out</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Modals rendered at scan level so host selection works from QR flow */}
        <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-variable">
                Who is {selectedWorkerForCheckIn?.firstName} visiting today?
              </p>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Host Staff Member *</Label>
                <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select host staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff?.map((member: any) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName} — {member.department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => { setShowHostSelection(false); setSelectedWorkerForCheckIn(null); setSelectedHostForWorker(""); }}>
                Cancel
              </Button>
              <Button onClick={handleHostSelectionConfirm} disabled={!selectedHostForWorker || checkInMutation.isPending}>
                {checkInMutation.isPending ? "Checking In…" : "Confirm Check-In"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={(settings as any)?.companyName}
          workerName={selectedWorkerForCheckIn ? `${selectedWorkerForCheckIn.firstName} ${selectedWorkerForCheckIn.lastName}` : undefined}
          hsRulesContent={(settings as any)?.hsRulesContent || ""}
          onAccept={handleHSAccepted}
          onDecline={handleHSDeclined}
        />

        {checkedInWorker && (
          <ContractorPassPreviewModal
            isOpen={showPassPreview}
            onClose={() => { setShowPassPreview(false); setCheckedInWorker(null); setCheckedInCompanyName(""); }}
            worker={checkedInWorker}
            companyName={checkedInCompanyName}
          />
        )}
      </div>
    );
  }

  // ─── Manual Check-In sub-section (kept for admin/reception use) ────────────
  if (activeSection === "checkin") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <HardHat className="h-10 w-10 text-orange-600" />
              <h1 className="text-3xl font-bold text-fixed">Contractor Worker Check-In/Out</h1>
            </div>
            <p className="text-variable">Select registered contractor workers for check-in/out</p>
          </GlassCard>

          <GlassCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-semibold text-slate-700">
                  Select Contractor Company ({companies.length} total)
                </Label>
                <Button variant="outline" onClick={() => setActiveSection("main")} className="text-variable">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Menu
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-variable" />
                <Input
                  value={companySearchTerm}
                  onChange={(e) => setCompanySearchTerm(e.target.value)}
                  placeholder="Search contractors by name…"
                  className="pl-10"
                />
              </div>

              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a contractor company…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {filteredCompanies.map((company) => {
                    const getSafetyRatingColor = (rating: string) => {
                      if (rating.startsWith('A')) return 'bg-green-100 text-green-800';
                      if (rating.startsWith('B')) return 'bg-yellow-100 text-yellow-800';
                      if (rating.startsWith('C')) return 'bg-orange-100 text-orange-800';
                      if (rating.startsWith('D')) return 'bg-red-100 text-red-800';
                      return 'bg-gray-100 text-gray-800';
                    };
                    return (
                      <SelectItem key={company.id} value={company.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{company.name}</span>
                          <Badge className={getSafetyRatingColor(company.complianceScore || 'N/A')}>
                            {company.complianceScore || 'N/A'}
                          </Badge>
                          <Badge variant={company.status === 'approved' ? 'default' : 'secondary'} className="text-xs">
                            {company.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {selectedCompany && (
            <GlassCard>
              <div className="space-y-4">
                <Label className="text-lg font-semibold text-slate-700">Search Workers</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-variable" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or email…"
                    className="pl-10"
                  />
                </div>
              </div>
            </GlassCard>
          )}

          {selectedCompany && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWorkers.map((worker) => (
                <GlassCard key={worker.id} className="hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-fixed">
                        {worker.firstName} {worker.lastName}
                      </h3>
                      {worker.email && (
                        <div className="flex items-center gap-1 text-sm text-variable">
                          <Mail className="h-4 w-4" />
                          {worker.email}
                        </div>
                      )}
                      {worker.phone && (
                        <div className="flex items-center gap-1 text-sm text-variable">
                          <Phone className="h-4 w-4" />
                          {worker.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex gap-2">
                        {worker.rightToWork === 'valid' ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />Right to Work
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />Right to Work
                          </Badge>
                        )}
                        {worker.cscsStatus === 'valid' ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />CSCS
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />CSCS
                          </Badge>
                        )}
                      </div>

                      {worker.isCheckedIn ? (
                        <Button
                          onClick={() => checkOutMutation.mutate(worker.id)}
                          disabled={checkOutMutation.isPending}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Check Out
                        </Button>
                      ) : !worker.inductionCompleted ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-center p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700 text-sm font-medium">Cannot Check In</p>
                            <p className="text-red-600 text-xs">Induction not completed</p>
                          </div>
                          <Button
                            onClick={() => window.open(`/induction/preview?role=contractor&workerId=${worker.id}`, '_blank', 'width=1200,height=800')}
                            variant="outline"
                            className="border-blue-500 text-blue-600 hover:bg-blue-50"
                          >
                            <Video className="mr-2 h-4 w-4" />
                            Start Induction
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => handleWorkerCheckIn(worker)}
                          disabled={checkInMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <LogIn className="mr-2 h-4 w-4" />
                          Check In
                        </Button>
                      )}
                    </div>
                  </div>

                  {worker.isCheckedIn && worker.checkedInAt && (
                    <div className="text-sm text-variable flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Checked in at {new Date(worker.checkedInAt).toLocaleTimeString()}
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main kiosk menu ───────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background flex flex-col px-4 sm:px-6 lg:px-8 py-3 sm:py-4 overflow-hidden">
      {/* Company banner */}
      {settings?.bannerUrl && (
        <div className="w-full max-w-2xl mx-auto rounded-xl overflow-hidden flex-shrink-0" style={{ maxHeight: '18vh' }}>
          <img
            src={`/objects${settings.bannerUrl}`}
            alt={settings.companyName || ''}
            className="w-full h-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const container = e.currentTarget.parentElement;
              if (container) container.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Heading */}
      <div className="text-center flex-shrink-0 py-2 sm:py-3">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-0.5">
          {settings?.companyName ? `Welcome to ${settings.companyName}` : 'Contractor Check-In'}
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">Please select an option below</p>
      </div>

      {/* 3-column option grid */}
      <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full min-h-0">
        <div className="grid grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-4 sm:mb-6">
          {/* Scan QR Code */}
          <div
            className="cursor-pointer"
            onClick={() => setActiveSection("scan")}
            data-testid="card-qr-scanner"
          >
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <QrCode className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Scan QR Code</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Check in or check out with your pass</p>
            </GlassCard>
          </div>

          {/* Walk-in Registration */}
          <div
            className="cursor-pointer"
            onClick={() => setActiveSection("walkin")}
            data-testid="card-walkin-registration"
          >
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <UserPlus className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Walk-in Contractor</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Register and get your site pass</p>
            </GlassCard>
          </div>

          {/* Pre-Book */}
          <div
            className="cursor-pointer"
            onClick={() => setActiveSection("prebook")}
            data-testid="card-prebook-contractor"
          >
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <CalendarPlus className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Pre-Book Visit</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Schedule a future contractor visit</p>
            </GlassCard>
          </div>
        </div>

        {/* Instructions bar */}
        <GlassCard className="p-4 sm:p-5 flex-shrink-0">
          <h3 className="text-base sm:text-lg font-semibold text-fixed mb-3 text-center">Instructions</h3>
          <div className="grid grid-cols-3 gap-4 sm:gap-6 text-variable">
            <div className="text-center">
              <QrCode className="mx-auto mb-1.5 text-purple-500" size={22} />
              <p className="font-medium mb-0.5 text-sm text-foreground">Returning contractors</p>
              <p className="text-xs text-muted-foreground">Scan your QR pass to check in or out</p>
            </div>
            <div className="text-center">
              <UserPlus className="mx-auto mb-1.5 text-green-500" size={22} />
              <p className="font-medium mb-0.5 text-sm text-foreground">New contractors</p>
              <p className="text-xs text-muted-foreground">Register here to get your site pass</p>
            </div>
            <div className="text-center">
              <CalendarPlus className="mx-auto mb-1.5 text-blue-500" size={22} />
              <p className="font-medium mb-0.5 text-sm text-foreground">Pre-book a visit</p>
              <p className="text-xs text-muted-foreground">Schedule future contractor visits</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Pass preview modal */}
      {checkedInWorker && (
        <ContractorPassPreviewModal
          isOpen={showPassPreview}
          onClose={() => { setShowPassPreview(false); setCheckedInWorker(null); setCheckedInCompanyName(""); }}
          worker={checkedInWorker}
          companyName={checkedInCompanyName}
        />
      )}

      {/* Host selection dialog */}
      <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-variable">
              Who is {selectedWorkerForCheckIn?.firstName} visiting today?
            </p>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Host Staff Member *</Label>
              <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                <SelectTrigger data-testid="select-contractor-host">
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} — {member.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => { setShowHostSelection(false); setSelectedWorkerForCheckIn(null); setSelectedHostForWorker(""); }}
              data-testid="button-cancel-host-selection"
            >
              Cancel
            </Button>
            <Button
              onClick={handleHostSelectionConfirm}
              disabled={!selectedHostForWorker || checkInMutation.isPending}
              data-testid="button-confirm-host-selection"
            >
              {checkInMutation.isPending ? "Checking In…" : "Confirm Check-In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* H&S acceptance modal */}
      <HSAcceptanceModal
        isOpen={showHSModal}
        companyName={(settings as any)?.companyName}
        workerName={selectedWorkerForCheckIn ? `${selectedWorkerForCheckIn.firstName} ${selectedWorkerForCheckIn.lastName}` : undefined}
        hsRulesContent={(settings as any)?.hsRulesContent || ""}
        onAccept={handleHSAccepted}
        onDecline={handleHSDeclined}
      />
    </div>
  );
}
