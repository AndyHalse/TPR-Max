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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  LogOut
} from "lucide-react";

interface ContractorWorker {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  rightToWork: string;
  cscsCard: string;
  cscsStatus: string;
  ipafStatus: string;
  asbestosAwareness: boolean;
  manualHandling: boolean;
  inductionCompleted: boolean;
  isActive: boolean;
  isCheckedIn?: boolean;
  checkedInAt?: Date;
  checkedOutAt?: Date;
  qrCode?: string;
}

interface ContractorCompany {
  id: string;
  name: string;
  status: string;
  complianceScore: string;
  workers?: ContractorWorker[];
}

export default function ContractorKiosk() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<ContractorWorker | null>(null);
  const [showPassModal, setShowPassModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  // Fetch contractor companies
  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
    refetchInterval: 10000,
  });

  // Fetch workers for selected company
  const { data: workers = [] } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors", selectedCompany, "workers"],
    enabled: !!selectedCompany,
    refetchInterval: 10000,
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkin`);
      return await response.json();
    },
    onSuccess: (data) => {
      setSelectedWorker(data.worker);
      setShowPassModal(true);
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({
        title: "Check-in Successful",
        description: `${data.worker.firstName} ${data.worker.lastName} has been checked in.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Check-in Failed",
        description: error.message || "Failed to check in contractor",
        variant: "destructive",
      });
    },
  });

  // Check-out mutation
  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({
        title: "Check-out Successful",
        description: `${data.worker.firstName} ${data.worker.lastName} has been checked out.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Check-out Failed",
        description: error.message || "Failed to check out contractor",
        variant: "destructive",
      });
    },
  });

  // Calculate dynamic compliance score from documents status
  const calculateComplianceScore = (documentsStatus: any) => {
    if (!documentsStatus) return 0;
    const documents = Object.values(documentsStatus);
    const validDocs = documents.filter((status: any) => status === 'valid').length;
    const totalDocs = documents.length;
    return totalDocs > 0 ? Math.round((validDocs / totalDocs) * 100) : 0;
  };

  const approvedCompanies = companies.filter(company => company.status === 'approved');
  const filteredWorkers = workers.filter(worker =>
    worker.isActive &&
    worker.inductionCompleted &&
    (worker.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     worker.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     worker.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getWorkerStatusColor = (worker: ContractorWorker) => {
    if (!worker.isActive || !worker.inductionCompleted) return "bg-red-100 text-red-800";
    if (worker.rightToWork !== 'valid' || worker.cscsStatus === 'expired') return "bg-red-100 text-red-800";
    if (worker.cscsStatus === 'expiring') return "bg-yellow-100 text-yellow-800";
    return "bg-green-100 text-green-800";
  };

  const canWorkerCheckIn = (worker: ContractorWorker) => {
    return worker.isActive && 
           worker.inductionCompleted && 
           worker.rightToWork === 'valid' &&
           worker.cscsStatus !== 'expired';
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <GlassCard className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <HardHat className="h-10 w-10 text-orange-600" />
            <h1 className="text-3xl font-bold text-slate-800">Contractor Check-In/Out</h1>
          </div>
          <p className="text-slate-600">Check in and out contractor workers</p>
        </GlassCard>

        {/* Company Selection */}
        <GlassCard>
          <div className="space-y-4">
            <Label htmlFor="company-select" className="text-lg font-semibold text-slate-700">
              Select Contractor Company
            </Label>
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a contractor company..." />
              </SelectTrigger>
              <SelectContent>
                {approvedCompanies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {company.name}
                      <Badge className="bg-green-100 text-green-800">
                        {calculateComplianceScore((company as any).documentsStatus)}% Compliant
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
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
              <GlassCard key={worker.id}>
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">
                        {worker.firstName} {worker.lastName}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                        <Mail className="h-4 w-4" />
                        {worker.email}
                      </div>
                      {worker.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                          <Phone className="h-4 w-4" />
                          {worker.phone}
                        </div>
                      )}
                    </div>
                    <Badge className={getWorkerStatusColor(worker)}>
                      {canWorkerCheckIn(worker) ? 'Cleared' : 'Not Cleared'}
                    </Badge>
                  </div>

                  {/* Certifications */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={
                        worker.rightToWork === 'valid' ? 'border-green-500 text-green-700' : 'border-red-500 text-red-700'
                      }>
                        Right to Work: {worker.rightToWork}
                      </Badge>
                      <Badge variant="outline" className={
                        worker.cscsStatus === 'valid' ? 'border-green-500 text-green-700' :
                        worker.cscsStatus === 'expiring' ? 'border-yellow-500 text-yellow-700' : 'border-red-500 text-red-700'
                      }>
                        CSCS: {worker.cscsStatus}
                      </Badge>
                      {worker.inductionCompleted ? (
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Induction Complete
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500 text-red-700">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Induction Required
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {worker.isCheckedIn ? (
                      <Button
                        onClick={() => checkOutMutation.mutate(worker.id)}
                        disabled={checkOutMutation.isPending}
                        className="flex-1 bg-red-600 hover:bg-red-700"
                        data-testid={`button-checkout-${worker.id}`}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Check Out
                      </Button>
                    ) : (
                      <Button
                        onClick={() => checkInMutation.mutate(worker.id)}
                        disabled={!canWorkerCheckIn(worker) || checkInMutation.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        data-testid={`button-checkin-${worker.id}`}
                      >
                        <LogIn className="mr-2 h-4 w-4" />
                        Check In
                      </Button>
                    )}
                  </div>

                  {worker.isCheckedIn && worker.checkedInAt && (
                    <div className="text-sm text-slate-600 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Checked in at {new Date(worker.checkedInAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* No workers message */}
        {selectedCompany && filteredWorkers.length === 0 && (
          <GlassCard className="text-center">
            <div className="py-8">
              <UserCheck className="h-12 w-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Workers Found</h3>
              <p className="text-slate-600">
                {searchTerm 
                  ? "No workers match your search criteria."
                  : "No workers are available for check-in from this contractor."}
              </p>
            </div>
          </GlassCard>
        )}

        {/* Contractor Pass Modal */}
        <Dialog open={showPassModal} onOpenChange={setShowPassModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-center">Contractor Pass Ready</DialogTitle>
            </DialogHeader>
            {selectedWorker && (
              <div className="space-y-4">
                {/* Pass Preview */}
                <div 
                  id="contractor-pass-print"
                  className="bg-white border-2 border-gray-800 rounded-lg p-4"
                  style={{ width: '95mm', minHeight: '66mm' }}
                >
                  {/* Pass Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-gray-800">ACS Safety & Security Ltd</div>
                      <div className="text-xs text-gray-600">Visitor Management</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <HardHat className="h-4 w-4 text-orange-600" />
                        <span className="text-xs font-bold text-orange-700">CONTRACTOR</span>
                      </div>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900 mb-1">
                        {selectedWorker.firstName} {selectedWorker.lastName}
                      </div>
                      <div className="text-xs text-gray-700 mb-1">
                        {companies.find(c => c.id === selectedCompany)?.name}
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {selectedWorker.email}
                      </div>
                      
                      {/* Certifications */}
                      <div className="space-y-1">
                        <div className="text-xs text-green-700">
                          ✓ Right to Work: {selectedWorker.rightToWork}
                        </div>
                        <div className="text-xs text-green-700">
                          ✓ CSCS: {selectedWorker.cscsStatus}
                        </div>
                        <div className="text-xs text-green-700">
                          ✓ Induction Complete
                        </div>
                      </div>
                    </div>

                    {/* QR Code */}
                    <div className="w-16 h-16">
                      {selectedWorker.qrCode && (
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(selectedWorker.qrCode)}`}
                          alt="QR Code"
                          className="w-full h-full border border-gray-300 rounded"
                        />
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 pt-2 border-t border-gray-300">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Check-in: {new Date(selectedWorker.checkedInAt || new Date()).toLocaleDateString()}</span>
                      <span>Pass ID: {selectedWorker.id.slice(-8)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      // Print functionality
                      const printContent = document.getElementById('contractor-pass-print');
                      if (printContent) {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>Contractor Pass - ${selectedWorker.firstName} ${selectedWorker.lastName}</title>
                                <style>
                                  @page { size: 95mm 66mm; margin: 0; }
                                  body { margin: 0; padding: 8px; font-family: Arial, sans-serif; }
                                  .pass-container { width: 95mm; height: 66mm; border: 2px solid #000; padding: 4mm; box-sizing: border-box; }
                                </style>
                              </head>
                              <body>
                                <div class="pass-container">${printContent.innerHTML}</div>
                              </body>
                            </html>
                          `);
                          printWindow.document.close();
                          printWindow.print();
                        }
                      }
                      setShowPassModal(false);
                    }}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    <HardHat className="h-4 w-4 mr-2" />
                    Print Contractor Pass
                  </Button>
                  <Button variant="outline" onClick={() => setShowPassModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}