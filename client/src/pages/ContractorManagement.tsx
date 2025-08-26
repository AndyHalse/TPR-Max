import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import WalkInContractorForm from "@/components/WalkInContractorForm";
import { 
  HardHat, 
  Clock, 
  Building2, 
  Search,
  CheckCircle,
  AlertTriangle,
  LogIn,
  LogOut,
  Edit,
  Trash2,
  History,
  UserPlus,
  CalendarPlus
} from "lucide-react";

import type { ContractorCompany, ContractorWorker } from "@shared/schema";

export default function ContractorManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"previous" | "walkin" | "prebook" | "contractors">("previous");
  const [searchTerm, setSearchTerm] = useState("");
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);

  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: allWorkers = [], refetch: refetchWorkers } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all"],
    enabled: activeTab === "previous",
  });

  const generateTestWorkersMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/contractors/generate-test-workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to generate test workers");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Workers Generated",
        description: "Successfully created test workers for all contractor companies",
      });
      refetchWorkers();
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate test workers",
        variant: "destructive",
      });
    },
  });

  const handleGenerateTestWorkers = () => {
    generateTestWorkersMutation.mutate();
  };

  const checkInMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkin`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({
        title: "Success",
        description: "Contractor checked in successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check in contractor",
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
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({
        title: "Success",
        description: "Contractor checked out successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out contractor",
        variant: "destructive",
      });
    },
  });

  // Get previous contractors (workers with their company info)
  const previousContractors = allWorkers.map(worker => {
    const company = companies.find(c => c.id === worker.companyId);
    return {
      ...worker,
      companyName: company?.name || 'Unknown Company',
      companyStatus: company?.status || 'unknown',
      safetyRating: company?.complianceScore || 'N/A'
    };
  }).filter(contractor => 
    contractor.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSafetyRatingColor = (rating: string) => {
    if (rating.startsWith('A')) return 'bg-green-100 text-green-800';
    if (rating.startsWith('B')) return 'bg-yellow-100 text-yellow-800';
    if (rating.startsWith('C')) return 'bg-orange-100 text-orange-800';
    if (rating.startsWith('D')) return 'bg-red-100 text-red-800';
    if (rating === 'F') return 'bg-red-200 text-red-900';
    return 'bg-gray-100 text-gray-800';
  };

  if (showWalkInForm) {
    return <WalkInContractorForm onBack={() => setShowWalkInForm(false)} />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-orange-600" />
          <h1 className="text-3xl font-bold text-slate-800">Contractor Management</h1>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab("previous")}
            variant="outline"
            className="text-blue-600 border-blue-600 hover:bg-blue-50"
          >
            Show All Current Workers
          </Button>
          <Button
            onClick={() => setActiveTab("contractors")}
            variant="outline"
            className="text-purple-600 border-purple-600 hover:bg-purple-50"
          >
            Contractors
          </Button>
          <Button
            onClick={handleGenerateTestWorkers}
            variant="outline"
            className="text-orange-600 border-orange-600 hover:bg-orange-50"
          >
            Generate Test Workers
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4">
        <Button
          variant={activeTab === "previous" ? "default" : "outline"}
          onClick={() => setActiveTab("previous")}
          className="flex items-center gap-2"
          data-testid="tab-previous-contractors"
        >
          <History className="h-4 w-4" />
          Previous Contractors
        </Button>
        <Button
          variant={activeTab === "contractors" ? "default" : "outline"}
          onClick={() => setActiveTab("contractors")}
          className="flex items-center gap-2"
          data-testid="tab-contractors"
        >
          <Building2 className="h-4 w-4" />
          Contractors
        </Button>
        <Button
          variant={activeTab === "walkin" ? "default" : "outline"}
          onClick={() => setActiveTab("walkin")}
          className="flex items-center gap-2"
          data-testid="tab-walkin-registration"
        >
          <UserPlus className="h-4 w-4" />
          Walk-in Registration
        </Button>
        <Button
          variant={activeTab === "prebook" ? "default" : "outline"}
          onClick={() => setActiveTab("prebook")}
          className="flex items-center gap-2"
          data-testid="tab-pre-booking"
        >
          <CalendarPlus className="h-4 w-4" />
          Pre-booking
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "previous" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-600" />
                <h2 className="text-xl font-semibold text-slate-800">Previous Contractors</h2>
                <span className="text-sm text-slate-500">
                  Select a contractor who has been onsite before
                </span>
              </div>
              <Button
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
                onClick={() => {/* Remove duplicates */}}
              >
                Remove Duplicates
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by contractor name or company..."
                className="pl-10"
                data-testid="input-search-contractors"
              />
            </div>

            {/* Show All Button */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-slate-600">
                Showing {showAllWorkers ? previousContractors.length : Math.min(6, previousContractors.length)} of {previousContractors.length} contractors
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <Button 
                variant="outline" 
                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                onClick={() => setShowAllWorkers(!showAllWorkers)}
              >
                {showAllWorkers ? 'Show Less' : `Show All ${allWorkers.length} Current Workers`}
              </Button>
            </div>

            {/* Contractors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {previousContractors.slice(0, showAllWorkers ? previousContractors.length : 6).map((contractor) => (
                <GlassCard key={contractor.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    {/* Contractor Info */}
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {contractor.firstName} {contractor.lastName}
                      </h3>
                      <p className="text-sm text-slate-600 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {contractor.companyName}
                      </p>
                      <p className="text-xs text-slate-500">
                        Last visit: {contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        className={contractor.isCheckedIn ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {contractor.isCheckedIn ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Checked In
                          </>
                        ) : (
                          "Available"
                        )}
                      </Badge>
                      
                      {contractor.rightToWork === 'valid' ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Work Auth
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Work Auth
                        </Badge>
                      )}

                      <Badge className={getSafetyRatingColor(contractor.safetyRating)}>
                        {contractor.safetyRating}
                      </Badge>
                      
                      {/* Card Status Badges */}
                      {contractor.hasRedCard && (
                        <Badge className="bg-red-200 text-red-900">
                          Red Card
                        </Badge>
                      )}
                      {contractor.hasYellowCard && (
                        <Badge className="bg-yellow-200 text-yellow-900">
                          Yellow Card
                        </Badge>
                      )}
                      {(!contractor.hasRedCard && !contractor.hasYellowCard) && (
                        <Badge className="bg-green-200 text-green-900">
                          Clear
                        </Badge>
                      )}
                    </div>

                    {/* Check-in Time */}
                    {contractor.isCheckedIn && contractor.checkedInAt && (
                      <div className="text-xs text-slate-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(contractor.checkedInAt).toLocaleTimeString()}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (contractor.isCheckedIn) {
                            checkOutMutation.mutate(contractor.id);
                          } else {
                            checkInMutation.mutate(contractor.id);
                          }
                        }}
                        disabled={checkInMutation.isPending || checkOutMutation.isPending}
                        className={`flex-1 ${
                          contractor.isCheckedIn
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-green-600 hover:bg-green-700"
                        } text-white`}
                        data-testid={`button-${contractor.isCheckedIn ? 'checkout' : 'checkin'}-${contractor.id}`}
                      >
                        {contractor.isCheckedIn ? (
                          <>
                            <LogOut className="mr-1 h-3 w-3" />
                            Check Out
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-1 h-3 w-3" />
                            Check In
                          </>
                        )}
                      </Button>
                      
                      <Button size="sm" variant="outline" className="text-blue-600">
                        <Edit className="h-3 w-3" />
                      </Button>
                      
                      <Button size="sm" variant="outline" className="text-red-600">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>

            {previousContractors.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {searchTerm ? `No contractors found matching "${searchTerm}"` : "No previous contractors found"}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "walkin" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-800">Walk-in Registration</h2>
              <span className="text-sm text-slate-500">
                Register new contractor with document upload for clearance
              </span>
            </div>
            
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">Register a new contractor who is visiting for the first time</p>
              <Button
                onClick={() => setShowWalkInForm(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-start-walkin-registration"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Start Walk-in Registration
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === "contractors" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-slate-800">Contractor Companies</h2>
                <span className="text-sm text-slate-500">
                  Manage all contractor companies and their details
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by company name..."
                className="pl-10"
                data-testid="input-search-companies"
              />
            </div>

            {/* Show All Button */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-slate-600">
                Showing {showAllCompanies ? companies.filter(company => 
                  company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  company.contactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
                ).length : Math.min(6, companies.filter(company => 
                  company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  company.contactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
                ).length)} of {companies.filter(company => 
                  company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  company.contactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
                ).length} contractor companies
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <Button 
                variant="outline" 
                className="text-purple-600 border-purple-600 hover:bg-purple-50"
                onClick={() => setShowAllCompanies(!showAllCompanies)}
              >
                {showAllCompanies ? 'Show Less' : `Show All ${companies.length} Contractor Companies`}
              </Button>
            </div>

            {/* Companies Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.filter(company => 
                company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                company.contactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
              ).slice(0, showAllCompanies ? companies.length : 6).map((company) => (
                <GlassCard key={company.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    {/* Company Info */}
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {company.name}
                      </h3>
                      <p className="text-sm text-slate-600">{company.contactEmail}</p>
                      <p className="text-sm text-slate-600">{company.contactPhone}</p>
                      <p className="text-xs text-slate-500">
                        Workers: {company.workersCount || 0}
                      </p>
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        className={company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      >
                        {company.status || 'pending'}
                      </Badge>
                      
                      <Badge className={getSafetyRatingColor(company.complianceScore || 'N/A')}>
                        {company.complianceScore || 'N/A'}
                      </Badge>
                      
                      <Badge className="bg-blue-100 text-blue-800">
                        {company.serviceType || 'General'}
                      </Badge>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {/* View company details */}}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        data-testid={`button-view-company-${company.id}`}
                      >
                        View Details
                      </Button>
                      
                      <Button size="sm" variant="outline" className="text-blue-600">
                        <Edit className="h-3 w-3" />
                      </Button>
                      
                      <Button size="sm" variant="outline" className="text-red-600">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>

            {companies.filter(company => 
              company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              company.contactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
            ).length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {searchTerm ? `No contractor companies found matching "${searchTerm}"` : "No contractor companies found"}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "prebook" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-slate-800">Pre-booking</h2>
              <span className="text-sm text-slate-500">
                Schedule future contractor visits
              </span>
            </div>
            
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">Schedule a contractor visit for a future date</p>
              <Button
                onClick={() => {/* Handle pre-booking */}}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="button-start-prebooking"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Create Pre-booking
              </Button>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}