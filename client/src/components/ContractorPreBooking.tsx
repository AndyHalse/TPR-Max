import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { 
  CalendarPlus, 
  Clock, 
  Building2, 
  Mail, 
  Phone, 
  User,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CalendarIcon,
  LogIn,
  Trash2,
  Edit
} from "lucide-react";
import type { ContractorCompany, ContractorWorker, ContractorPreBooking } from "@shared/schema";

const contractorPreBookingSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactEmail: z.string().email("Valid email is required"),
  contactPhone: z.string().optional(),
  workerName: z.string().min(1, "Worker name is required"),
  workerEmail: z.string().email().optional().or(z.literal("")),
  purpose: z.string().min(1, "Purpose is required"),
  scheduledDate: z.date(),
  scheduledTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format"),
  duration: z.string().default("4"),
  notes: z.string().optional(),
  documentsRequired: z.array(z.string()).default([]),
});

type FormData = z.infer<typeof contractorPreBookingSchema>;

export default function ContractorPreBooking() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingBooking, setEditingBooking] = useState<ContractorPreBooking | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(contractorPreBookingSchema),
    defaultValues: {
      companyName: "",
      contactEmail: "",
      contactPhone: "",
      workerName: "",
      workerEmail: "",
      purpose: "Work",
      scheduledDate: new Date(),
      scheduledTime: "09:00",
      duration: "4",
      notes: "",
      documentsRequired: [],
    },
  });

  // Fetch contractor companies for dropdown
  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
  });

  // Fetch contractor pre-bookings
  const { data: preBookings = [], isLoading } = useQuery<ContractorPreBooking[]>({
    queryKey: ["/api/contractors/prebookings"],
  });

  // Fetch upcoming contractor pre-bookings
  const { data: upcomingBookings = [] } = useQuery<ContractorPreBooking[]>({
    queryKey: ["/api/contractors/prebookings/upcoming"],
  });

  // Fetch today's contractor pre-bookings
  const { data: todaysBookings = [] } = useQuery<ContractorPreBooking[]>({
    queryKey: ["/api/contractors/prebookings/today"],
  });

  // Create contractor pre-booking mutation
  const createPreBookingMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/contractors/prebookings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings/today"] });
      toast({
        title: "Pre-booking Created",
        description: "Contractor pre-booking has been created successfully",
      });
      form.reset();
      setShowForm(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create contractor pre-booking",
        variant: "destructive",
      });
    },
  });

  // Update contractor pre-booking mutation
  const updatePreBookingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FormData> }) => {
      const response = await apiRequest("PUT", `/api/contractors/prebookings/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings"] });
      toast({
        title: "Pre-booking Updated",
        description: "Contractor pre-booking has been updated successfully",
      });
      setEditingBooking(null);
      form.reset();
      setShowForm(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update contractor pre-booking",
        variant: "destructive",
      });
    },
  });

  // Delete contractor pre-booking mutation
  const deletePreBookingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/contractors/prebookings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings"] });
      toast({
        title: "Pre-booking Deleted",
        description: "Contractor pre-booking has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete contractor pre-booking",
        variant: "destructive",
      });
    },
  });

  // Check-in from pre-booking mutation
  const checkInMutation = useMutation({
    mutationFn: async (qrCode: string) => {
      const response = await apiRequest("POST", "/api/contractors/prebookings/checkin", { qrCode });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({
        title: "Check-in Successful",
        description: "Contractor has been checked in successfully",
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

  const handleSubmit = (data: FormData) => {
    if (editingBooking) {
      updatePreBookingMutation.mutate({ id: editingBooking.id, data });
    } else {
      createPreBookingMutation.mutate(data);
    }
  };

  const handleEdit = (booking: ContractorPreBooking) => {
    setEditingBooking(booking);
    form.reset({
      companyName: booking.companyName,
      contactEmail: booking.contactEmail,
      contactPhone: booking.contactPhone || "",
      workerName: booking.workerName,
      workerEmail: booking.workerEmail || "",
      purpose: booking.purpose,
      scheduledDate: new Date(booking.scheduledDate),
      scheduledTime: booking.scheduledTime,
      duration: booking.duration || "4",
      notes: booking.notes || "",
      documentsRequired: booking.documentsRequired || [],
    });
    setShowForm(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-6 w-6 text-purple-600" />
          <h2 className="text-2xl font-semibold text-fixed">Contractor Pre-booking</h2>
        </div>
        <Button
          onClick={() => {
            setEditingBooking(null);
            form.reset();
            setShowForm(!showForm);
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white"
          data-testid="button-toggle-prebooking-form"
        >
          <CalendarPlus className="mr-2 h-4 w-4" />
          {showForm ? 'Cancel' : 'New Pre-booking'}
        </Button>
      </div>

      {/* Pre-booking Form */}
      {showForm && (
        <GlassCard className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ABC Construction Ltd" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="workerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Worker Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="John Smith" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="contact@company.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" placeholder="+44 1234 567890" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduledDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduled Date *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "PPP") : "Pick a date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduledTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduled Time *</FormLabel>
                      <FormControl>
                        <Input {...field} type="time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (hours)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 hour</SelectItem>
                          <SelectItem value="2">2 hours</SelectItem>
                          <SelectItem value="4">4 hours</SelectItem>
                          <SelectItem value="8">8 hours (Full day)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Electrical maintenance" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Additional notes or requirements" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingBooking(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPreBookingMutation.isPending || updatePreBookingMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {editingBooking ? 'Update' : 'Create'} Pre-booking
                </Button>
              </div>
            </form>
          </Form>
        </GlassCard>
      )}

      {/* Today's Pre-bookings */}
      {todaysBookings.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-fixed mb-4">Today's Pre-bookings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {todaysBookings.map((booking) => (
              <div key={booking.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-fixed">{booking.workerName}</h4>
                      <p className="text-sm text-variable">{booking.companyName}</p>
                    </div>
                    <Badge className={getStatusColor(booking.status || 'pending')}>
                      {booking.status || 'pending'}
                    </Badge>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {booking.scheduledTime} ({booking.duration || '4'} hours)
                    </p>
                    <p className="text-variable">{booking.purpose}</p>
                  </div>

                  {booking.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => checkInMutation.mutate(booking.qrCode)}
                      disabled={checkInMutation.isPending}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      <LogIn className="mr-2 h-3 w-3" />
                      Check In
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* All Pre-bookings */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-fixed mb-4">All Pre-bookings</h3>
        {isLoading ? (
          <div className="text-center py-8 text-variable">Loading pre-bookings...</div>
        ) : preBookings.length === 0 ? (
          <div className="text-center py-8 text-variable">No contractor pre-bookings found</div>
        ) : (
          <div className="space-y-3">
            {preBookings.map((booking) => (
              <div key={booking.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-fixed">{booking.workerName}</h4>
                      <Badge className={getStatusColor(booking.status || 'pending')}>
                        {booking.status || 'pending'}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-variable">
                      <p className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {booking.companyName}
                      </p>
                      <p className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {new Date(booking.scheduledDate).toLocaleDateString()}
                      </p>
                      <p className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {booking.scheduledTime}
                      </p>
                    </div>
                    
                    <p className="text-sm text-variable mt-1">Purpose: {booking.purpose}</p>
                    {booking.notes && (
                      <p className="text-sm text-variable mt-1">Notes: {booking.notes}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-1 ml-4">
                    {booking.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(booking)}
                        className="text-blue-600 hover:bg-blue-50"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deletePreBookingMutation.mutate(booking.id)}
                      disabled={deletePreBookingMutation.isPending}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}