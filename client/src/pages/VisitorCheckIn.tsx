import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import GlassCard from "@/components/GlassCard";
import PassPreviewModal from "@/components/PassPreviewModal";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Staff, InsertVisitor, Visitor, CompanySettings } from "@shared/schema";

interface Zone {
  id: string;
  name: string;
  color: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface CompanyComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  companies: string[];
  placeholder?: string;
  className?: string;
}

function CompanyCombobox({ value, onValueChange, companies, placeholder = "Select or type company...", className }: CompanyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (newValue.length >= 2) {
      const hasMatches = companies.some(c => c.toLowerCase().startsWith(newValue.toLowerCase()));
      if (hasMatches) {
        timeoutRef.current = setTimeout(() => setOpen(true), 300);
      } else {
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

  const filteredCompanies = companies
    .filter(c => c.toLowerCase().includes(inputValue.toLowerCase()))
    .sort((a, b) => {
      const s = inputValue.toLowerCase();
      if (a.toLowerCase() === s) return -1;
      if (b.toLowerCase() === s) return 1;
      const aS = a.toLowerCase().startsWith(s);
      const bS = b.toLowerCase().startsWith(s);
      if (aS && !bS) return -1;
      if (bS && !aS) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 6);

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        className={cn("w-full pr-8", className)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        data-testid="input-visitor-company"
      />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
        onClick={() => setOpen(!open)}
      >
        <ChevronsUpDown className="h-4 w-4 text-variable" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="absolute inset-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent className="w-full p-2 shadow-lg border border-slate-200" align="start" style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '320px' }}>
          <Command>
            <CommandList className="max-h-64 overflow-auto">
              {filteredCompanies.length > 0 && (
                <CommandGroup>
                  <div className="px-2 py-1.5 text-xs font-medium text-variable uppercase tracking-wide">Existing Companies</div>
                  {filteredCompanies.map((company) => (
                    <CommandItem key={company} value={company} onSelect={() => handleSelect(company)} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer rounded-md mx-2">
                      <Check className={cn("h-4 w-4 text-blue-600", value === company ? "opacity-100" : "opacity-0")} />
                      <span className="text-fixed truncate">{company}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {inputValue.trim() && (
                <CommandGroup>
                  {filteredCompanies.length > 0 && <div className="border-t border-slate-200 my-1" />}
                  <div className="px-2 py-1.5 text-xs font-medium text-green-600 uppercase tracking-wide">Add New</div>
                  <CommandItem value={inputValue} onSelect={() => handleSelect(inputValue.trim())} className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 cursor-pointer rounded-md mx-2">
                    <div className="flex-shrink-0 w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 text-sm font-bold">+</span>
                    </div>
                    <span className="text-green-700 font-medium truncate">Use "{inputValue.trim()}"</span>
                  </CommandItem>
                </CommandGroup>
              )}
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

// Extend Visitor type to include e-Pass properties from backend
interface VisitorWithEPass extends Visitor {
  ePassSent?: boolean;
  ePassUrl?: string;
}

export default function VisitorCheckIn() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    hostStaffId: "",
    purpose: "",
    carRegistration: "",
    zoneId: "",
  });
  const [createdVisitor, setCreatedVisitor] = useState<VisitorWithEPass | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [showHSModal, setShowHSModal] = useState(false);
  const [pendingVisitorData, setPendingVisitorData] = useState<any>(null);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: companies = [] } = useQuery<string[]>({
    queryKey: ["/api/companies"],
  });

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
  });

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  // Function to automatically print visitor pass
  const printVisitorPass = (visitor: Visitor) => {
    const printUrl = `/api/passes/print/visitor/${visitor.id}`;
    const printWindow = window.open(printUrl, '_blank', 'width=500,height=400,noopener,noreferrer');
    if (!printWindow) {
      toast({
        title: "Popup blocked",
        description: `Allow popups for this site to print passes, or open: ${window.location.origin}${printUrl}`,
        variant: "destructive",
        duration: 10000,
      });
    }
  };

  const checkinMutation = useMutation({
    mutationFn: async (visitor: InsertVisitor) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: VisitorWithEPass) => {
      setCreatedVisitor(visitor);
      
      // Check if e-Pass was sent (visitor has ePassSent property set by backend)
      if (visitor.ePassSent) {
        // Show e-Pass confirmation instead of printing
        toast({
          title: "✅ Digital Pass Sent",
          description: `E-Pass has been sent to ${visitor.email || 'visitor'}. They can use it to check out.`,
          variant: "default",
          duration: 5000
        });
        // Navigate back after showing the toast
        setTimeout(() => {
          setLocation("/kiosk");
        }, 3000);
      } else {
        // Show pass preview and auto-print physical pass
        setShowPassPreview(true);
        setTimeout(() => {
          printVisitorPass(visitor);
        }, 500);
        toast({
          title: "Success",
          description: "Visitor checked in successfully! Pass is printing...",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: any) => {
      console.error('Check-in error:', error);
      
      // Handle specific duplicate visitor error
      if (error.message?.includes("409") || error.message?.includes("already checked in")) {
        toast({
          title: "Visitor Already On Site",
          description: "This visitor is already checked in. Please check them out first if needed.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to check in visitor. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.hostStaffId) {
      toast({
        title: "Error",
        description: "Please select a host",
        variant: "destructive",
      });
      return;
    }

    const nameParts = formData.name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;
    
    const visitorData = {
      firstName,
      lastName,
      company: formData.company.trim() || null,
      email: formData.email.trim() || null,
      hostStaffId: formData.hostStaffId,
      purpose: formData.purpose.trim() || null,
      carRegistration: formData.carRegistration.trim() || null,
      zoneId: formData.zoneId || null,
      isCheckedIn: true,
    };

    const settingsAny = settings as any;
    if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
      setPendingVisitorData(visitorData);
      setShowHSModal(true);
      return;
    }

    checkinMutation.mutate(visitorData);
  };

  const handleHSAccepted = () => {
    setShowHSModal(false);
    if (pendingVisitorData) {
      checkinMutation.mutate({
        ...pendingVisitorData,
        hsRulesAccepted: true,
      });
      setPendingVisitorData(null);
    }
  };

  const handleHSDeclined = () => {
    setShowHSModal(false);
    setPendingVisitorData(null);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <GlassCard className="p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-fixed mb-2">Visitor Check-In</h2>
          <p className="text-variable">Please fill in your details below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                Full Name *
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="Enter your full name"
                data-testid="input-visitor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium text-slate-700">
                Company
              </Label>
              <CompanyCombobox
                value={formData.company}
                onValueChange={(value) => handleInputChange("company", value)}
                companies={companies}
                placeholder="Type company name..."
                className="px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Your email for digital pass"
              data-testid="input-visitor-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="host" className="text-sm font-medium text-slate-700">
              Host *
            </Label>
            <Select value={formData.hostStaffId} onValueChange={(value) => handleInputChange("hostStaffId", value)}>
              <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-host">
                <SelectValue placeholder="Select your host" />
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

          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium text-slate-700">
              Purpose of Visit
            </Label>
            <Input
              id="purpose"
              type="text"
              value={formData.purpose}
              onChange={(e) => handleInputChange("purpose", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Reason for your visit"
              data-testid="input-visitor-purpose"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="carRegistration" className="text-sm font-medium text-slate-700">
              Car Registration (Optional)
            </Label>
            <Input
              id="carRegistration"
              type="text"
              value={formData.carRegistration}
              onChange={(e) => handleInputChange("carRegistration", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Vehicle registration number"
              data-testid="input-visitor-car-registration"
            />
          </div>

          {zones.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="zone" className="text-sm font-medium text-slate-700">
                Zone / Location
              </Label>
              <Select value={formData.zoneId} onValueChange={(value) => handleInputChange("zoneId", value)}>
                <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-zone">
                  <SelectValue placeholder="Select zone (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: zone.color }}
                        />
                        <span>{zone.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/kiosk")}
              className="flex-1 px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              data-testid="button-back-to-kiosk"
            >
              <ArrowLeft className="mr-2" size={16} />
              Back
            </Button>
            <Button
              type="submit"
              disabled={checkinMutation.isPending}
              className="flex-1 gradient-blue text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-checkin"
            >
              {checkinMutation.isPending ? (
                "Checking In..."
              ) : (
                <>
                  <Check className="mr-2" size={16} />
                  Check In
                </>
              )}
            </Button>
          </div>
        </form>
      </GlassCard>

      {createdVisitor && !createdVisitor.ePassSent && (
        <PassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setLocation("/kiosk");
          }}
          visitor={createdVisitor}
          hostName={staff?.find(s => s.id === createdVisitor.hostStaffId) ? `${staff.find(s => s.id === createdVisitor.hostStaffId)?.firstName} ${staff.find(s => s.id === createdVisitor.hostStaffId)?.lastName}` : "Unknown Host"}
        />
      )}

      <HSAcceptanceModal
        isOpen={showHSModal}
        companyName={(settings as any)?.companyName}
        hsRulesContent={(settings as any)?.hsRulesContent || ""}
        onAccept={handleHSAccepted}
        onDecline={handleHSDeclined}
      />
    </div>
  );
}
