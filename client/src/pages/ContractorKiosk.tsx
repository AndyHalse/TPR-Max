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
import { 
  HardHat, 
  QrCode, 
  UserCheck, 
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
  History,
  ArrowLeft,
  Video
} from "lucide-react";

import type { ContractorCompany, ContractorWorker } from "@shared/schema";

export default function ContractorKiosk() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"main" | "scan" | "walkin" | "prebook" | "checkin" | "history">("main");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<ContractorWorker | null>(null);
  const [showPassModal, setShowPassModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [checkedInWorker, setCheckedInWorker] = useState<ContractorWorker | null>(null);
  const [checkedInCompanyName, setCheckedInCompanyName] = useState<string>("");
  
  // Host selection state for contractor check-in (same as visitor workflow)
  const [selectedWorkerForCheckIn, setSelectedWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostForWorker, setSelectedHostForWorker] = useState("");

  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: workers = [] } = useQuery<ContractorWorker[]>({
    queryKey: [`/api/contractors/${selectedCompany}/workers`],
    enabled: !!selectedCompany,
  });

  // Staff query for host selection (same as visitor workflow)
  const { data: staff = [] } = useQuery({
    queryKey: ["/api/staff"],
  });

  const checkInMutation = useMutation({
    mutationFn: async ({ workerId, hostId }: { workerId: string; hostId: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkin`, {
        hostId: hostId
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      
      // Find the company name for the worker
      const worker = data.worker;
      const company = companies.find(c => c.id === worker.companyId);
      
      // Set up for pass preview and printing
      setCheckedInWorker(worker);
      setCheckedInCompanyName(company?.name || "Unknown Company");
      setShowPassPreview(true);
      
      // Reset host selection state
      setShowHostSelection(false);
      setSelectedWorkerForCheckIn(null);
      setSelectedHostForWorker("");
      
      toast({
        title: "Success",
        description: "Worker checked in successfully! Pass preview will open for printing.",
      });
    },
    onError: (error) => {
      let errorMessage = "Failed to check in worker";
      let errorDetails = "";
      
      try {
        // Try to parse the error response for detailed information
        const errorText = error.message;
        if (errorText.includes("details")) {
          const match = errorText.match(/details":"([^"]+)"/);
          if (match) {
            errorDetails = match[1];
          }
        }
      } catch (e) {
        // If parsing fails, use default message
      }
      
      toast({
        title: "Cannot Check In",
        description: errorDetails || errorMessage,
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      toast({
        title: "Success",
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

  // Handler for starting contractor check-in (same pattern as visitors)
  const handleWorkerCheckIn = (worker: ContractorWorker) => {
    setSelectedWorkerForCheckIn(worker);
    setShowHostSelection(true);
  };

  // Handler for confirming host selection and proceeding with check-in
  const handleHostSelectionConfirm = () => {
    if (!selectedHostForWorker) {
      toast({
        title: "Error",
        description: "Please select a host",
        variant: "destructive",
      });
      return;
    }

    if (selectedWorkerForCheckIn) {
      checkInMutation.mutate({
        workerId: selectedWorkerForCheckIn.id,
        hostId: selectedHostForWorker
      });
    }
  };

  // Show ALL contractors, not just approved ones
  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(companySearchTerm.toLowerCase())
  );

  const filteredWorkers = workers.filter(worker =>
    worker.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateComplianceScore = (documentsStatus: any) => {
    if (!documentsStatus) return 0;
    const total = Object.keys(documentsStatus).length;
    const approved = Object.values(documentsStatus).filter(status => status === 'approved').length;
    return Math.round((approved / total) * 100);
  };

  // Handle different sections
  if (activeSection === "walkin") {
    return (
      <div className="min-h-screen bg-background">
        <WalkInContractorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  if (activeSection === "scan") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <h2 className="text-3xl font-bold text-slate-800 mb-4">QR Code Scanner</h2>
            <p className="text-slate-600">Scan contractor worker pass or pre-booking QR code</p>
          </GlassCard>
          
          <GlassCard className="p-8">
            <div className="text-center space-y-6">
              <div className="w-32 h-32 mx-auto border-4 border-dashed border-blue-400 rounded-xl flex items-center justify-center bg-blue-50">
                <QrCode className="text-blue-600" size={40} />
              </div>
              
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Scan QR code or enter code manually..."
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  className="w-full px-6 py-6 rounded-xl text-center font-mono text-xl"
                  data-testid="input-contractor-qr-code"
                  autoFocus
                />
                
                <div className="flex gap-4">
                  <Button
                    onClick={() => {/* Handle scan */}}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 h-14 text-lg"
                    data-testid="button-scan-contractor-qr"
                  >
                    <Scan className="mr-3" size={20} />
                    Scan
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => setActiveSection("main")}
                    className="px-8 h-14 text-lg"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  if (activeSection === "history") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <History className="h-10 w-10 text-slate-600" />
              <h1 className="text-3xl font-bold text-slate-800">Previous Contractor Visits</h1>
            </div>
            <p className="text-slate-600">View history and analytics of contractor activity</p>
          </GlassCard>

          <GlassCard className="p-8">
            <div className="text-center space-y-4">
              <p className="text-slate-600">Contractor visit history and analytics coming soon...</p>
              <Button
                variant="outline"
                onClick={() => setActiveSection("main")}
                className="text-slate-600"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Menu
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  if (activeSection === "checkin") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <HardHat className="h-10 w-10 text-orange-600" />
              <h1 className="text-3xl font-bold text-slate-800">Contractor Worker Check-In/Out</h1>
            </div>
            <p className="text-slate-600">Select registered contractor workers for check-in/out</p>
          </GlassCard>

          {/* Company Selection with Search */}
          <GlassCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="company-select" className="text-lg font-semibold text-slate-700">
                  Select Contractor Company ({companies.length} total)
                </Label>
                <Button
                  variant="outline"
                  onClick={() => setActiveSection("main")}
                  className="text-slate-600"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Menu
                </Button>
              </div>
              
              {/* Company Search */}
              <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <Input
                  value={companySearchTerm}
                  onChange={(e) => setCompanySearchTerm(e.target.value)}
                  placeholder="Search contractors by name..."
                  className="pl-10"
                  data-testid="input-company-search"
                />
              </div>
              
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a contractor company..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {filteredCompanies.map((company) => {
                    const getSafetyRatingColor = (rating: string) => {
                      if (rating.startsWith('A')) return 'bg-green-100 text-green-800';
                      if (rating.startsWith('B')) return 'bg-yellow-100 text-yellow-800';
                      if (rating.startsWith('C')) return 'bg-orange-100 text-orange-800';
                      if (rating.startsWith('D')) return 'bg-red-100 text-red-800';
                      if (rating === 'F') return 'bg-red-200 text-red-900';
                      return 'bg-gray-100 text-gray-800';
                    };
                    
                    return (
                      <SelectItem key={company.id} value={company.id}>
                        <div className="flex items-center gap-2 min-w-0">
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
                  {filteredCompanies.length === 0 && companySearchTerm && (
                    <div className="p-2 text-center text-gray-500">
                      No contractors found matching "{companySearchTerm}"
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {/* Worker Search */}
          {selectedCompany && (
            <GlassCard>
              <div className="space-y-4">
                <Label htmlFor="worker-search" className="text-lg font-semibold text-slate-700">
                  Search Workers
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="worker-search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or email..."
                    className="pl-10"
                    data-testid="input-worker-search"
                  />
                </div>
              </div>
            </GlassCard>
          )}

          {/* Workers List */}
          {selectedCompany && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWorkers.map((worker) => (
                <GlassCard key={worker.id} className="hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">
                        {worker.firstName} {worker.lastName}
                      </h3>
                      {worker.email && (
                        <div className="flex items-center gap-1 text-sm text-slate-600">
                          <Mail className="h-4 w-4" />
                          {worker.email}
                        </div>
                      )}
                      {worker.phone && (
                        <div className="flex items-center gap-1 text-sm text-slate-600">
                          <Phone className="h-4 w-4" />
                          {worker.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex gap-2">
                        {worker.rightToWork === 'valid' ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Right to Work
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Right to Work
                          </Badge>
                        )}
                        
                        {worker.cscsStatus === 'valid' ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            CSCS
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            CSCS
                          </Badge>
                        )}
                      </div>
                      
                      {/* Check-In/Out or Induction Button */}
                      {worker.isCheckedIn ? (
                        <Button
                          onClick={() => checkOutMutation.mutate(worker.id)}
                          disabled={checkOutMutation.isPending}
                          className="bg-red-600 hover:bg-red-700 text-white"
                          data-testid={`button-checkout-${worker.id}`}
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
                            onClick={() => {
                              const previewUrl = `/induction/preview?role=contractor&workerId=${worker.id}`;
                              window.open(previewUrl, '_blank', 'width=1200,height=800');
                            }}
                            variant="outline"
                            className="border-blue-500 text-blue-600 hover:bg-blue-50"
                            data-testid={`button-start-induction-${worker.id}`}
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
                          data-testid={`button-checkin-${worker.id}`}
                        >
                          <LogIn className="mr-2 h-4 w-4" />
                          Check In
                        </Button>
                      )}
                    </div>
                  </div>

                  {worker.isCheckedIn && worker.checkedInAt && (
                    <div className="text-sm text-slate-600 flex items-center gap-2">
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

  // Main kiosk menu
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <GlassCard className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <HardHat className="h-12 w-12 text-orange-600" />
            <h1 className="text-4xl font-bold text-slate-800">Contractor Management</h1>
          </div>
          <p className="text-slate-600 text-lg">Complete contractor check-in, registration, and booking system</p>
        </GlassCard>

        {/* Main Menu Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* QR Code Scanner */}
          <GlassCard 
            className="hover:scale-105 transition-transform cursor-pointer" 
            onClick={() => setActiveSection("scan")}
            data-testid="card-qr-scanner"
          >
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                <QrCode className="h-10 w-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Scan QR Code</h3>
              <p className="text-slate-600">Check out workers or check in pre-booked contractors</p>
            </div>
          </GlassCard>

          {/* Walk-in Registration */}
          <GlassCard 
            className="hover:scale-105 transition-transform cursor-pointer" 
            onClick={() => setActiveSection("walkin")}
            data-testid="card-walkin-registration"
          >
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <UserPlus className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Walk-in Contractor</h3>
              <p className="text-slate-600">Register new contractor with document upload for clearance</p>
            </div>
          </GlassCard>

          {/* Contractor Check-In */}
          <GlassCard 
            className="hover:scale-105 transition-transform cursor-pointer" 
            onClick={() => setActiveSection("checkin")}
            data-testid="card-contractor-checkin"
          >
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
                <UserCheck className="h-10 w-10 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Contractor Check-In</h3>
              <p className="text-slate-600">Check in/out registered contractor workers</p>
            </div>
          </GlassCard>

          {/* Pre-booking */}
          <GlassCard 
            className="hover:scale-105 transition-transform cursor-pointer" 
            onClick={() => setActiveSection("prebook")}
            data-testid="card-prebook-contractor"
          >
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                <CalendarPlus className="h-10 w-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Pre-Book Contractor</h3>
              <p className="text-slate-600">Schedule future contractor visits</p>
            </div>
          </GlassCard>

          {/* Previous Visits */}
          <GlassCard 
            className="hover:scale-105 transition-transform cursor-pointer col-span-full" 
            onClick={() => setActiveSection("history")}
            data-testid="card-contractor-history"
          >
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <History className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Previous Contractor Visits</h3>
              <p className="text-slate-600">View history and analytics of contractor activity</p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Contractor Pass Preview Modal */}
      {checkedInWorker && (
        <ContractorPassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setCheckedInWorker(null);
            setCheckedInCompanyName("");
          }}
          worker={checkedInWorker}
          companyName={checkedInCompanyName}
        />
      )}

      {/* Host Selection Dialog (same as visitor workflow) */}
      <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Who is {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName} visiting today?
            </p>
            <div className="space-y-2">
              <Label htmlFor="host-select" className="text-sm font-medium">
                Host Staff Member *
              </Label>
              <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                <SelectTrigger data-testid="select-contractor-host">
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} - {member.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setShowHostSelection(false)}
              data-testid="button-cancel-host-selection"
            >
              Cancel
            </Button>
            <Button
              onClick={handleHostSelectionConfirm}
              disabled={!selectedHostForWorker || checkInMutation.isPending}
              data-testid="button-confirm-host-selection"
            >
              {checkInMutation.isPending ? "Checking In..." : "Confirm Check-In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}