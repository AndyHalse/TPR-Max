import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PassPreviewModal from "@/components/PassPreviewModal";
import { VisitorEditModal } from "@/components/VisitorEditModal";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  UserPlus, 
  CalendarPlus, 
  Calendar as CalendarIcon, 
  Clock,
  CheckCircle,
  Send,
  Building2,
  Mail,
  Search,
  UserCheck,
  UserX,
  History,
  Edit
} from "lucide-react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format, addDays } from "date-fns";
import type { Staff, PreBooking, InsertPreBooking, Visitor, InsertVisitor } from "@shared/schema";
import { cn } from "@/lib/utils";

// Company Combobox Component
interface CompanyComboboxProps {
  value: string;
  onChange: (value: string) => void;
  companies: string[];
  placeholder?: string;
  className?: string;
  testId?: string;
}

function CompanyCombobox({ value, onChange, companies, placeholder = "Select or type company...", className, testId }: CompanyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  // Update inputValue when value prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setInputValue(selectedValue);
    setOpen(false);
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);
    // Show suggestions after 2+ characters with a small delay to avoid interference
    if (newValue.length >= 2) {
      setTimeout(() => {
        // Only open if the input value hasn't changed (user stopped typing)
        if (inputValue === newValue) {
          setOpen(true);
        }
      }, 300); // 300ms delay to avoid interference while typing
    } else {
      setOpen(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && inputValue.trim()) {
      event.preventDefault();
      onChange(inputValue.trim());
      setOpen(false);
    }
  };

  const handleBlur = () => {
    // Small delay to allow for item selection
    setTimeout(() => setOpen(false), 150);
  };

  // Smart filtering: prioritize matches at the beginning, then anywhere
  const filteredCompanies = companies
    .filter(company => company.toLowerCase().includes(inputValue.toLowerCase()))
    .sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const searchLower = inputValue.toLowerCase();
      
      // Exact matches first
      if (aLower === searchLower) return -1;
      if (bLower === searchLower) return 1;
      
      // Starts with search term
      const aStarts = aLower.startsWith(searchLower);
      const bStarts = bLower.startsWith(searchLower);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      
      // Alphabetical for same type of match
      return a.localeCompare(b);
    })
    .slice(0, 6); // Show top 6 matches

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        className={cn("w-full pr-8", className)}
        data-testid={testId}
        onFocus={() => {
          // Don't auto-open dropdown on focus - let user type first
          // This prevents the annoying flash of all companies
        }}
        onBlur={(e) => {
          // Don't close if user is clicking on a dropdown item
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (!relatedTarget || !relatedTarget.closest('[data-radix-popper-content-wrapper]')) {
            handleBlur();
          }
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
        onClick={() => {
          // Always allow user to toggle dropdown when they click the arrow
          setOpen(!open);
        }}
      >
        <ChevronsUpDown className="h-4 w-4 text-gray-400" />
      </Button>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="absolute inset-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent 
          className="w-full p-2 shadow-lg border border-slate-200" 
          align="start" 
          style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '320px' }}
        >
        <Command>
          <CommandList className="max-h-64 overflow-auto">
            {/* Show existing companies */}
            {filteredCompanies.length > 0 && (
              <CommandGroup>
                <div className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Existing Companies
                </div>
                {filteredCompanies.map((company) => (
                  <CommandItem
                    key={company}
                    value={company}
                    onSelect={() => handleSelect(company)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer rounded-md mx-2"
                  >
                    <div className="flex-shrink-0">
                      <Check
                        className={cn(
                          "h-4 w-4 text-blue-600",
                          value === company ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </div>
                    <span className="text-slate-700 truncate">{company}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            {/* Add new company option */}
            {inputValue.trim() && !companies.find(c => c.toLowerCase() === inputValue.trim().toLowerCase()) && (
              <CommandGroup>
                {filteredCompanies.length > 0 && <div className="border-t border-slate-200 my-1" />}
                <div className="px-2 py-1.5 text-xs font-medium text-green-600 uppercase tracking-wide">
                  Add New
                </div>
                <CommandItem
                  value={inputValue}
                  onSelect={() => handleSelect(inputValue.trim())}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 cursor-pointer rounded-md mx-2 bg-green-25"
                >
                  <div className="flex-shrink-0 w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm font-bold">+</span>
                  </div>
                  <span className="text-green-700 font-medium truncate">
                    Create "{inputValue.trim()}"
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            
            {/* Empty state - only show when user has typed but no matches */}
            {filteredCompanies.length === 0 && inputValue.trim() && (
              <div className="px-4 py-6 text-center text-slate-500">
                <div className="text-sm mb-1">No existing companies found</div>
                <div className="text-xs text-slate-400">Press Enter to add "{inputValue.trim()}" as new company</div>
              </div>
            )}
          </CommandList>
        </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function Visitors() {
  const { toast } = useToast();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("existing");
  
  // Pre-booking form state
  const [preBookingData, setPreBookingData] = useState<Partial<InsertPreBooking>>({
    visitDate: addDays(new Date(), 1),
  });
  const [selectedDate, setSelectedDate] = useState<Date>(addDays(new Date(), 1));
  
  // Walk-in visitor form state
  const [walkInData, setWalkInData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    mobileNumber: "",
    jobTitle: "",
    address: "",
    company: "",
    hostStaffId: "",
    purpose: "",
    carRegistration: "",
  });
  
  // Search state for existing visitors
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllPreviousVisitors, setShowAllPreviousVisitors] = useState(false);
  
  // Previous visitor check-in state
  const [selectedPreviousVisitor, setSelectedPreviousVisitor] = useState<Visitor | null>(null);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostForPrevious, setSelectedHostForPrevious] = useState("");
  
  // Edit visitor state
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Duplicate check-in dialog state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [checkedInVisitor, setCheckedInVisitor] = useState<Visitor | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);

  // Test data generation mutation
  const generateTestDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/test-data/visitors");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      toast({
        title: "Success!",
        description: `Generated ${data.visitors?.length || 30} test visitors for load testing`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate test data",
        variant: "destructive",
      });
    },
  });

  // Queries
  const { data: staff, isLoading: isLoadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: preBookings } = useQuery<PreBooking[]>({
    queryKey: ["/api/prebookings"],
  });

  const { data: upcomingBookings } = useQuery<PreBooking[]>({
    queryKey: ["/api/prebookings/upcoming"],
  });

  const { data: allVisitors } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors"],
  });

  const { data: companies = [] } = useQuery<string[]>({
    queryKey: ["/api/companies"],
  });

  // Filter existing visitors based on search
  const filteredVisitors = allVisitors?.filter(visitor => 
    `${visitor.firstName} ${visitor.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    visitor.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    visitor.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (visitor.company && visitor.company.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  // Visitor checkout mutation
  const checkoutVisitorMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      const response = await apiRequest("POST", `/api/visitors/${visitorId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Visitor checked out successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out visitor",
        variant: "destructive",
      });
    },
  });

  // Mutations
  const createPreBookingMutation = useMutation({
    mutationFn: async (data: InsertPreBooking) => {
      const response = await apiRequest("POST", "/api/prebookings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      toast({
        title: "Success",
        description: "Pre-booking created and confirmation emails sent!",
      });
      setPreBookingData({ 
        visitDate: addDays(new Date(), 1),
        visitorFirstName: "",
        visitorLastName: "",
        visitorEmail: "",
        company: "",
        hostStaffId: "",
        purpose: ""
      });
      setSelectedDate(addDays(new Date(), 1));
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create pre-booking",
        variant: "destructive",
      });
    },
  });

  const checkInWalkInMutation = useMutation({
    mutationFn: async (visitor: InsertVisitor) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: Visitor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      // Show visitor pass preview (same as previous visitors)
      setCheckedInVisitor(visitor);
      setShowPassPreview(true);
      
      // Clear the form after successful check-in
      setWalkInData({
        firstName: "",
        lastName: "",
        email: "",
        phoneNumber: "",
        mobileNumber: "",
        jobTitle: "",
        address: "",
        company: "",
        hostStaffId: "",
        purpose: "",
        carRegistration: "",
      });
      
      toast({
        title: "Success",
        description: "Visitor checked in successfully!",
      });
    },
    onError: (error: any) => {
      if (error?.message?.includes("Visitor already checked in")) {
        setDuplicateMessage(error.details || "This visitor is already checked in and on-site.");
        setShowDuplicateDialog(true);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to check in visitor",
        variant: "destructive",
      });
    },
  });

  // Cleanup duplicates mutation
  const cleanupDuplicatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/test-data/visitors/duplicates");
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      toast({
        title: "Success",
        description: `Removed ${result.duplicatesRemoved} duplicate visitors. ${result.uniqueVisitorsRemaining} unique visitors remaining.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clean up duplicate visitors",
        variant: "destructive",
      });
    },
  });

  const checkInPreviousVisitorMutation = useMutation({
    mutationFn: async (visitor: InsertVisitor) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: Visitor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setCheckedInVisitor(visitor);
      setShowPassPreview(true);
      setShowHostSelection(false);
      setSelectedPreviousVisitor(null);
      setSelectedHostForPrevious("");
      toast({
        title: "Success",
        description: "Previous visitor checked in successfully!",
      });
    },
    onError: (error: any) => {
      console.log("🔥 Previous Visitor Check-in Error:", error);
      console.log("🔥 Error message:", error?.message);
      console.log("🔥 Contains check:", error?.message?.includes("Visitor already checked in"));
      
      if (error?.message?.includes("Visitor already checked in")) {
        console.log("✅ Duplicate detected - showing dialog");
        setDuplicateMessage(error.details || "This visitor is already checked in and on-site.");
        setShowDuplicateDialog(true);
        setShowHostSelection(false);
        setSelectedPreviousVisitor(null);
        setSelectedHostForPrevious("");
        return;
      }
      console.log("❌ Not a duplicate error - showing generic error");
      toast({
        title: "Error",
        description: "Failed to check in visitor",
        variant: "destructive",
      });
    },
  });

  const manualCheckInMutation = useMutation({
    mutationFn: async (preBookingId: string) => {
      const response = await apiRequest("POST", "/api/prebookings/manual-checkin", { preBookingId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Visitor checked in manually!",
      });
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to check in visitor",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const handlePreBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!preBookingData.visitorFirstName || !preBookingData.visitorLastName || !preBookingData.visitorEmail || !preBookingData.hostStaffId || !preBookingData.visitDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (First Name, Last Name, Email, Host, Visit Date)",
        variant: "destructive",
      });
      return;
    }

    createPreBookingMutation.mutate(preBookingData as InsertPreBooking);
  };

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!walkInData.firstName.trim()) {
      toast({
        title: "Error",
        description: "First name is required",
        variant: "destructive",
      });
      return;
    }

    if (!walkInData.lastName.trim()) {
      toast({
        title: "Error",
        description: "Last name is required",
        variant: "destructive",
      });
      return;
    }

    if (!walkInData.hostStaffId) {
      toast({
        title: "Error",
        description: "Please select a host",
        variant: "destructive",
      });
      return;
    }
    
    checkInWalkInMutation.mutate({
      firstName: walkInData.firstName.trim(),
      lastName: walkInData.lastName.trim(),
      email: walkInData.email.trim() || null,
      phoneNumber: walkInData.phoneNumber.trim() || null,
      mobileNumber: walkInData.mobileNumber.trim() || null,
      jobTitle: walkInData.jobTitle.trim() || null,
      address: walkInData.address.trim() || null,
      company: walkInData.company.trim() || null,
      hostStaffId: walkInData.hostStaffId,
      purpose: walkInData.purpose.trim() || null,
      carRegistration: walkInData.carRegistration.trim() || null,
    });
  };

  const handlePreviousVisitorSelect = (visitor: Visitor) => {
    setSelectedPreviousVisitor(visitor);
    setShowHostSelection(true);
  };

  const handleEditVisitor = (visitor: Visitor) => {
    setEditingVisitor(visitor);
    setShowEditModal(true);
  };

  const handleHostSelectionConfirm = () => {
    if (!selectedHostForPrevious) {
      toast({
        title: "Error",
        description: "Please select a host",
        variant: "destructive",
      });
      return;
    }

    if (selectedPreviousVisitor) {
      checkInPreviousVisitorMutation.mutate({
        firstName: selectedPreviousVisitor.firstName,
        lastName: selectedPreviousVisitor.lastName,
        company: selectedPreviousVisitor.company,
        hostStaffId: selectedHostForPrevious,
        purpose: selectedPreviousVisitor.purpose,
        carRegistration: selectedPreviousVisitor.carRegistration,
      });
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const dateWithTime = new Date(date);
      dateWithTime.setHours(9, 0, 0, 0);
      setSelectedDate(date);
      setPreBookingData(prev => ({ ...prev, visitDate: dateWithTime }));
    }
  };

  const handleTimeChange = (time: string) => {
    if (selectedDate) {
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      setPreBookingData(prev => ({ ...prev, visitDate: newDate }));
    }
  };

  const formatBookingDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (booking: PreBooking) => {
    if (booking.isCheckedIn) return "bg-green-100 text-green-800";
    if (new Date(booking.visitDate) < new Date()) return "bg-red-100 text-red-800";
    return "bg-blue-100 text-blue-800";
  };

  const getStatusText = (booking: PreBooking) => {
    if (booking.isCheckedIn) return "Checked In";
    if (new Date(booking.visitDate) < new Date()) return "Expired";
    return "Pending";
  };

  if (isLoadingStaff) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800">Visitor Management</h1>
        <Button
          onClick={() => generateTestDataMutation.mutate()}
          disabled={generateTestDataMutation.isPending}
          variant="outline"
          size="sm"
          className="bg-orange-100 hover:bg-orange-200 text-orange-800 border-orange-300"
          data-testid="button-generate-test-data"
        >
          {generateTestDataMutation.isPending ? "Generating..." : "Generate 30 Test Visitors"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-white/50 backdrop-blur-sm rounded-xl p-2">
          <TabsTrigger 
            value="existing" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <History size={18} />
            Previous Visitors
          </TabsTrigger>
          <TabsTrigger 
            value="walkin" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <UserPlus size={18} />
            Walk-in Registration
          </TabsTrigger>
          <TabsTrigger 
            value="prebook" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <CalendarPlus size={18} />
            Pre-booking
          </TabsTrigger>
        </TabsList>

        {/* Existing Visitors Tab */}
        <TabsContent value="existing" className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <History className="text-blue-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">Previous Visitors</h2>
                  <p className="text-slate-600">Select a visitor who has been onsite before</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cleanupDuplicatesMutation.mutate()}
                disabled={cleanupDuplicatesMutation.isPending}
                data-testid="button-cleanup-duplicates"
                className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50"
              >
                {cleanupDuplicatesMutation.isPending ? "Cleaning..." : "Remove Duplicates"}
              </Button>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-3 text-slate-400" size={20} />
              <Input
                placeholder="Search by visitor name or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 py-3 text-lg"
                data-testid="input-search-visitors"
              />
            </div>

            {/* Show All Button */}
            {filteredVisitors.length > 24 && !showAllPreviousVisitors && (
              <div className="mb-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => setShowAllPreviousVisitors(true)}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                  data-testid="button-show-all-visitors"
                >
                  Show All {filteredVisitors.length} Previous Visitors
                </Button>
              </div>
            )}

            {/* Visitors List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVisitors.length > 0 ? (
                (showAllPreviousVisitors ? filteredVisitors : filteredVisitors.slice(0, 24)).map((visitor) => (
                  <div
                    key={visitor.id}
                    className="p-4 bg-white/60 rounded-xl border border-white/30 hover:bg-white/80 transition-all"
                    data-testid={`card-visitor-${visitor.id}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-800">{visitor.firstName} {visitor.lastName}</h3>
                          {visitor.company && (
                            <p className="text-sm text-slate-600">{visitor.company}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">
                            Last visit: {new Date(visitor.checkedInAt).toLocaleDateString('en-GB', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Check-in status like staff */}
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              visitor.isCheckedIn 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100 text-gray-600'
                            }`} data-testid={`visitor-checkin-status-${visitor.id}`}>
                              {visitor.isCheckedIn ? (
                                <>
                                  <UserCheck size={12} className="mr-1" />
                                  Checked In
                                </>
                              ) : (
                                <>
                                  <UserX size={12} className="mr-1" />
                                  Checked Out
                                </>
                              )}
                            </span>
                            {visitor.isCheckedIn && visitor.checkedInAt && (
                              <span className="text-xs text-gray-500 flex items-center">
                                <Clock size={10} className="mr-1" />
                                {new Date(visitor.checkedInAt).toLocaleTimeString([], { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleEditVisitor(visitor)}
                            data-testid={`button-edit-visitor-${visitor.id}`}
                            className="p-2"
                            title="Edit visitor details"
                          >
                            <Edit size={14} />
                          </Button>
                          {visitor.isCheckedIn ? (
                            <button
                              onClick={() => checkoutVisitorMutation.mutate(visitor.id)}
                              disabled={checkoutVisitorMutation.isPending}
                              className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                              data-testid={`button-checkout-visitor-${visitor.id}`}
                              title="Check out visitor"
                            >
                              <UserX size={16} />
                            </button>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handlePreviousVisitorSelect(visitor)}
                              data-testid={`button-select-visitor-${visitor.id}`}
                              title="Check in visitor"
                            >
                              <UserCheck size={16} className="mr-1" />
                              Check In
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-slate-500">
                  {searchTerm ? "No visitors found matching your search." : "No previous visitors found."}
                </div>
              )}
            </div>

            {/* Show Less Button */}
            {filteredVisitors.length > 24 && showAllPreviousVisitors && (
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => setShowAllPreviousVisitors(false)}
                  className="bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300"
                  data-testid="button-show-less-visitors"
                >
                  Show Regular View (24 Visitors)
                </Button>
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* Walk-in Registration Tab */}
        <TabsContent value="walkin" className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserPlus className="text-green-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Walk-in Registration</h2>
                <p className="text-slate-600">Register a new visitor who just turned up</p>
              </div>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-6">
              {/* Required Fields */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Required Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                      Visitor First Name *
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={walkInData.firstName}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      required
                      data-testid="input-walkin-firstname"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                      Visitor Last Name *
                    </Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={walkInData.lastName}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      required
                      data-testid="input-walkin-lastname"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-required" className="text-sm font-medium text-slate-700">
                      Company *
                    </Label>
                    <CompanyCombobox
                      value={walkInData.company}
                      onChange={(value) => setWalkInData(prev => ({ ...prev, company: value }))}
                      companies={companies}
                      placeholder="Select or type company name..."
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      testId="input-walkin-company"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email-required" className="text-sm font-medium text-slate-700">
                      Email Address *
                    </Label>
                    <Input
                      id="email-required"
                      type="email"
                      value={walkInData.email}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      required
                      data-testid="input-walkin-email"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Visitor Profile */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Additional Information (Optional)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-sm font-medium text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={walkInData.phoneNumber}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      data-testid="input-walkin-phone"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="mobileNumber" className="text-sm font-medium text-slate-700">
                      Mobile Number
                    </Label>
                    <Input
                      id="mobileNumber"
                      type="tel"
                      value={walkInData.mobileNumber}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, mobileNumber: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      data-testid="input-walkin-mobile"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle" className="text-sm font-medium text-slate-700">
                      Job Title
                    </Label>
                    <Input
                      id="jobTitle"
                      type="text"
                      value={walkInData.jobTitle}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, jobTitle: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                      data-testid="input-walkin-jobtitle"
                    />
                  </div>
                  
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-slate-700">
                    Address
                  </Label>
                  <Textarea
                    id="address"
                    value={walkInData.address}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800 min-h-[80px]"
                    placeholder="Enter full address (street, city, postcode)"
                    data-testid="input-walkin-address"
                  />
                </div>
              </div>

              {/* Host Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Visit Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="hostStaffId" className="text-sm font-medium text-slate-700">
                    Host Staff Member *
                  </Label>
                  <Select 
                    value={walkInData.hostStaffId} 
                    onValueChange={(value) => setWalkInData(prev => ({ ...prev, hostStaffId: value }))}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50">
                      <SelectValue placeholder="Select host staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.firstName} {member.lastName} - {member.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purpose" className="text-sm font-medium text-slate-700">
                    Purpose of Visit
                  </Label>
                  <Input
                    id="purpose"
                    type="text"
                    value={walkInData.purpose}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, purpose: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                    data-testid="input-walkin-purpose"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="carRegistration" className="text-sm font-medium text-slate-700">
                    Car Registration
                  </Label>
                  <Input
                    id="carRegistration"
                    type="text"
                    value={walkInData.carRegistration}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, carRegistration: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800"
                    data-testid="input-walkin-car"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                disabled={checkInWalkInMutation.isPending}
                data-testid="button-walkin-submit"
              >
                <UserCheck size={20} />
                {checkInWalkInMutation.isPending ? "Checking In..." : "Check In Visitor"}
              </Button>
            </form>
          </GlassCard>
        </TabsContent>

        {/* Pre-booking Tab */}
        <TabsContent value="prebook" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Pre-booking Form */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CalendarPlus className="text-blue-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">Create Pre-booking</h2>
                  <p className="text-slate-600">Schedule a future visitor</p>
                </div>
              </div>
              
              <form onSubmit={handlePreBookingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="visitorFirstName" className="text-sm font-medium text-slate-700">
                      Visitor First Name *
                    </Label>
                    <Input
                      id="visitorFirstName"
                      type="text"
                      value={preBookingData.visitorFirstName || ""}
                      onChange={(e) => setPreBookingData(prev => ({ ...prev, visitorFirstName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      required
                      data-testid="input-prebook-firstname"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="visitorLastName" className="text-sm font-medium text-slate-700">
                      Visitor Last Name *
                    </Label>
                    <Input
                      id="visitorLastName"
                      type="text"
                      value={preBookingData.visitorLastName || ""}
                      onChange={(e) => setPreBookingData(prev => ({ ...prev, visitorLastName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      required
                      data-testid="input-prebook-lastname"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="visitorEmail" className="text-sm font-medium text-slate-700">
                      Visitor Email *
                    </Label>
                    <Input
                      id="visitorEmail"
                      type="email"
                      value={preBookingData.visitorEmail || ""}
                      onChange={(e) => setPreBookingData(prev => ({ ...prev, visitorEmail: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      required
                      data-testid="input-prebook-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm font-medium text-slate-700">
                    Company *
                  </Label>
                  <CompanyCombobox
                    value={preBookingData.company || ""}
                    onChange={(value) => setPreBookingData(prev => ({ ...prev, company: value }))}
                    companies={companies}
                    placeholder="Select or type company name..."
                    className="px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    testId="input-prebook-company"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="hostStaffId" className="text-sm font-medium text-slate-700">
                    Host Staff Member *
                  </Label>
                  <Select 
                    value={preBookingData.hostStaffId || ""} 
                    onValueChange={(value) => setPreBookingData(prev => ({ ...prev, hostStaffId: value }))}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50">
                      <SelectValue placeholder="Select host staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.firstName} {member.lastName} - {member.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Visit Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 text-left justify-start"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="visitTime" className="text-sm font-medium text-slate-700">
                      Visit Time *
                    </Label>
                    <Input
                      id="visitTime"
                      type="time"
                      defaultValue="09:00"
                      onChange={(e) => handleTimeChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose" className="text-sm font-medium text-slate-700">
                    Purpose of Visit
                  </Label>
                  <Textarea
                    id="purpose"
                    value={preBookingData.purpose || ""}
                    onChange={(e) => setPreBookingData(prev => ({ ...prev, purpose: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    placeholder="Brief description of the visit purpose"
                    rows={3}
                    data-testid="textarea-prebook-purpose"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                  disabled={createPreBookingMutation.isPending}
                  data-testid="button-prebook-submit"
                >
                  <Send size={20} />
                  {createPreBookingMutation.isPending ? "Creating..." : "Create Pre-booking"}
                </Button>
              </form>
            </GlassCard>

            {/* Upcoming Visits */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="text-amber-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">Upcoming Visits</h2>
                  <p className="text-slate-600">Recent and scheduled pre-bookings</p>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {upcomingBookings && upcomingBookings.length > 0 ? (
                  upcomingBookings.map((booking) => (
                    <div key={booking.id} className="p-4 bg-white/50 rounded-xl border border-white/30">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-800">{booking.visitorName}</h4>
                          <p className="text-sm text-slate-600">{booking.company}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatBookingDate(booking.visitDate)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getStatusColor(booking)}>
                              {getStatusText(booking)}
                            </Badge>
                            {staff?.find(s => s.id === booking.hostStaffId) && (
                              <span className="text-xs text-slate-500">
                                Host: {staff.find(s => s.id === booking.hostStaffId)?.firstName} {staff.find(s => s.id === booking.hostStaffId)?.lastName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {!booking.isCheckedIn && new Date(booking.visitDate) >= new Date() && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => manualCheckInMutation.mutate(booking.id)}
                            disabled={manualCheckInMutation.isPending}
                            className="ml-2"
                          >
                            <CheckCircle size={16} className="mr-1" />
                            Check In
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    No upcoming visits scheduled.
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* Host Selection Dialog for Previous Visitors */}
      <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Host for {selectedPreviousVisitor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-600">
              Who is {selectedPreviousVisitor?.name} visiting today?
            </p>
            <div className="space-y-2">
              <Label htmlFor="hostSelection" className="text-sm font-medium text-slate-700">
                Host Staff Member *
              </Label>
              <Select 
                value={selectedHostForPrevious} 
                onValueChange={setSelectedHostForPrevious}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} - {member.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowHostSelection(false);
                  setSelectedPreviousVisitor(null);
                  setSelectedHostForPrevious("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleHostSelectionConfirm}
                disabled={checkInPreviousVisitorMutation.isPending || !selectedHostForPrevious}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-host"
              >
                {checkInPreviousVisitorMutation.isPending ? "Checking In..." : "Check In & Print Pass"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visitor Edit Modal */}
      <VisitorEditModal
        visitor={editingVisitor}
        open={showEditModal}
        onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) {
            setEditingVisitor(null);
          }
        }}
      />

      {/* Duplicate Check-in Information Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="glass-effect border border-white/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              ℹ️ Visitor Already On-Site
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-600">
              {duplicateMessage}
            </p>
            <p className="text-sm text-slate-500">
              The visitor is currently checked in. If they need to check out and check in again, please check them out first.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => setShowDuplicateDialog(false)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-acknowledge-duplicate"
              >
                Got it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pass Preview Modal */}
      {checkedInVisitor && showPassPreview && (
        <PassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setCheckedInVisitor(null);
          }}
          visitor={checkedInVisitor}
          hostName={staff?.find(s => s.id === checkedInVisitor.hostStaffId) ? 
            `${staff.find(s => s.id === checkedInVisitor.hostStaffId)?.firstName} ${staff.find(s => s.id === checkedInVisitor.hostStaffId)?.lastName}` : 
            undefined
          }
        />
      )}
    </div>
  );
}