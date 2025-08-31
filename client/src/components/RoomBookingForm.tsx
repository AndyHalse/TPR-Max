import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addMinutes, parseISO, isBefore, isAfter } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Clock, Users, MapPin, Wifi, Monitor, Coffee, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { MeetingRoom, Staff } from '@shared/schema';

// Create a function to build the schema with room data for capacity validation
const createBookingFormSchema = (rooms: MeetingRoom[]) => z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title cannot exceed 100 characters'),
  description: z.string().optional(),
  roomId: z.string().min(1, 'Please select a room'),
  organizerStaffId: z.string().min(1, 'Please select an organizer'),
  startDateTime: z.string().min(1, 'Start time is required'),
  endDateTime: z.string().min(1, 'End time is required'),
  expectedAttendees: z.number().min(1, 'At least 1 attendee required').max(100, 'Maximum 100 attendees'),
  staffAttendeeIds: z.array(z.string()).default([]),
  externalAttendeeEmails: z.array(z.string().email('Invalid email format')).default([]),
  isRecurring: z.boolean().default(false),
  recurringType: z.string().optional(),
  recurringEndDate: z.string().optional(),
  cateringRequired: z.boolean().default(false),
  cateringNotes: z.string().optional(),
  technicalRequirements: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
}).refine((data) => {
  const start = new Date(data.startDateTime);
  const end = new Date(data.endDateTime);
  return isBefore(start, end);
}, {
  message: "End time must be after start time",
  path: ["endDateTime"],
}).refine((data) => {
  const totalSelectedAttendees = (data.staffAttendeeIds?.length || 0) + (data.externalAttendeeEmails?.length || 0) + 1; // +1 for organizer
  return totalSelectedAttendees <= data.expectedAttendees;
}, {
  message: "Total selected attendees cannot exceed expected attendees count",
  path: ["expectedAttendees"],
}).refine((data) => {
  // Room capacity validation
  const selectedRoom = rooms.find(room => room.id === data.roomId);
  if (!selectedRoom) return true; // Let other validation handle missing room
  
  return data.expectedAttendees <= selectedRoom.capacity;
}, {
  message: "Expected attendees exceed room capacity",
  path: ["expectedAttendees"],
});

type BookingFormData = z.infer<ReturnType<typeof createBookingFormSchema>>;

interface RoomBookingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedRoomId?: string;
  editBooking?: any; // BookingWithDetails type
  tenantId?: string;
}

