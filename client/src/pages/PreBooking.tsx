import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  CalendarPlus, 
  Calendar as CalendarIcon, 
  Users, 
  Mail, 
  Clock,
  CheckCircle,
  Send,
  Building2
} from "lucide-react";
import { format, addDays } from "date-fns";
import type { Staff, PreBooking, InsertPreBooking } from "@shared/schema";

export default function PreBooking() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertPreBooking>>({
    visitDate: addDays(new Date(), 1), // Default to tomorrow
  });
  const [selectedDate, setSelectedDate] = useState<Date>(addDays(new Date(), 1));

  const { data: staff, isLoading: isLoadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: preBookings, isLoading: isLoadingBookings } = useQuery<PreBooking[]>({
    queryKey: ["/api/prebookings"],
  });

  const { data: upcomingBookings } = useQuery<PreBooking[]>({
    queryKey: ["/api/prebookings/upcoming"],
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
      setFormData({ visitDate: addDays(new Date(), 1) });
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

  const handleInputChange = (field: keyof InsertPreBooking, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.visitorName || !formData.visitorEmail || !formData.hostStaffId || !formData.visitDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
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
    if (new Date(booking.visitDate) < new Date()) return "bg-red-100 text-red-800";
    return "bg-blue-100 text-blue-800";
  };

  const getStatusText = (booking: PreBooking) => {
    if (booking.isCheckedIn) return "Checked In";
    if (new Date(booking.visitDate) < new Date()) return "Expired";
    return "Pending";
  };

  if (isLoadingStaff) {
    return <div>Loading staff...</div>;
  }

  return (
    <div className="space-y-8">
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
                <Label htmlFor="visitorName" className="text-sm font-medium text-slate-700">
                  Visitor Name *
                </Label>
                <Input
                  id="visitorName"
                  type="text"
                  value={formData.visitorName || ""}
                  onChange={(e) => handleInputChange("visitorName", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  required
                  data-testid="input-visitor-name"
                />
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
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  required
                  data-testid="input-visitor-email"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium text-slate-700">
                Company
              </Label>
              <Input
                id="company"
                type="text"
                value={formData.company || ""}
                onChange={(e) => handleInputChange("company", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                data-testid="input-company"
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
                <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-host-staff">
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} - {member.department}
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
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 justify-start text-left font-normal"
                      data-testid="button-visit-date"
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
            <Clock className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-slate-800">Upcoming Visits</h3>
          </div>
          
          {!upcomingBookings || upcomingBookings.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-slate-600">No upcoming visits</p>
              <p className="text-slate-500 text-sm mt-1">Pre-booked visits will appear here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {upcomingBookings.slice(0, 10).map((booking) => (
                <div 
                  key={booking.id} 
                  className="p-4 bg-white/50 rounded-xl border border-white/30 hover:bg-white/70 transition-colors"
                  data-testid={`upcoming-booking-${booking.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-800">{booking.visitorName}</h4>
                      <p className="text-sm text-slate-600">{booking.company || "No company"}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatBookingDate(booking.visitDate.toString())}
                      </p>
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <Badge className={getStatusColor(booking)}>
                        {getStatusText(booking)}
                      </Badge>
                      {booking.emailSent && (
                        <div className="flex items-center text-xs text-green-600">
                          <Mail size={12} className="mr-1" />
                          Email sent
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* All Pre-bookings */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-800">All Pre-bookings</h3>
          <Badge variant="outline" className="bg-white/50">
            {preBookings?.length || 0} total
          </Badge>
        </div>
        
        {isLoadingBookings ? (
          <div className="text-center py-8">Loading pre-bookings...</div>
        ) : !preBookings || preBookings.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-slate-600 text-lg">No pre-bookings yet</p>
            <p className="text-slate-500 text-sm mt-2">Create your first pre-booking to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Visitor
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Visit Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Host
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    QR Code
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {preBookings.map((booking) => {
                  const hostStaffMember = staff?.find(s => s.id === booking.hostStaffId);
                  return (
                    <tr key={booking.id} className="hover:bg-white/20" data-testid={`prebooking-${booking.id}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-800">{booking.visitorName}</div>
                          <div className="text-xs text-slate-500">{booking.visitorEmail}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {booking.company || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {formatBookingDate(booking.visitDate.toString())}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {hostStaffMember ? `${hostStaffMember.name} (${hostStaffMember.department})` : "Unknown"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={getStatusColor(booking)}>
                          {getStatusText(booking)}
                        </Badge>
                        {booking.emailSent && (
                          <div className="flex items-center text-xs text-green-600 mt-1">
                            <Mail size={12} className="mr-1" />
                            Sent {booking.emailSentAt ? new Date(booking.emailSentAt).toLocaleDateString() : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">
                          {booking.qrCode}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}