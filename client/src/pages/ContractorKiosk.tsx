import { useState } from "react";
import { useLocation } from "wouter";
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
  ClipboardList,
  ChevronRight,
  User,
} from "lucide-react";

import type { ContractorCompany, ContractorWorker, CompanySettings } from "@shared/schema";

export default function ContractorKiosk() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
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
  const [pendingCheckin, setPendingCheckin] = useState<{ workerId?: string; hostId?: string; qrCode?: string; prebookingMode?: boolean } | null>(null);
  const [pendingWorkerName, setPendingWorkerName] = useState<string>("");

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

  const { data: todayPrebookings = [], isLoading: prebookingsLoading } = useQuery<any[]>({
    queryKey: ["/api/contractors/prebookings/today"],
    enabled: activeSection === "prebook",
    refetchInterval: activeSection === "prebook" ? 30000 : false,
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
          description: `E-Pass sent to ${data.worker?.email || 'contractor'}. They can use it to check out.`,
          duration: 5000
        });
      } else {
        const worker = data.worker;
        const company = companies.find(c => c.id === worker.companyId);
        setCheckedInWorker(worker);
        setCheckedInCompanyName(company?.name || "Unknown Company");
        setShowPassPreview(true);
        toast({ title: "Checked In", description: `${worker.firstName} ${worker.lastName} checked in successfully!` });
      }
    },
    onError: (error) => {
      toast({ title: "Cannot Check In", description: "Failed to check in worker", variant: "destructive" });
    },
  });

  const prebookingCheckinMutation = useMutation({
    mutationFn: async ({ qrCode, hsRulesAccepted }: { qrCode: string; hsRulesAccepted?: boolean }) => {
      const response = await apiRequest("POST", "/api/contractors/prebookings/checkin", {
        qrCode,
        ...(hsRulesAccepted ? { hsRulesAccepted: true } : {})
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({ title: "Checked In", description: `Pre-booked contractor checked in successfully!`, duration: 4000 });
      setActiveSection("main");
    },
    onError: () => {
      toast({ title: "Check-In Failed", description: "Could not complete the pre-booking check-in. Please see reception.", variant: "destructive" });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({ title: "Checked Out", description: "Worker checked out successfully!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to check out worker", variant: "destructive" });
    },
  });

  // QR scan handler
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
        toast({ title: "QR Code Not Recognised", description: "This pass was not found. Please see reception for assistance.", variant: "destructive" });
        setScannedCode("");
        return;
      }

      if (!response.ok) throw new Error("Lookup failed");

      const { worker, companyName } = await response.json();
      setScannedCode("");

      if (worker.isCheckedIn) {
        checkOutMutation.mutate(worker.id);
        toast({ title: "Checking Out…", description: `Processing checkout for ${worker.firstName} ${worker.lastName}` });
      } else {
        setSelectedWorkerForCheckIn(worker);
        setCheckedInCompanyName(companyName);
        setShowHostSelection(true);
      }
    } catch {
      toast({ title: "Scan Error", description: "Could not process the QR code. Please try again.", variant: "destructive" });
    } finally {
      setIsQrLookupLoading(false);
    }
  };

  // Pre-booking check-in: tap name → H&S if needed → checkin
  const handlePrebookingSelect = (prebooking: any) => {
    const settingsAny = settings as any;
    const hsRequired = settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent;

    if (hsRequired) {
      setPendingWorkerName(prebooking.workerName || "Contractor");
      setPendingCheckin({ qrCode: prebooking.qrCode, prebookingMode: true });
      setShowHSModal(true);
    } else {
      prebookingCheckinMutation.mutate({ qrCode: prebooking.qrCode });
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
        setPendingWorkerName(`${selectedWorkerForCheckIn.firstName} ${selectedWorkerForCheckIn.lastName}`);
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
      if (pendingCheckin.prebookingMode && pendingCheckin.qrCode) {
        prebookingCheckinMutation.mutate({ qrCode: pendingCheckin.qrCode, hsRulesAccepted: true });
      } else if (pendingCheckin.workerId && pendingCheckin.hostId) {
        checkInMutation.mutate({ workerId: pendingCheckin.workerId, hostId: pendingCheckin.hostId, hsRulesAccepted: true });
      }
      setPendingCheckin(null);
      setPendingWorkerName("");
    }
  };

  const handleHSDeclined = () => {
    setShowHSModal(false);
    setPendingCheckin(null);
    setPendingWorkerName("");
  };

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(companySearchTerm.toLowerCase()));
  const filteredWorkers = workers.filter(w =>
    w.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const settingsAny = settings as any;

  // ─── Walk-in sub-section ──────────────────────────────────────────────────
  if (activeSection === "walkin") {
    return (
      <div className="min-h-screen bg-background">
        <WalkInContractorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  // ─── QR Scan sub-section ──────────────────────────────────────────────────
  if (activeSection === "scan") {
    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-2 sm:p-3 flex flex-col">
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
                  autoFocus
                />

                <div className="flex gap-3 sm:gap-4">
                  <Button
                    onClick={handleQrScan}
                    disabled={isQrLookupLoading || checkOutMutation.isPending}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white h-12 sm:h-14 lg:h-16 text-base sm:text-lg lg:text-xl font-semibold"
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

        <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-variable">Who is {selectedWorkerForCheckIn?.firstName} visiting today?</p>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Host Staff Member *</Label>
                <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                  <SelectTrigger><SelectValue placeholder="Select host staff member" /></SelectTrigger>
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
              <Button variant="outline" onClick={() => { setShowHostSelection(false); setSelectedWorkerForCheckIn(null); setSelectedHostForWorker(""); }}>Cancel</Button>
              <Button onClick={handleHostSelectionConfirm} disabled={!selectedHostForWorker || checkInMutation.isPending}>
                {checkInMutation.isPending ? "Checking In…" : "Confirm Check-In"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={settingsAny?.companyName}
          workerName={pendingWorkerName || undefined}
          hsRulesContent={settingsAny?.hsRulesContent || ""}
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

  // ─── Pre-Book Visit sub-section ───────────────────────────────────────────
  if (activeSection === "prebook") {
    const pendingBookings = todayPrebookings.filter((b: any) => b.status !== "completed" && b.status !== "cancelled");
    const completedBookings = todayPrebookings.filter((b: any) => b.status === "completed");

    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-3 sm:p-4 flex flex-col">
        <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col gap-4 sm:gap-6">
          {/* Header */}
          <div className="text-center flex-shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="text-white w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-fixed mb-1">Pre-Booked Visits</h2>
            <p className="text-variable text-sm sm:text-base">Select your name below to check in</p>
          </div>

          {/* Booking list */}
          <GlassCard className="flex-1 p-4 sm:p-6">
            {prebookingsLoading ? (
              <div className="text-center py-12 text-variable">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p>Loading today's bookings…</p>
              </div>
            ) : pendingBookings.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-fixed mb-1">No pre-bookings for today</p>
                <p className="text-variable text-sm">If you have a booking and your name isn't shown, please see reception.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-variable mb-3">
                  {pendingBookings.length} booking{pendingBookings.length !== 1 ? "s" : ""} awaiting check-in today
                </p>
                {pendingBookings.map((booking: any) => (
                  <button
                    key={booking.id}
                    onClick={() => handlePrebookingSelect(booking)}
                    disabled={prebookingCheckinMutation.isPending}
                    className="w-full text-left p-4 sm:p-5 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.99] transition-all group flex items-center justify-between gap-3 bg-white disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 group-hover:from-blue-200 group-hover:to-indigo-200 transition-colors">
                        <User className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-bold text-fixed truncate">{booking.workerName}</p>
                        <p className="text-sm text-variable truncate">{booking.companyName}</p>
                        {booking.scheduledTime && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            Booked for {booking.scheduledTime}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:block text-sm font-semibold text-blue-600 group-hover:text-blue-700">Tap to check in</span>
                      <ChevronRight className="w-5 h-5 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Completed bookings */}
            {completedBookings.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Already checked in today</p>
                <div className="space-y-2">
                  {completedBookings.map((booking: any) => (
                    <div key={booking.id} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-green-800 truncate">{booking.workerName}</p>
                        <p className="text-xs text-green-600 truncate">{booking.companyName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          <Button
            variant="outline"
            onClick={() => setActiveSection("main")}
            className="flex-shrink-0 h-12 text-base"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Menu
          </Button>
        </div>

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={settingsAny?.companyName}
          workerName={pendingWorkerName || undefined}
          hsRulesContent={settingsAny?.hsRulesContent || ""}
          onAccept={handleHSAccepted}
          onDecline={handleHSDeclined}
        />
      </div>
    );
  }

  // ─── Manual Check-In sub-section (admin/reception use) ────────────────────
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
                  {filteredCompanies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{company.name}</span>
                      </div>
                    </SelectItem>
                  ))}
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
                      <h3 className="text-lg font-semibold text-fixed">{worker.firstName} {worker.lastName}</h3>
                      {worker.email && (
                        <div className="flex items-center gap-1 text-sm text-variable">
                          <Mail className="h-4 w-4" />{worker.email}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {worker.isCheckedIn ? (
                        <Button onClick={() => checkOutMutation.mutate(worker.id)} disabled={checkOutMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                          <LogOut className="mr-2 h-4 w-4" />Check Out
                        </Button>
                      ) : !worker.inductionCompleted ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-center p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700 text-sm font-medium">Cannot Check In</p>
                            <p className="text-red-600 text-xs">Induction not completed</p>
                          </div>
                          <Button onClick={() => window.open(`/induction/preview?role=contractor&workerId=${worker.id}`, '_blank')} variant="outline" className="border-blue-500 text-blue-600">
                            <Video className="mr-2 h-4 w-4" />Start Induction
                          </Button>
                        </div>
                      ) : (
                        <Button onClick={() => handleWorkerCheckIn(worker)} disabled={checkInMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                          <LogIn className="mr-2 h-4 w-4" />Check In
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

  // ─── Main kiosk menu ──────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background flex flex-col px-4 sm:px-6 lg:px-8 py-3 sm:py-4 overflow-hidden">
      {/* Company banner */}
      {settingsAny?.bannerUrl && (
        <div className="w-full max-w-2xl mx-auto mb-2 sm:mb-3 rounded-xl overflow-hidden flex-shrink-0" style={{ maxHeight: '18vh' }}>
          <img
            src={`/objects${settingsAny.bannerUrl}`}
            alt={settingsAny.companyName || ''}
            className="w-full h-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const c = e.currentTarget.parentElement;
              if (c) c.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Heading — tapping navigates back to dashboard (like main kiosk) */}
      <div className="text-center flex-shrink-0 py-2 sm:py-3">
        <h2
          className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-0.5 cursor-pointer hover:opacity-70 transition-opacity select-none"
          onClick={() => setLocation("/")}
        >
          Welcome to {settingsAny?.companyName || 'Contractor Check-In'}
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">Please select an option below</p>
      </div>

      {/* 3-column option grid */}
      <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full min-h-0">
        <div className="grid grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-4 sm:mb-6">
          {/* Scan QR Code */}
          <div className="cursor-pointer" onClick={() => setActiveSection("scan")}>
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <QrCode className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Scan QR Code</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Check in or check out with your pass</p>
            </GlassCard>
          </div>

          {/* Walk-in Registration */}
          <div className="cursor-pointer" onClick={() => setActiveSection("walkin")}>
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <UserPlus className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Walk-in Contractor</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Register and get your site pass</p>
            </GlassCard>
          </div>

          {/* Pre-Book Visit */}
          <div className="cursor-pointer" onClick={() => setActiveSection("prebook")}>
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <CalendarPlus className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Pre-Booked Visit</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Select your name to check in</p>
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
              <p className="font-medium mb-0.5 text-sm text-foreground">Pre-booked visit</p>
              <p className="text-xs text-muted-foreground">Tap your name from today's list</p>
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
            <DialogTitle>Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-variable">Who is {selectedWorkerForCheckIn?.firstName} visiting today?</p>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Host Staff Member *</Label>
              <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                <SelectTrigger><SelectValue placeholder="Select host staff member" /></SelectTrigger>
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

      {/* H&S acceptance modal */}
      <HSAcceptanceModal
        isOpen={showHSModal}
        companyName={settingsAny?.companyName}
        workerName={pendingWorkerName || undefined}
        hsRulesContent={settingsAny?.hsRulesContent || ""}
        onAccept={handleHSAccepted}
        onDecline={handleHSDeclined}
      />
    </div>
  );
}
