import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { printVisitorPass } from "@/lib/printVisitorPass";
import { Staff, PreBooking, InsertPreBooking, MeetingRoom } from "@shared/schema";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { CalendarPlus, FileText, Clock, CheckCircle2, AlertCircle, Users, Eye, Check, ChevronsUpDown, Calendar as CalendarIcon, Send, UserPlus } from "lucide-react";

// Company Combobox Component - IDENTICAL to Walk-in Registration
interface CompanyComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  companies: string[];
  placeholder?: string;
  className?: string;
  testId?: string;
}

declare global {
  interface Window {
    companyTimeout?: NodeJS.Timeout;
  }
}

function CompanyCombobox({ value, onValueChange, companies, placeholder = "Select or type company...", className, testId }: CompanyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  // Update inputValue when value prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setInputValue(selectedValue);
    setOpen(false);
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onValueChange(newValue);
    
    // Clear any existing timeout
    if (window.companyTimeout) {
      clearTimeout(window.companyTimeout);
    }
    
    if (newValue.length >= 2) {
      // Check if input matches start of any existing company
      const hasMatches = companies.some(company => 
        company.toLowerCase().startsWith(newValue.toLowerCase())
      );
      
      if (hasMatches) {
        // Show suggestions only if there are potential matches
        window.companyTimeout = setTimeout(() => {
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
      onValueChange(inputValue.trim());
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

export default function PreBooking() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertPreBooking>>({
    visitDate: new Date(), // Default to today - allow same-day bookings
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [validationErrors, setValidationErrors] = useState<{[key: string]: boolean}>({});

  // GDPR Fix: Get staff by company instead of all staff
  const { data: staff, isLoading: isLoadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff/by-company", formData.company],
    enabled: !!formData.company && formData.company.trim().length > 0,
  });

  const { data: companies = [] } = useQuery<string[]>({
    queryKey: ["/api/companies"],
  });

  const { data: preBookings, isLoading: isLoadingBookings } = useQuery<PreBooking[]>({
    queryKey: ["/api/prebookings"],
  });

  const { data: upcomingBookings } = useQuery<PreBooking[]>({
    queryKey: ["/api/prebookings/upcoming"],
  });

  // Get meeting rooms for optional room assignment
  const { data: meetingRooms } = useQuery<MeetingRoom[]>({
    queryKey: ["/api/meeting-rooms"],
  });

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
      setFormData({ visitDate: new Date() });
      setSelectedDate(new Date());
      setValidationErrors({});
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create pre-booking",
        variant: "destructive",
      });
    },
  });

  const manualCheckInMutation = useMutation({
    mutationFn: async (preBookingId: string) => {
      const response = await apiRequest("POST", "/api/prebookings/manual-checkin", { preBookingId });
      return response.json();
    },
    onSuccess: async (data: { visitor: any }) => {
      const visitor = data.visitor;
      
      // Auto-print the pass after a short delay
      setTimeout(() => {
        printVisitorPass({ visitor, staff, toast });
      }, 500);
      
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Visitor checked in manually! Pass is printing...",
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

  const sendInvitationMutation = useMutation({
    mutationFn: async (preBookingId: string) => {
      const response = await apiRequest("POST", `/api/prebookings/${preBookingId}/send-invitation`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      toast({
        title: "Success",
        description: "Visitor invitation sent successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send visitor invitation",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof InsertPreBooking, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Set time to 9 AM by default
      const dateWithTime = new Date(date);
      dateWithTime.setHours(9, 0, 0, 0);
      setSelectedDate(date);
      handleInputChange("visitDate", dateWithTime);
    }
  };

  const handleTimeChange = (time: string) => {
    if (selectedDate) {
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      handleInputChange("visitDate", newDate);
    }
  };

  const validateForm = () => {
    const errors: {[key: string]: boolean} = {};
    
    if (!formData.visitorFirstName?.trim()) errors.visitorFirstName = true;
    if (!formData.visitorLastName?.trim()) errors.visitorLastName = true;
    if (!formData.visitorEmail?.trim()) errors.visitorEmail = true;
    if (!formData.company?.trim()) errors.company = true;
    if (!formData.hostStaffId?.trim()) errors.hostStaffId = true;
    if (!formData.visitDate) errors.visitDate = true;
    
    setValidationErrors(errors);
    
    // Focus on first error field
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      const firstErrorField = errorFields[0];
      setTimeout(() => {
        const element = document.querySelector(`[data-testid="input-${firstErrorField.replace('hostStaffId', 'host-staff')}"]`) as HTMLElement;
        if (element) {
          element.focus();
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return false;
    }
    
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields highlighted in red.",
        variant: "destructive",
      });
      return;
    }

    createPreBookingMutation.mutate(formData as InsertPreBooking);
  };

  const formatBookingDate = (date: string) => {
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
    return <div>Loading staff...</div>;
  }

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Pre-book Visitors</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Pre-booking Form */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <CalendarPlus className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-slate-800">Create Pre-booking</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="visitorFirstName" className="text-sm font-medium text-slate-700">
                  Visitor First Name *
                </Label>
                <Input
                  id="visitorFirstName"
                  type="text"
                  value={formData.visitorFirstName || ""}
                  onChange={(e) => handleInputChange("visitorFirstName", e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-slate-800 ${
                    validationErrors.visitorFirstName 
                      ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                      : 'border-white/30 focus:ring-blue-500'
                  }`}
                  required
                  data-testid="input-visitorFirstName"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="visitorLastName" className="text-sm font-medium text-slate-700">
                  Visitor Last Name *
                </Label>
                <Input
                  id="visitorLastName"
                  type="text"
                  value={formData.visitorLastName || ""}
                  onChange={(e) => handleInputChange("visitorLastName", e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-slate-800 ${
                    validationErrors.visitorLastName 
                      ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                      : 'border-white/30 focus:ring-blue-500'
                  }`}
                  required
                  data-testid="input-visitorLastName"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="visitorEmail" className="text-sm font-medium text-slate-700">
                Visitor Email *
              </Label>
              <Input
                id="visitorEmail"
                type="email"
                value={formData.visitorEmail || ""}
                onChange={(e) => handleInputChange("visitorEmail", e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-slate-800 ${
                  validationErrors.visitorEmail 
                    ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                    : 'border-white/30 focus:ring-blue-500'
                }`}
                required
                data-testid="input-visitorEmail"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium text-slate-700">
                Company *
              </Label>
              <CompanyCombobox
                value={formData.company || ""}
                onValueChange={(value) => handleInputChange("company", value)}
                companies={companies}
                placeholder="Select or type company name..."
                className={`w-full px-4 py-3 rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-slate-800 ${
                  validationErrors.company 
                    ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                    : 'border-white/30 focus:ring-blue-500'
                }`}
                testId="input-company"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hostStaffId" className="text-sm font-medium text-slate-700">
                Host Staff Member *
              </Label>
              <Select 
                value={formData.hostStaffId || ""} 
                onValueChange={(value) => handleInputChange("hostStaffId", value)}
              >
                <SelectTrigger 
                  className={`w-full px-4 py-3 rounded-xl border bg-white/50 ${
                    validationErrors.hostStaffId 
                      ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                      : 'border-white/30 focus:ring-blue-500'
                  }`} 
                  data-testid="input-host-staff"
                >
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
            
            {/* Meeting Room selector temporarily hidden - database doesn't support meeting_room_id column yet */}
            {/* <div className="space-y-2">
              <Label htmlFor="meetingRoomId" className="text-sm font-medium text-slate-700">
                Meeting Room (Optional)
              </Label>
              <Select 
                value={formData.meetingRoomId || ""} 
                onValueChange={(value) => handleInputChange("meetingRoomId", value || null)}
              >
                <SelectTrigger 
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-meeting-room"
                >
                  <SelectValue placeholder="Select meeting room (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No meeting room</SelectItem>
                  {meetingRooms?.filter(room => room.isActive).map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name} - {room.location} (Capacity: {room.capacity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Visit Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-full px-4 py-3 rounded-xl border bg-white/50 justify-start text-left font-normal ${
                        validationErrors.visitDate 
                          ? 'border-red-500 focus:ring-red-500 ring-red-200' 
                          : 'border-white/30 focus:ring-blue-500'
                      }`}
                      data-testid="input-visitDate"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
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
                  value={formData.visitDate ? format(new Date(formData.visitDate), "HH:mm") : "09:00"}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  required
                  data-testid="input-visit-time"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="purpose" className="text-sm font-medium text-slate-700">
                Purpose of Visit
              </Label>
              <Textarea
                id="purpose"
                value={formData.purpose || ""}
                onChange={(e) => handleInputChange("purpose", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 resize-none"
                rows={3}
                placeholder="Brief description of the visit purpose"
                data-testid="textarea-purpose"
              />
            </div>
            
            <Button
              type="submit"
              disabled={createPreBookingMutation.isPending}
              className="w-full gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
              data-testid="button-create-prebooking"
            >
              <Send className="mr-2" size={16} />
              {createPreBookingMutation.isPending ? "Creating..." : "Create Pre-booking"}
            </Button>
          </form>
        </GlassCard>

        {/* Upcoming Bookings */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <Clock className="mr-3 text-orange-600" size={24} />
            <h3 className="text-lg font-semibold text-slate-800">Upcoming Visits</h3>
          </div>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {upcomingBookings?.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p>No upcoming pre-bookings</p>
              </div>
            ) : (
              upcomingBookings?.map((booking) => (
                <div key={booking.id} className="border border-white/30 rounded-xl p-4 bg-white/30">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800">
                        {booking.visitorFirstName} {booking.visitorLastName}
                      </h4>
                      <p className="text-sm text-slate-600">{booking.company}</p>
                      <p className="text-sm text-slate-600">{formatBookingDate(booking.visitDate.toString())}</p>
                      <p className="text-sm text-slate-600">Host: {staff?.find(s => s.id === booking.hostStaffId)?.firstName} {staff?.find(s => s.id === booking.hostStaffId)?.lastName}</p>
                      {/* Meeting room display hidden - database doesn't support meeting_room_id yet */}
                      {/* {booking.meetingRoomId && (
                        <p className="text-sm text-slate-600">Room: {meetingRooms?.find(r => r.id === booking.meetingRoomId)?.name} - {meetingRooms?.find(r => r.id === booking.meetingRoomId)?.location}</p>
                      )} */}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(booking)}`}>
                        {getStatusText(booking)}
                      </span>
                      <div className="flex gap-2">
                        {!booking.emailSent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendInvitationMutation.mutate(booking.id)}
                            disabled={sendInvitationMutation.isPending}
                            className="text-xs"
                          >
                            <Send size={14} className="mr-1" />
                            Send Invite
                          </Button>
                        )}
                        {!booking.isCheckedIn && new Date(booking.visitDate) >= new Date() && (
                          <Button
                            size="sm"
                            onClick={() => manualCheckInMutation.mutate(booking.id)}
                            disabled={manualCheckInMutation.isPending}
                            className="text-xs"
                          >
                            Check In
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      {/* All Pre-bookings */}
      <GlassCard>
        <div className="flex items-center mb-6">
          <FileText className="mr-3 text-purple-600" size={24} />
          <h3 className="text-lg font-semibold text-slate-800">All Pre-bookings</h3>
        </div>
        
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {isLoadingBookings ? (
            <div className="text-center py-4">Loading bookings...</div>
          ) : preBookings?.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>No pre-bookings found</p>
            </div>
          ) : (
            preBookings?.map((booking) => (
              <div key={booking.id} className="border border-white/30 rounded-xl p-4 bg-white/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-800">
                      {booking.visitorFirstName} {booking.visitorLastName}
                    </h4>
                    <p className="text-sm text-slate-600">{booking.visitorEmail}</p>
                    <p className="text-sm text-slate-600">{booking.company}</p>
                    <p className="text-sm text-slate-600">{formatBookingDate(booking.visitDate.toString())}</p>
                    <p className="text-sm text-slate-600">Host: {staff?.find(s => s.id === booking.hostStaffId)?.firstName} {staff?.find(s => s.id === booking.hostStaffId)?.lastName}</p>
                    {/* Meeting room display hidden - database doesn't support meeting_room_id yet */}
                    {/* {booking.meetingRoomId && (
                      <p className="text-sm text-slate-600">Room: {meetingRooms?.find(r => r.id === booking.meetingRoomId)?.name} - {meetingRooms?.find(r => r.id === booking.meetingRoomId)?.location}</p>
                    )} */}
                    {booking.purpose && <p className="text-sm text-slate-600 mt-1">Purpose: {booking.purpose}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(booking)}`}>
                      {getStatusText(booking)}
                    </span>
                    <div className="flex gap-2">
                      {!booking.emailSent && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendInvitationMutation.mutate(booking.id)}
                          disabled={sendInvitationMutation.isPending}
                          className="text-xs"
                        >
                          <Send size={14} className="mr-1" />
                          Send Invite
                        </Button>
                      )}
                      {!booking.isCheckedIn && new Date(booking.visitDate) >= new Date() && (
                        <Button
                          size="sm"
                          onClick={() => manualCheckInMutation.mutate(booking.id)}
                          disabled={manualCheckInMutation.isPending}
                          className="text-xs"
                        >
                          <UserPlus size={14} className="mr-1" />
                          Check In
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}