export function RoomBookingForm({
  open,
  onOpenChange,
  selectedDate,
  selectedRoomId,
  editBooking,
  tenantId
}: RoomBookingFormProps) {
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<'checking' | 'available' | 'conflict' | 'error' | null>(null);
  const [conflictingBookings, setConflictingBookings] = useState<any[]>([]);
  const { toast } = useToast();

  // Generate time slots (30-minute intervals)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 20; hour++) { // 8 AM to 8 PM
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeStr);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const { data: rooms = [] } = useQuery<MeetingRoom[]>({
    queryKey: ['/api/meeting-rooms'],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ['/api/staff'],
  });

  const form = useForm<BookingFormData>({
    resolver: zodResolver(createBookingFormSchema(rooms)),
    defaultValues: {
      title: '',
      description: '',
      roomId: selectedRoomId || '',
      organizerStaffId: '',
      expectedAttendees: 1,
      isRecurring: false,
      cateringRequired: false,
      priority: 'normal',
      startDateTime: selectedDate ? format(selectedDate, 'yyyy-MM-dd') + 'T09:00' : '',
      endDateTime: selectedDate ? format(selectedDate, 'yyyy-MM-dd') + 'T10:00' : '',
    },
  });

  // Watch start time and auto-update end time
  const startDateTime = form.watch('startDateTime');
  useEffect(() => {
    if (startDateTime && !editBooking) { // Only auto-update for new bookings, not when editing
      const startDate = new Date(startDateTime);
      if (!isNaN(startDate.getTime())) {
        // Add 1 hour to start time for end time
        const endDate = addMinutes(startDate, 60);
        const endDateTimeString = format(endDate, 'yyyy-MM-dd') + 'T' + format(endDate, 'HH:mm');
        form.setValue('endDateTime', endDateTimeString);
      }
    }
  }, [startDateTime, form, editBooking]);

  // Update form when editing
  useEffect(() => {
    if (editBooking) {
      const startDate = parseISO(editBooking.startDateTime);
      const endDate = parseISO(editBooking.endDateTime);
      
      form.reset({
        title: editBooking.title,
        description: editBooking.description || '',
        roomId: editBooking.roomId,
        organizerStaffId: editBooking.organizerStaffId,
        expectedAttendees: editBooking.expectedAttendees || 1,
        startDateTime: format(startDate, "yyyy-MM-dd'T'HH:mm"),
        endDateTime: format(endDate, "yyyy-MM-dd'T'HH:mm"),
        cateringRequired: editBooking.cateringRequired || false,
        cateringNotes: editBooking.cateringNotes || '',
        technicalRequirements: editBooking.technicalRequirements || '',
        priority: editBooking.priority || 'normal',
        isRecurring: false, // Simplify for now
      });
    }
  }, [editBooking, form]);

  // Manual availability checking - no automatic watching to prevent infinite loops
  const manualCheckAvailability = () => {
    const roomId = form.getValues('roomId');
    const startDateTime = form.getValues('startDateTime');
    const endDateTime = form.getValues('endDateTime');
    
    if (roomId && startDateTime && endDateTime) {
      checkAvailability(roomId, startDateTime, endDateTime);
    }
  };

  const checkAvailability = async (roomId: string, startDateTime: string, endDateTime: string) => {
    if (!roomId || !startDateTime || !endDateTime) {
      setAvailabilityStatus(null);
      return;
    }
    
    try {
      setIsCheckingAvailability(true);
      setAvailabilityStatus('checking');
      
      // Convert to ISO format for consistency with booking creation
      const startISO = new Date(startDateTime).toISOString();
      const endISO = new Date(endDateTime).toISOString();
      
      const excludeParam = editBooking ? `&excludeBookingId=${editBooking.id}` : '';
      const url = `/api/room-bookings/check-availability?roomId=${encodeURIComponent(roomId)}&startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}${excludeParam}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to check availability');
      }
      
      const data = await response.json();
      
      if (data.available) {
        setAvailabilityStatus('available');
        setConflictingBookings([]);
      } else {
        setAvailabilityStatus('conflict');
        setConflictingBookings(data.conflicts || []);
      }
    } catch (error) {
      console.error('Availability check failed:', error);
      setAvailabilityStatus('error');
      setConflictingBookings([]);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const createBookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      return await apiRequest('POST', '/api/room-bookings', {
        ...data,
        tenantCompanyId: tenantId,
        status: 'confirmed',
        startDateTime: new Date(data.startDateTime).toISOString(),
        endDateTime: new Date(data.endDateTime).toISOString(),
        staffAttendeeIds: data.staffAttendeeIds || [],
        externalAttendeeEmails: data.externalAttendeeEmails || [],
      });
    },
    onSuccess: () => {
      toast({
        title: "Booking Created",
        description: "Room has been successfully booked.",
      });
      // Reset availability status and form
      setAvailabilityStatus(null);
      setConflictingBookings([]);
      form.reset();
      onOpenChange(false);
      // Invalidate bookings cache to refresh calendar
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === '/api/room-bookings'
      });
    },
    onError: (error) => {
      toast({
        title: "Booking Failed", 
        description: error.message || "Failed to create booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      return await apiRequest('PATCH', `/api/room-bookings/${editBooking.id}`, {
        ...data,
        startDateTime: new Date(data.startDateTime).toISOString(),
        endDateTime: new Date(data.endDateTime).toISOString(),
        staffAttendeeIds: data.staffAttendeeIds || [],
        externalAttendeeEmails: data.externalAttendeeEmails || [],
      });
    },
    onSuccess: () => {
      toast({
        title: "Booking Updated",
        description: "Room booking has been successfully updated.",
      });
      // Reset availability status
      setAvailabilityStatus(null);
      setConflictingBookings([]);
      onOpenChange(false);
      // Invalidate bookings cache to refresh calendar
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === '/api/room-bookings'
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BookingFormData) => {
    if (availabilityStatus === 'conflict') {
      toast({
        title: "Room Unavailable",
        description: "Please select a different time or room.",
        variant: "destructive",
      });
      return;
    }

    if (editBooking) {
      updateBookingMutation.mutate(data);
    } else {
      createBookingMutation.mutate(data);
    }
  };

  const selectedRoom = rooms.find(r => r.id === form.watch('roomId'));
  const isSubmitting = createBookingMutation.isPending || updateBookingMutation.isPending;

  const getAvailabilityIcon = () => {
    switch (availabilityStatus) {
      case 'checking':
        return <Clock className="h-4 w-4 animate-spin" />;
      case 'available':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'conflict':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getAvailabilityMessage = () => {
    switch (availabilityStatus) {
      case 'checking':
        return 'Checking availability...';
      case 'available':
        return 'Room is available!';
      case 'conflict':
        return `Room has ${conflictingBookings.length} conflicting booking${conflictingBookings.length !== 1 ? 's' : ''}`;
      case 'error':
        return 'Unable to check availability';
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-room-booking">
        <DialogHeader>
          <DialogTitle data-testid="text-form-title">
            {editBooking ? 'Edit Room Booking' : 'Book Meeting Room'}
          </DialogTitle>
          <DialogDescription>
            {editBooking ? 'Update booking details below' : 'Fill in the details to book a meeting room'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meeting Title</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Team Planning Session"
                              {...field}
                              data-testid="input-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Meeting agenda, objectives, or notes..."
                              rows={3}
                              {...field}
                              data-testid="input-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="organizerStaffId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organizer</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} data-testid="select-organizer">
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select organizer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {staff.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    {member.firstName} {member.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="expectedAttendees"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Attendees</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max="100"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                data-testid="input-attendees"
                                className={
                                  selectedRoom && field.value > selectedRoom.capacity 
                                    ? "border-red-500 focus:border-red-500" 
                                    : ""
                                }
                              />
                            </FormControl>
                            {selectedRoom && field.value > selectedRoom.capacity && (
                              <Alert className="border-red-200 bg-red-50 mt-2">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <AlertDescription className="text-red-800">
                                  Too many attendees! {selectedRoom.name} can only accommodate {selectedRoom.capacity} people.
                                </AlertDescription>
                              </Alert>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Staff Attendees */}
                    <FormField
                      control={form.control}
                      name="staffAttendeeIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Staff Attendees</FormLabel>
                          <FormDescription>
                            Select staff members who will attend this meeting
                          </FormDescription>
                          <div className="space-y-2">
                            {staff.map((member) => (
                              <div key={member.id} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`staff-${member.id}`}
                                  checked={field.value?.includes(member.id) || false}
                                  onChange={(e) => {
                                    const currentValue = field.value || [];
                                    if (e.target.checked) {
                                      field.onChange([...currentValue, member.id]);
                                    } else {
                                      field.onChange(currentValue.filter(id => id !== member.id));
                                    }
                                  }}
                                  data-testid={`checkbox-staff-${member.id}`}
                                  className="rounded border-gray-300"
                                />
                                <label htmlFor={`staff-${member.id}`} className="text-sm font-medium">
                                  {member.firstName} {member.lastName}
                                  <span className="text-muted-foreground ml-1">({member.email})</span>
                                </label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* External Attendee Emails */}
                    <FormField
                      control={form.control}
                      name="externalAttendeeEmails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>External Attendee Emails (Optional)</FormLabel>
                          <FormDescription>
                            Enter email addresses for external attendees (one per line)
                          </FormDescription>
                          <FormControl>
                            <Textarea
                              placeholder="john@example.com&#10;jane@company.com"
                              rows={3}
                              value={field.value?.join('\n') || ''}
                              onChange={(e) => {
                                const emails = e.target.value.split('\n').filter(email => email.trim() !== '');
                                field.onChange(emails);
                              }}
                              data-testid="textarea-external-emails"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Date and Time */}
                <Card>
                  <CardHeader>
                    <CardTitle>Date & Time</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startDateTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date & Time</FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                {...field}
                                data-testid="input-start-time"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endDateTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date & Time</FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                {...field}
                                data-testid="input-end-time"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Availability Check Button and Status */}
                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={manualCheckAvailability}
                        disabled={isCheckingAvailability}
                        data-testid="button-check-availability"
                        className="w-full"
                      >
                        {isCheckingAvailability ? (
                          <>
                            <Clock className="h-4 w-4 mr-2 animate-spin" />
                            Checking availability...
                          </>
                        ) : (
                          <>
                            <Calendar className="h-4 w-4 mr-2" />
                            Check Availability
                          </>
                        )}
                      </Button>

                      {availabilityStatus && !isCheckingAvailability && (
                        <Alert className={
                          availabilityStatus === 'available' ? 'border-green-200 bg-green-50' :
                          availabilityStatus === 'conflict' ? 'border-red-200 bg-red-50' :
                          'border-yellow-200 bg-yellow-50'
                        }>
                          <div className="flex items-center gap-2">
                            {getAvailabilityIcon()}
                            <AlertDescription data-testid="text-availability-status">
                              {getAvailabilityMessage()}
                            </AlertDescription>
                          </div>
                        </Alert>
                      )}
                    </div>

                    {/* Conflicting Bookings */}
                    {conflictingBookings.length > 0 && (
                      <Card className="border-red-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-red-800">
                            Conflicting Bookings
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-32">
                            <div className="space-y-2">
                              {conflictingBookings.map((conflict, index) => (
                                <div
                                  key={index}
                                  className="text-sm p-2 bg-red-50 rounded border"
                                  data-testid={`conflict-booking-${index}`}
                                >
                                  <div className="font-medium">{conflict.title}</div>
                                  <div className="text-muted-foreground">
                                    {format(parseISO(conflict.startDateTime), 'HH:mm')} - {format(parseISO(conflict.endDateTime), 'HH:mm')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>

                {/* Additional Options */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Requirements</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} data-testid="select-priority">
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="technicalRequirements"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Technical Requirements</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Special equipment, video conferencing setup, etc."
                              rows={2}
                              {...field}
                              data-testid="input-technical-requirements"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="cateringNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Catering Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Coffee, refreshments, dietary requirements..."
                              rows={2}
                              {...field}
                              data-testid="input-catering-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Room Selection & Details */}
              <div className="lg:col-span-1">
                <Card className="sticky top-6">
                  <CardHeader>
                    <CardTitle>Room Selection</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="roomId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meeting Room</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} data-testid="select-room">
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a room" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {rooms.map((room) => (
                                <SelectItem key={room.id} value={room.id}>
                                  {room.name} (Capacity: {room.capacity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Room Details */}
                    {selectedRoom && (
                      <div className="space-y-4 pt-4 border-t">
                        <div>
                          <h4 className="font-medium mb-2" data-testid={`text-room-name-${selectedRoom.id}`}>
                            {selectedRoom.name}
                          </h4>
                          <p className="text-sm text-muted-foreground mb-3" data-testid={`text-room-description-${selectedRoom.id}`}>
                            {selectedRoom.description}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`text-room-location-${selectedRoom.id}`}>{selectedRoom.location}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Users className="h-4 w-4" />
                            <span data-testid={`text-room-capacity-${selectedRoom.id}`}>
                              {selectedRoom.capacity} people
                            </span>
                          </div>
                        </div>

                        {/* Amenities */}
                        <div>
                          <h5 className="font-medium text-sm mb-2">Amenities</h5>
                          <div className="flex flex-wrap gap-2">
                            {selectedRoom.hasProjector && (
                              <Badge variant="secondary" className="text-xs">
                                <Monitor className="h-3 w-3 mr-1" />
                                Projector
                              </Badge>
                            )}
                            {selectedRoom.hasVideoConference && (
                              <Badge variant="secondary" className="text-xs">
                                <Wifi className="h-3 w-3 mr-1" />
                                Video Conf
                              </Badge>
                            )}
                            {selectedRoom.hasCatering && (
                              <Badge variant="secondary" className="text-xs">
                                <Coffee className="h-3 w-3 mr-1" />
                                Catering
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-4 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || availabilityStatus === 'conflict' || isCheckingAvailability}
                data-testid="button-submit"
              >
                {isSubmitting ? 'Saving...' : editBooking ? 'Update Booking' : 'Create Booking'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}