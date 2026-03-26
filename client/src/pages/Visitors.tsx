import { useState, useEffect, useRef, useId } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
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
import { printVisitorPass } from "@/lib/printVisitorPass";
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
  Edit,
  LayoutGrid,
  LayoutList,
  Phone,
  Briefcase,
  Camera
} from "lucide-react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format, addDays } from "date-fns";
import type { Staff, PreBooking, InsertPreBooking, Visitor, InsertVisitor, CompanySettings } from "@shared/schema";
import { cn } from "@/lib/utils";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import QRScannerModal from "@/components/QRScannerModal";

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
  const companyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    
    // Clear any existing timeout
    if (companyTimeoutRef.current) {
      clearTimeout(companyTimeoutRef.current);
      companyTimeoutRef.current = null;
    }
    
    if (newValue.length >= 2) {
      // Check if input matches start of any existing company
      const hasMatches = companies.some(company => 
        company.toLowerCase().startsWith(newValue.toLowerCase())
      );
      
      if (hasMatches) {
        // Show suggestions only if there are potential matches
        companyTimeoutRef.current = setTimeout(() => {
          const currentInput = document.activeElement as HTMLInputElement;
          if (currentInput && currentInput.value === newValue) {
            setOpen(true);
          }
        }, 300);
      } else {
        // No matches - close dropdown and let user type freely
        setOpen(false);
      }
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
        <ChevronsUpDown className="h-4 w-4 text-variable" />
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
                <div className="px-2 py-1.5 text-xs font-medium text-variable uppercase tracking-wide">
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
                    <span className="text-fixed truncate">{company}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            {/* Add new company option - always show if input has text */}
            {inputValue.trim() && (
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
                    Use "{inputValue.trim()}"
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            
            {/* Empty state - only show when user has typed but no matches */}
            {filteredCompanies.length === 0 && inputValue.trim() && (
              <div className="px-4 py-6 text-center text-variable">
                <div className="text-sm mb-1">No existing companies found</div>
                <div className="text-xs text-variable">Press Enter to add "{inputValue.trim()}" as new company</div>
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
  
  // Detect if we're in tenant context
  const { slug } = useParams<{ slug?: string }>();
  const isTenantView = !!slug;
  
  // Tab state
  const [activeTab, setActiveTab] = useState("existing");
  const [showQRScanner, setShowQRScanner] = useState(false);
  
  // Pre-booking form state
  const getNextFullHourTime = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0);
    nextHour.setHours(nextHour.getHours() + 1);
    return {
      timeStr: `${String(nextHour.getHours()).padStart(2, '0')}:00`,
      date: nextHour
    };
  };

  const { timeStr: defaultTime, date: defaultDate } = getNextFullHourTime();
  const [visitTimeValue, setVisitTimeValue] = useState(defaultTime);

  const [preBookingData, setPreBookingData] = useState<Partial<InsertPreBooking>>({
    visitDate: defaultDate,
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
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
    needsEvacuationAssistance: false,
  });
  
  // Walk-in validation errors
  const [walkInValidationErrors, setWalkInValidationErrors] = useState<{[key: string]: boolean}>({});
  
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

  // Profile card popup state
  const [viewingVisitor, setViewingVisitor] = useState<Visitor | null>(null);
  const [isUploadingVisitorPhoto, setIsUploadingVisitorPhoto] = useState(false);
  const visitorPhotoInputId = useId();
  
  // Duplicate check-in dialog state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [checkedInVisitor, setCheckedInVisitor] = useState<Visitor | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);
  
  // Pre-booking visitor search state
  const [preBookSearchTerm, setPreBookSearchTerm] = useState("");
  const [showVisitorSearch, setShowVisitorSearch] = useState(false);

  // View mode state for existing visitors
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // H&S modal state
  const [showHSModal, setShowHSModal] = useState(false);
  const [pendingCheckinData, setPendingCheckinData] = useState<Omit<InsertVisitor, 'customerId'> | null>(null);
  const [pendingCheckinType, setPendingCheckinType] = useState<'walkin' | 'previous' | null>(null);

  // GDPR Fix: Get staff by company for walk-in visitors
  const { data: walkInStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff/by-company", walkInData.company],
    enabled: !!walkInData.company && walkInData.company.trim().length > 0,
  });

  // GDPR Fix: Get staff by company for pre-bookings  
  const { data: preBookingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff/by-company", preBookingData.company],
    enabled: !!preBookingData.company && preBookingData.company.trim().length > 0,
  });

  // Global staff query for previous visitor host selection
  const { data: staff, isLoading: isLoadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
    enabled: true, // Re-enable for previous visitor host selection
  });

  const { data: preBookings } = useQuery<PreBooking[]>({
    queryKey: isTenantView ? [`/api/tenants/${slug}/prebookings`] : ["/api/prebookings"],
  });

  const { data: upcomingBookings } = useQuery<PreBooking[]>({
    queryKey: isTenantView ? [`/api/tenants/${slug}/prebookings/upcoming`] : ["/api/prebookings/upcoming"],
  });

  // GDPR FIX: Use tenant-specific endpoint when in tenant view
  const { data: allVisitors } = useQuery<Visitor[]>({
    queryKey: isTenantView ? [`/api/tenants/${slug}/visitors`] : ["/api/visitors"],
  });

  const { data: companies = [] } = useQuery<string[]>({
    queryKey: ["/api/companies"],
  });

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  // Filter existing visitors based on search (exclude visitors with missing essential data)
  const filteredVisitors = allVisitors?.filter(visitor => {
    // Skip visitors with missing essential data
    if (!visitor.firstName || !visitor.lastName) {
      return false;
    }
    
    return (
      `${visitor.firstName} ${visitor.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visitor.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visitor.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (visitor.company && visitor.company.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }) || [];

  // Visitor checkout mutation
  const checkoutVisitorMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      const response = await apiRequest("POST", `/api/visitors/${visitorId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      if (isTenantView) {
        queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/visitors`] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
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

  const updateVisitorPhotoMutation = useMutation({
    mutationFn: async ({ visitorId, photoUrl }: { visitorId: string; photoUrl: string }) => {
      const response = await apiRequest("PUT", `/api/visitors/${visitorId}`, { photoUrl });
      return response.json();
    },
    onSuccess: (updatedVisitor) => {
      setViewingVisitor(updatedVisitor);
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      toast({ title: "Photo updated", description: "Visitor photo saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save visitor photo.", variant: "destructive" });
    },
  });

  const handleVisitorPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingVisitor) return;
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch {
      toast({ title: "Error", description: "Could not read the file. Please try again.", variant: "destructive" });
      return;
    }
    setIsUploadingVisitorPhoto(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await uploadRes.json();
      updateVisitorPhotoMutation.mutate({ visitorId: viewingVisitor.id, photoUrl: objectPath });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
    } finally {
      setIsUploadingVisitorPhoto(false);
      e.target.value = "";
    }
  };

  // Mutations
  const createPreBookingMutation = useMutation({
    mutationFn: async (data: InsertPreBooking) => {
      const response = await apiRequest("POST", "/api/prebookings", data);
      return response.json();
    },
    onSuccess: () => {
      // GDPR FIX: Invalidate tenant-specific cache when in tenant view
      if (isTenantView) {
        queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/prebookings`] });
        queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/prebookings/upcoming`] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      }
      toast({
        title: "Success",
        description: "Pre-booking created and confirmation emails sent!",
      });
      const { timeStr: resetTime, date: resetDate } = getNextFullHourTime();
      setVisitTimeValue(resetTime);
      setPreBookingData({ 
        visitDate: resetDate,
        visitorFirstName: "",
        visitorLastName: "",
        visitorEmail: "",
        company: "",
        hostStaffId: "",
        purpose: ""
      });
      setSelectedDate(new Date());
    },
    onError: (error: Error) => {
      const isDuplicate = error.message?.includes('already pre-booked') || error.message?.includes('Duplicate');
      toast({
        title: isDuplicate ? "Duplicate Pre-booking" : "Error",
        description: error.message || "Failed to create pre-booking",
        variant: "destructive",
        duration: isDuplicate ? 8000 : 5000,
      });
    },
  });

  const checkInWalkInMutation = useMutation({
    mutationFn: async (visitor: Omit<InsertVisitor, 'customerId'>) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: any) => {
      // Check if e-Pass was sent
      if (visitor.ePassSent) {
        // Show e-Pass confirmation instead of printing
        toast({
          title: "✅ Digital Pass Sent",
          description: `E-Pass has been sent to ${visitor.email || 'visitor'}. They can use it to check out.`,
          variant: "default",
          duration: 5000
        });
        // Don't show pass preview for e-Pass
        setShowPassPreview(false);
      } else {
        // Auto-print the pass after a short delay
        setTimeout(() => {
          printVisitorPass({ visitor, staff, toast });
        }, 500);
        // Show visitor pass preview (same as previous visitors)
        setShowPassPreview(true);
      }
      
      if (isTenantView) {
        queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/visitors`] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      
      setCheckedInVisitor(visitor);
      
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
        needsEvacuationAssistance: false,
      });
      setWalkInValidationErrors({});
      
      if (!visitor.ePassSent) {
        toast({
          title: "Success",
          description: "Visitor checked in successfully! Pass is printing...",
        });
      }
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
      // GDPR FIX: Invalidate tenant-specific cache when in tenant view
      if (isTenantView) {
        queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/visitors`] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      }
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
    mutationFn: async (visitor: Omit<InsertVisitor, 'customerId'>) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: any) => {
      // Check if e-Pass was sent
      if (visitor.ePassSent) {
        // Show e-Pass confirmation instead of printing
        toast({
          title: "✅ Digital Pass Sent",
          description: `E-Pass has been sent to ${visitor.email || 'visitor'}. They can use it to check out.`,
          variant: "default",
          duration: 5000
        });
        // Don't show pass preview for e-Pass
        setShowPassPreview(false);
      } else {
        // Auto-print the pass after a short delay
        setTimeout(() => {
          printVisitorPass({ visitor, staff, toast });
        }, 500);
        setShowPassPreview(true);
        toast({
          title: "Success",
          description: "Previous visitor checked in successfully! Pass is printing...",
        });
      }
      
      if (isTenantView) {
        queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/visitors`] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      setCheckedInVisitor(visitor);
      setShowHostSelection(false);
      setSelectedPreviousVisitor(null);
      setSelectedHostForPrevious("");
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
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
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

  // Validate walk-in form
  const validateWalkInForm = () => {
    const errors: {[key: string]: boolean} = {};
    
    if (!walkInData.firstName.trim()) errors.firstName = true;
    if (!walkInData.lastName.trim()) errors.lastName = true;
    if (!walkInData.email.trim()) errors.email = true;
    if (!walkInData.company.trim()) errors.company = true;
    if (!walkInData.hostStaffId.trim()) errors.hostStaffId = true;
    
    setWalkInValidationErrors(errors);
    
    // Focus on first error field
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      const firstErrorField = errorFields[0];
      setTimeout(() => {
        const element = document.querySelector(`[data-testid="input-walkin-${firstErrorField.replace('hostStaffId', 'host')}"]`) as HTMLElement;
        if (element) {
          element.focus();
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return false;
    }
    
    return true;
  };

  // Handle walk-in input changes with validation clearing
  const handleWalkInInputChange = (field: string, value: string) => {
    setWalkInData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user starts typing
    if (walkInValidationErrors[field]) {
      setWalkInValidationErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields with professional highlighting
    if (!validateWalkInForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields highlighted in red.",
        variant: "destructive",
      });
      return;
    }
    
    const visitorData: Omit<InsertVisitor, 'customerId'> = {
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
      needsEvacuationAssistance: walkInData.needsEvacuationAssistance,
    };

    const settingsAny = settings as any;
    if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
      setPendingCheckinData(visitorData);
      setPendingCheckinType('walkin');
      setShowHSModal(true);
    } else {
      checkInWalkInMutation.mutate(visitorData);
    }
  };

  const handleHSAccepted = () => {
    setShowHSModal(false);
    if (pendingCheckinData && pendingCheckinType) {
      const dataWithHS = { ...pendingCheckinData, hsRulesAccepted: true } as any;
      if (pendingCheckinType === 'walkin') {
        checkInWalkInMutation.mutate(dataWithHS);
      } else if (pendingCheckinType === 'previous') {
        checkInPreviousVisitorMutation.mutate(dataWithHS);
      }
    }
    setPendingCheckinData(null);
    setPendingCheckinType(null);
  };

  const handleHSDeclined = () => {
    setShowHSModal(false);
    setPendingCheckinData(null);
    setPendingCheckinType(null);
    toast({
      title: "Check-in Cancelled",
      description: "You must accept the Health & Safety rules to check in.",
      variant: "destructive",
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
  
  const handlePreBookVisitor = (visitor: Visitor) => {
    // Pre-populate the pre-booking form with visitor details
    setPreBookingData(prev => ({
      ...prev,
      visitorFirstName: visitor.firstName,
      visitorLastName: visitor.lastName,
      visitorEmail: visitor.email || '',
      company: visitor.company || '',
    }));
    // Switch to pre-booking tab
    setActiveTab("prebook");
    // Scroll to top to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleSelectVisitorForPreBooking = (visitor: Visitor) => {
    // Pre-populate the pre-booking form with visitor details
    setPreBookingData(prev => ({
      ...prev,
      visitorFirstName: visitor.firstName,
      visitorLastName: visitor.lastName,
      visitorEmail: visitor.email || '',
      company: visitor.company || '',
    }));
    setShowVisitorSearch(false);
    setPreBookSearchTerm("");
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
      // Validate visitor data before submitting
      if (!selectedPreviousVisitor.firstName || !selectedPreviousVisitor.lastName) {
        toast({
          title: "Error",
          description: "Invalid visitor data: Missing first name or last name",
          variant: "destructive",
        });
        return;
      }

      const previousVisitorData: Omit<InsertVisitor, 'customerId'> = {
        firstName: selectedPreviousVisitor.firstName,
        lastName: selectedPreviousVisitor.lastName,
        company: selectedPreviousVisitor.company || null,
        hostStaffId: selectedHostForPrevious,
        purpose: selectedPreviousVisitor.purpose || null,
        carRegistration: selectedPreviousVisitor.carRegistration || null,
      };

      const settingsAny = settings as any;
      if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
        setShowHostSelection(false);
        setPendingCheckinData(previousVisitorData);
        setPendingCheckinType('previous');
        setShowHSModal(true);
      } else {
        checkInPreviousVisitorMutation.mutate(previousVisitorData);
      }
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const [hours, minutes] = visitTimeValue.split(":").map(Number);
      const dateWithTime = new Date(date);
      dateWithTime.setHours(hours, minutes, 0, 0);
      setSelectedDate(date);
      setPreBookingData(prev => ({ ...prev, visitDate: dateWithTime }));
    }
  };

  const handleTimeChange = (time: string) => {
    setVisitTimeValue(time);
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
    const visitDateTime = new Date(booking.visitDate);
    const now = new Date();
    const hoursSinceVisit = (now.getTime() - visitDateTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceVisit > 2) return "bg-red-100 text-red-800";
    return "bg-blue-100 text-blue-800";
  };

  const getStatusText = (booking: PreBooking) => {
    if (booking.isCheckedIn) return "Checked In";
    const visitDateTime = new Date(booking.visitDate);
    const now = new Date();
    const hoursSinceVisit = (now.getTime() - visitDateTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceVisit > 2) return "Expired";
    return "Pending";
  };

  if (isLoadingStaff) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-3xl font-bold text-fixed">Visitor Management</h1>
        <Button
          onClick={() => setShowQRScanner(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base"
          title="Scan a visitor or contractor QR code to check them in"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            <path d="M14 14h1v1h-1zm3 0h1v1h-1zm-3 3h1v1h-1zm3 3h1v1h-1zm3-3h1v1h-1zm0-3h1v1h-1z" />
          </svg>
          <span className="hidden sm:inline">Scan QR</span>
          <span className="sm:hidden">Scan</span>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full bg-white/50 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-1.5 gap-1">
          <TabsTrigger 
            value="existing" 
            className="flex-1 flex items-center justify-center gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm py-2 sm:py-2.5 min-w-0 px-1"
          >
            <History size={14} className="flex-shrink-0" />
            <span className="hidden sm:inline">Previous Visitors</span>
            <span className="sm:hidden">Previous...</span>
          </TabsTrigger>
          <TabsTrigger 
            value="walkin" 
            className="flex-1 flex items-center justify-center gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm py-2 sm:py-2.5 min-w-0 px-1"
          >
            <UserPlus size={14} className="flex-shrink-0" />
            <span className="hidden sm:inline">Walk-in Registration</span>
            <span className="sm:hidden">Walk-in ...</span>
          </TabsTrigger>
          <TabsTrigger 
            value="prebook" 
            className="flex-1 flex items-center justify-center gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm py-2 sm:py-2.5 min-w-0 px-1"
          >
            <CalendarPlus size={14} className="flex-shrink-0" />
            <span className="hidden sm:inline">Pre-booking</span>
            <span className="sm:hidden">Pre-boo...</span>
          </TabsTrigger>
        </TabsList>

        {/* Existing Visitors Tab */}
        <TabsContent value="existing" className="space-y-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                  <History className="text-blue-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-fixed">Previous Visitors</h2>
                  <p className="text-variable text-xs sm:text-sm">Select a visitor who has been onsite before</p>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4 sm:mb-6">
              <Search className="absolute left-3 top-3 text-variable" size={18} />
              <Input
                placeholder="Search by visitor name or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 py-2.5 sm:py-3 text-sm sm:text-lg"
                data-testid="input-search-visitors"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 mb-4">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-8 w-8 p-0"
                title="Grid view"
              >
                <LayoutGrid size={14} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8 w-8 p-0"
                title="List view"
              >
                <LayoutList size={14} />
              </Button>
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
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-2"}>
              {filteredVisitors.length > 0 ? (
                (showAllPreviousVisitors ? filteredVisitors : filteredVisitors.slice(0, 24)).map((visitor) => (
                  viewMode === 'grid' ? (
                    <GlassCard
                      key={visitor.id}
                      hover
                      data-testid={`card-visitor-${visitor.id}`}
                      onClick={() => setViewingVisitor(visitor)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start space-x-3 mb-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                          visitor.photoUrl ? '' :
                          ['bg-gradient-to-r from-blue-500 to-purple-500',
                           'bg-gradient-to-r from-green-500 to-teal-500',
                           'bg-gradient-to-r from-purple-500 to-pink-500',
                           'bg-gradient-to-r from-orange-500 to-red-500',
                           'bg-gradient-to-r from-indigo-500 to-purple-500',
                           'bg-gradient-to-r from-teal-500 to-cyan-500'][filteredVisitors.indexOf(visitor) % 6]
                        }`}>
                          {visitor.photoUrl ? (
                            <img
                              src={visitor.photoUrl.startsWith('/objects/') ? visitor.photoUrl : `/objects${visitor.photoUrl}`}
                              alt={`${visitor.firstName} ${visitor.lastName}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-white font-bold text-sm">
                              {(visitor.firstName?.[0] || '').toUpperCase()}{(visitor.lastName?.[0] || '').toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-fixed text-sm truncate">
                              {visitor.firstName} {visitor.lastName}
                            </h3>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                              visitor.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {visitor.isCheckedIn ? 'On Site' : 'Off Site'}
                            </span>
                          </div>
                          {visitor.company && (
                            <p className="text-variable text-xs truncate">{visitor.company}</p>
                          )}
                          <p className="text-variable text-xs">
                            Last visit: {new Date(visitor.checkedInAt).toLocaleDateString('en-GB', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {visitor.isCheckedIn && visitor.checkedInAt && (
                          <span className="text-[10px] text-variable flex items-center">
                            <Clock size={9} className="mr-0.5" />
                            {new Date(visitor.checkedInAt).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                        <div className="flex items-center gap-1.5">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => { e.stopPropagation(); handleEditVisitor(visitor); }}
                            data-testid={`button-edit-visitor-${visitor.id}`}
                            className="h-8 w-8 p-0"
                            title="Edit visitor details"
                          >
                            <Edit size={15} />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => { e.stopPropagation(); handlePreBookVisitor(visitor); }}
                            data-testid={`button-prebook-visitor-${visitor.id}`}
                            className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            title="Pre-book this visitor"
                          >
                            <CalendarPlus size={15} />
                          </Button>
                        </div>
                        {visitor.isCheckedIn ? (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={(e) => { e.stopPropagation(); checkoutVisitorMutation.mutate(visitor.id); }}
                            disabled={checkoutVisitorMutation.isPending}
                            data-testid={`button-checkout-visitor-${visitor.id}`}
                            title="Check out visitor"
                            className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                          >
                            <UserX size={16} className="mr-1.5" />
                            Check Out
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={(e) => { e.stopPropagation(); handlePreviousVisitorSelect(visitor); }}
                            data-testid={`button-select-visitor-${visitor.id}`}
                            title="Check in visitor"
                            className="h-9 px-3 text-sm font-medium text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                          >
                            <UserCheck size={16} className="mr-1.5" />
                            Check In
                          </Button>
                        )}
                      </div>
                    </GlassCard>
                  ) : (
                    <div 
                      key={visitor.id} 
                      className="bg-white/60 rounded-lg border border-white/30 hover:bg-white/80 transition-all cursor-pointer" 
                      data-testid={`card-visitor-${visitor.id}`}
                      onClick={() => setViewingVisitor(visitor)}
                    >
                      {/* Info row — full width so name is never truncated */}
                      <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                        <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden ${visitor.photoUrl ? '' : 'bg-gradient-to-br from-green-500 to-teal-600'}`}>
                          {visitor.photoUrl ? (
                            <img src={visitor.photoUrl.startsWith('/objects/') ? visitor.photoUrl : `/objects${visitor.photoUrl}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white font-bold text-xs">{(visitor.firstName?.[0] || '').toUpperCase()}{(visitor.lastName?.[0] || '').toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-fixed text-sm leading-tight">{visitor.firstName} {visitor.lastName}</p>
                          {visitor.company && <p className="text-xs text-variable mt-0.5">{visitor.company}</p>}
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Last visit: {new Date(visitor.checkedInAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        {/* Desktop only: actions inline */}
                        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                          <Badge variant={visitor.isCheckedIn ? "default" : "secondary"} className={visitor.isCheckedIn ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600"}>
                            {visitor.isCheckedIn ? "On Site" : "Off Site"}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleEditVisitor(visitor); }} data-testid={`button-edit-visitor-list-${visitor.id}`} className="p-2 h-8 w-8" title="Edit visitor details"><Edit size={14} /></Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handlePreBookVisitor(visitor); }} data-testid={`button-prebook-visitor-list-${visitor.id}`} className="p-2 h-8 w-8" title="Pre-book this visitor"><CalendarPlus size={14} /></Button>
                          {visitor.isCheckedIn ? (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); checkoutVisitorMutation.mutate(visitor.id); }} disabled={checkoutVisitorMutation.isPending} data-testid={`button-checkout-visitor-list-${visitor.id}`} className="h-9 px-3 text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"><UserX size={15} className="mr-1" />Check Out</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handlePreviousVisitorSelect(visitor); }} data-testid={`button-select-visitor-list-${visitor.id}`} className="h-9 px-3 text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"><UserCheck size={15} className="mr-1" />Check In</Button>
                          )}
                        </div>
                      </div>

                      {/* Mobile-only: actions as a bottom row */}
                      <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                        <Badge variant={visitor.isCheckedIn ? "default" : "secondary"} className={visitor.isCheckedIn ? "bg-green-100 text-green-700 border-green-200 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>
                          {visitor.isCheckedIn ? "On Site" : "Off Site"}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleEditVisitor(visitor); }} data-testid={`button-edit-visitor-list-mob-${visitor.id}`} className="h-9 w-9 p-0" title="Edit"><Edit size={14} /></Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handlePreBookVisitor(visitor); }} data-testid={`button-prebook-visitor-list-mob-${visitor.id}`} className="h-9 w-9 p-0" title="Pre-book"><CalendarPlus size={14} /></Button>
                          {visitor.isCheckedIn ? (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); checkoutVisitorMutation.mutate(visitor.id); }} disabled={checkoutVisitorMutation.isPending} data-testid={`button-checkout-visitor-list-mob-${visitor.id}`} className="h-9 px-3 font-medium text-red-600 border-red-300 hover:bg-red-50"><UserX size={14} className="mr-1" />Check Out</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handlePreviousVisitorSelect(visitor); }} data-testid={`button-select-visitor-list-mob-${visitor.id}`} className="h-9 px-3 font-medium text-green-600 border-green-300 hover:bg-green-50"><UserCheck size={14} className="mr-1" />Check In</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-variable">
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
          </div>
        </TabsContent>

        {/* Walk-in Registration Tab */}
        <TabsContent value="walkin" className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserPlus className="text-green-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-fixed">Walk-in Registration</h2>
                <p className="text-variable">Register a new visitor who just turned up</p>
              </div>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-6">
              {/* Required Fields */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-fixed border-b border-slate-200 pb-2">Required Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium text-fixed">
                      Visitor First Name *
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={walkInData.firstName}
                      onChange={(e) => handleWalkInInputChange("firstName", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-fixed ${
                        walkInValidationErrors.firstName 
                          ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                          : 'border-white/30 focus:ring-green-500'
                      }`}
                      required
                      data-testid="input-walkin-firstname"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium text-fixed">
                      Visitor Last Name *
                    </Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={walkInData.lastName}
                      onChange={(e) => handleWalkInInputChange("lastName", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-fixed ${
                        walkInValidationErrors.lastName 
                          ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                          : 'border-white/30 focus:ring-green-500'
                      }`}
                      required
                      data-testid="input-walkin-lastname"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-required" className="text-sm font-medium text-fixed">
                      Company *
                    </Label>
                    <CompanyCombobox
                      value={walkInData.company}
                      onChange={(value) => handleWalkInInputChange("company", value)}
                      companies={companies}
                      placeholder="Select or type company name..."
                      className={`px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-fixed ${
                        walkInValidationErrors.company 
                          ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                          : 'border-white/30 focus:ring-green-500'
                      }`}
                      testId="input-walkin-company"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email-required" className="text-sm font-medium text-fixed">
                      Email Address *
                    </Label>
                    <Input
                      id="email-required"
                      type="email"
                      value={walkInData.email}
                      onChange={(e) => handleWalkInInputChange("email", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-fixed ${
                        walkInValidationErrors.email 
                          ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                          : 'border-white/30 focus:ring-green-500'
                      }`}
                      required
                      data-testid="input-walkin-email"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Visitor Profile */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-fixed border-b border-slate-200 pb-2">Additional Information (Optional)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-sm font-medium text-fixed">
                      Phone Number
                    </Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={walkInData.phoneNumber}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-fixed"
                      data-testid="input-walkin-phone"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="mobileNumber" className="text-sm font-medium text-fixed">
                      Mobile Number
                    </Label>
                    <Input
                      id="mobileNumber"
                      type="tel"
                      value={walkInData.mobileNumber}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, mobileNumber: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-fixed"
                      data-testid="input-walkin-mobile"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle" className="text-sm font-medium text-fixed">
                      Job Title
                    </Label>
                    <Input
                      id="jobTitle"
                      type="text"
                      value={walkInData.jobTitle}
                      onChange={(e) => setWalkInData(prev => ({ ...prev, jobTitle: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-fixed"
                      data-testid="input-walkin-jobtitle"
                    />
                  </div>
                  
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-fixed">
                    Address
                  </Label>
                  <Textarea
                    id="address"
                    value={walkInData.address}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-fixed min-h-[80px]"
                    placeholder="Enter full address (street, city, postcode)"
                    data-testid="input-walkin-address"
                  />
                </div>
              </div>

              {/* Host Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-fixed border-b border-slate-200 pb-2">Visit Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="hostStaffId" className="text-sm font-medium text-fixed">
                    Host Staff Member *
                  </Label>
                  <Select 
                    value={walkInData.hostStaffId} 
                    onValueChange={(value) => handleWalkInInputChange("hostStaffId", value)}
                  >
                    <SelectTrigger 
                      className={`w-full px-4 py-3 rounded-xl border bg-white/50 ${
                        walkInValidationErrors.hostStaffId 
                          ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                          : 'border-white/30 focus:ring-green-500'
                      }`}
                      data-testid="input-walkin-host"
                    >
                      <SelectValue placeholder="Select host staff member" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-64 overflow-y-auto">
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id} className="py-3 text-sm">
                          <span className="font-medium">{member.firstName} {member.lastName}</span>
                          {member.department && <span className="text-muted-foreground ml-1">— {member.department}</span>}
                        </SelectItem>
                      ))}
                      {(!staff || staff.length === 0) && (
                        <SelectItem key="no-staff" value="no-selection" disabled>
                          No staff members available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purpose" className="text-sm font-medium text-fixed">
                    Purpose of Visit
                  </Label>
                  <Input
                    id="purpose"
                    type="text"
                    value={walkInData.purpose}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, purpose: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-fixed"
                    data-testid="input-walkin-purpose"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="carRegistration" className="text-sm font-medium text-fixed">
                    Car Registration
                  </Label>
                  <Input
                    id="carRegistration"
                    type="text"
                    value={walkInData.carRegistration}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, carRegistration: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 text-fixed"
                    data-testid="input-walkin-car"
                  />
                </div>
              </div>

              {/* PEEP - Personal Emergency Evacuation Plan */}
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-900/20 dark:border-amber-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="walkin-peep"
                    checked={walkInData.needsEvacuationAssistance}
                    onChange={(e) => setWalkInData(prev => ({ ...prev, needsEvacuationAssistance: e.target.checked }))}
                    className="w-4 h-4 accent-amber-600"
                  />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    ♿ Requires Evacuation Assistance (PEEP)
                  </span>
                </label>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-7">
                  Flag for Personal Emergency Evacuation Plan — will appear on muster list during an emergency.
                </p>
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
                  <h2 className="text-xl font-semibold text-fixed">Create Pre-booking</h2>
                  <p className="text-variable">Schedule a future visitor</p>
                </div>
              </div>
              
              {/* Search Previous Visitors Section */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="mb-3">
                  <Label className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Quick Select Previous Visitor
                  </Label>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Start typing to search for a previous visitor and auto-fill their details
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-blue-600" size={18} />
                  <Input
                    placeholder="Search by name or company..."
                    value={preBookSearchTerm}
                    onChange={(e) => {
                      setPreBookSearchTerm(e.target.value);
                      setShowVisitorSearch(e.target.value.length >= 2);
                    }}
                    onFocus={() => {
                      if (preBookSearchTerm.length >= 2) {
                        setShowVisitorSearch(true);
                      }
                    }}
                    onBlur={() => {
                      // Small delay to allow click on dropdown item
                      setTimeout(() => setShowVisitorSearch(false), 200);
                    }}
                    className="pl-10 pr-4 py-2 bg-[var(--card)] border-blue-300"
                    data-testid="input-prebook-search"
                  />
                  
                  {/* Search Results Dropdown */}
                  {showVisitorSearch && preBookSearchTerm.length >= 2 && (
                    <div className="absolute z-10 w-full mt-2 bg-[var(--card)] rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 max-h-60 overflow-auto">
                      {allVisitors?.filter((v: Visitor) => 
                        (v.firstName?.toLowerCase().includes(preBookSearchTerm.toLowerCase()) ||
                         v.lastName?.toLowerCase().includes(preBookSearchTerm.toLowerCase()) ||
                         v.company?.toLowerCase().includes(preBookSearchTerm.toLowerCase())) &&
                        !v.isCheckedIn
                      ).slice(0, 5).map((visitor: Visitor) => (
                        <button
                          key={visitor.id}
                          type="button"
                          onClick={() => handleSelectVisitorForPreBooking(visitor)}
                          className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-slate-100 dark:border-slate-700 last:border-0 flex items-center justify-between group"
                          data-testid={`button-select-prebookvisitor-${visitor.id}`}
                        >
                          <div>
                            <div className="font-medium text-fixed">
                              {visitor.firstName} {visitor.lastName}
                            </div>
                            <div className="text-sm text-variable">
                              {visitor.company || 'No company'} • {visitor.email || 'No email'}
                            </div>
                          </div>
                          <UserCheck className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" size={18} />
                        </button>
                      ))}
                      {allVisitors?.filter((v: Visitor) => 
                        (v.firstName?.toLowerCase().includes(preBookSearchTerm.toLowerCase()) ||
                         v.lastName?.toLowerCase().includes(preBookSearchTerm.toLowerCase()) ||
                         v.company?.toLowerCase().includes(preBookSearchTerm.toLowerCase())) &&
                        !v.isCheckedIn
                      ).length === 0 && (
                        <div className="px-4 py-3 text-center text-variable">
                          No visitors found matching "{preBookSearchTerm}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <form onSubmit={handlePreBookingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="visitorFirstName" className="text-sm font-medium text-fixed">
                      Visitor First Name *
                    </Label>
                    <Input
                      id="visitorFirstName"
                      type="text"
                      value={preBookingData.visitorFirstName || ""}
                      onChange={(e) => setPreBookingData(prev => ({ ...prev, visitorFirstName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                      required
                      data-testid="input-prebook-firstname"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="visitorLastName" className="text-sm font-medium text-fixed">
                      Visitor Last Name *
                    </Label>
                    <Input
                      id="visitorLastName"
                      type="text"
                      value={preBookingData.visitorLastName || ""}
                      onChange={(e) => setPreBookingData(prev => ({ ...prev, visitorLastName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                      required
                      data-testid="input-prebook-lastname"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="visitorEmail" className="text-sm font-medium text-fixed">
                      Visitor Email *
                    </Label>
                    <Input
                      id="visitorEmail"
                      type="email"
                      value={preBookingData.visitorEmail || ""}
                      onChange={(e) => setPreBookingData(prev => ({ ...prev, visitorEmail: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                      required
                      data-testid="input-prebook-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm font-medium text-fixed">
                    Company *
                  </Label>
                  <CompanyCombobox
                    value={preBookingData.company || ""}
                    onChange={(value) => setPreBookingData(prev => ({ ...prev, company: value }))}
                    companies={companies}
                    placeholder="Select or type company name..."
                    className="px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                    testId="input-prebook-company"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="hostStaffId" className="text-sm font-medium text-fixed">
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
                      {(!staff || staff.length === 0) && (
                        <SelectItem key="no-staff" value="no-selection" disabled>
                          No staff members available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-fixed">Visit Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full px-3 py-2 h-10 rounded-xl border border-white/30 bg-white/50 text-left justify-start text-sm"
                        >
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{selectedDate ? format(selectedDate, "d MMM yy") : "Pick date"}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return date < today;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="visitTime" className="text-sm font-medium text-fixed">
                      Visit Time *
                    </Label>
                    <Input
                      id="visitTime"
                      type="time"
                      value={visitTimeValue}
                      onChange={(e) => handleTimeChange(e.target.value)}
                      className="w-full h-10 px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose" className="text-sm font-medium text-fixed">
                    Purpose of Visit
                  </Label>
                  <Textarea
                    id="purpose"
                    value={preBookingData.purpose || ""}
                    onChange={(e) => setPreBookingData(prev => ({ ...prev, purpose: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
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
                  <h2 className="text-xl font-semibold text-fixed">Upcoming Visits</h2>
                  <p className="text-variable">Recent and scheduled pre-bookings</p>
                </div>
              </div>

              <div className="space-y-3 max-h-[800px] overflow-y-auto">
                {upcomingBookings && upcomingBookings.length > 0 ? (
                  upcomingBookings.map((booking) => (
                    <div key={booking.id} className="p-4 bg-white/50 rounded-xl border border-white/30">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-fixed">{booking.visitorFirstName} {booking.visitorLastName}</h4>
                          <p className="text-sm text-variable">{booking.company}</p>
                          <p className="text-xs text-variable mt-1">
                            {formatBookingDate(booking.visitDate)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getStatusColor(booking)}>
                              {getStatusText(booking)}
                            </Badge>
                            {staff?.find(s => s.id === booking.hostStaffId) && (
                              <span className="text-xs text-variable">
                                Host: {staff.find(s => s.id === booking.hostStaffId)?.firstName} {staff.find(s => s.id === booking.hostStaffId)?.lastName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {!booking.isCheckedIn && booking.status !== 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => manualCheckInMutation.mutate(booking.id)}
                            disabled={manualCheckInMutation.isPending}
                            className="ml-2 text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                          >
                            <CheckCircle size={16} className="mr-1" />
                            Check In
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-variable">
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
        <DialogContent className="w-[95vw] max-w-md mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Who is {selectedPreviousVisitor?.firstName} {selectedPreviousVisitor?.lastName} visiting?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-fixed">Host Staff Member *</Label>
              <Select 
                value={selectedHostForPrevious} 
                onValueChange={setSelectedHostForPrevious}
              >
                <SelectTrigger className="w-full h-12 text-sm" data-testid="input-host-select">
                  <SelectValue placeholder="Tap to choose a staff member…" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-64 overflow-y-auto">
                  {staff?.map((member) => (
                    <SelectItem key={member.id} value={member.id} className="py-3 text-sm">
                      <span className="font-medium">{member.firstName} {member.lastName}</span>
                      {member.department && <span className="text-muted-foreground ml-1">— {member.department}</span>}
                    </SelectItem>
                  ))}
                  {(!staff || staff.length === 0) && (
                    <SelectItem key="no-staff" value="no-selection" disabled>No staff members available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowHostSelection(false);
                  setSelectedPreviousVisitor(null);
                  setSelectedHostForPrevious("");
                }}
                className="flex-1 h-12"
              >
                Cancel
              </Button>
              <Button
                onClick={handleHostSelectionConfirm}
                disabled={checkInPreviousVisitorMutation.isPending || !selectedHostForPrevious}
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
                data-testid="button-confirm-host"
              >
                {checkInPreviousVisitorMutation.isPending ? "Checking In…" : "Check In & Print Pass"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visitor Profile Card Dialog */}
      <Dialog open={!!viewingVisitor} onOpenChange={(open) => { if (!open) setViewingVisitor(null); }}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Visitor Profile</DialogTitle>
          {viewingVisitor && (() => {
            const vv = viewingVisitor;
            const hostStaff = staff?.find(s => s.id === vv.hostStaffId);
            const photoSrc = vv.photoUrl
              ? (vv.photoUrl.startsWith('/objects/') ? vv.photoUrl : `/objects${vv.photoUrl}`)
              : null;
            return (
              <>
                {/* Slim top bar */}
                <div className="bg-gradient-to-r from-green-600 to-teal-600 px-4 py-2 pr-10">
                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest">Visitor Profile</p>
                </div>

                <div className="flex flex-col items-center px-6 pt-5 pb-6">
                  {/* Hidden file input for photo upload */}
                  <input
                    type="file"
                    accept="image/*"
                    id={visitorPhotoInputId}
                    className="hidden"
                    onChange={handleVisitorPhotoUpload}
                  />

                  {/* Avatar with upload overlay */}
                  <div className="relative group">
                    <div className="w-36 h-36 rounded-full border-4 border-green-100 shadow-xl overflow-hidden bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                      {photoSrc ? (
                        <img src={photoSrc} alt="Visitor photo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-4xl">
                          {(vv.firstName?.[0] || '').toUpperCase()}{(vv.lastName?.[0] || '').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <label
                      htmlFor={visitorPhotoInputId}
                      className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                      title="Upload photo"
                    >
                      {isUploadingVisitorPhoto ? (
                        <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <Camera size={24} className="text-white" />
                      )}
                    </label>
                  </div>

                  <h2 className="mt-3 text-xl font-bold text-gray-900">{vv.firstName} {vv.lastName}</h2>
                  {vv.jobTitle && <p className="text-sm text-gray-500 mt-0.5">{vv.jobTitle}</p>}
                  {vv.company && <p className="text-sm text-gray-400 mt-0.5">{vv.company}</p>}

                  {/* Status badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${vv.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {vv.isCheckedIn ? '● On Site' : '● Off Site'}
                    </span>
                    {vv.isCheckedIn && vv.checkedInAt && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
                        <Clock size={10} /> {new Date(vv.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="mt-5 w-full space-y-3 border-t pt-4">
                    {vv.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <Mail size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700 break-all">{vv.email}</span>
                      </div>
                    )}
                    {vv.phoneNumber && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <Phone size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700">{vv.phoneNumber}</span>
                      </div>
                    )}
                    {vv.company && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <Building2 size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700">{vv.company}</span>
                      </div>
                    )}
                    {vv.purpose && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <Briefcase size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700">{vv.purpose}</span>
                      </div>
                    )}
                    {hostStaff && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <UserCheck size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700">Visiting: {hostStaff.firstName} {hostStaff.lastName}</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-5 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => { setViewingVisitor(null); handleEditVisitor(vv); }}
                    >
                      <Edit size={13} className="mr-1" /> Edit Profile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs text-teal-600 border-teal-300 hover:bg-teal-50"
                      onClick={() => { setViewingVisitor(null); handlePreBookVisitor(vv); }}
                    >
                      <CalendarPlus size={13} className="mr-1" /> Pre-Book
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
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
            <DialogTitle className="flex items-center gap-2 text-fixed">
              ℹ️ Visitor Already On-Site
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-variable">
              {duplicateMessage}
            </p>
            <p className="text-sm text-variable">
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

      {/* H&S Acceptance Modal */}
      <HSAcceptanceModal
        isOpen={showHSModal}
        onAccept={handleHSAccepted}
        onDecline={handleHSDeclined}
        hsRulesContent={(settings as any)?.hsRulesContent || ""}
        companyName={(settings as any)?.companyName || ""}
      />

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

      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
      />
    </div>
  );
}