import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMeetingRoomSchema } from "@shared/schema";
import type { InsertMeetingRoom, MeetingRoom } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { RoomBookingCalendar } from "@/components/RoomBookingCalendar";
import { RoomBookingForm } from "@/components/RoomBookingForm";
import { 
  Plus, 
  Edit, 
  Trash2, 
  MapPin, 
  Users, 
  Projector, 
  Video, 
  Tv, 
  Snowflake,
  PenTool,
  Calendar,
  CalendarDays,
  Settings
} from "lucide-react";

export default function MeetingRooms() {
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState<Date>(new Date());
  const [editBooking, setEditBooking] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('rooms');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch meeting rooms
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["/api/meeting-rooms"],
  });

  const form = useForm<InsertMeetingRoom>({
    resolver: zodResolver(insertMeetingRoomSchema),
    defaultValues: {
      name: "",
      location: "",
      capacity: 2,
      description: "",
      hasProjector: false,
      hasVideoConference: false,
      hasWhiteboard: false,
      hasTV: false,
      hasAirCon: false,
      hasCatering: false,
      isActive: true,
      isSharedRoom: true,
      tenantCompanyId: null,
    },
  });

  // Create/Update room mutation
  const roomMutation = useMutation({
    mutationFn: async (data: InsertMeetingRoom) => {
      if (isEditMode && selectedRoom) {
        return await apiRequest("PATCH", `/api/meeting-rooms/${selectedRoom.id}`, data);
      } else {
        return await apiRequest("POST", "/api/meeting-rooms", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-rooms"] });
      toast({
        title: isEditMode ? "Room Updated" : "Room Created",
        description: `Meeting room has been ${isEditMode ? "updated" : "created"} successfully.`,
      });
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete room mutation
  const deleteMutation = useMutation({
    mutationFn: async (roomId: string) => {
      await apiRequest("DELETE", `/api/meeting-rooms/${roomId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-rooms"] });
      toast({
        title: "Room Deleted",
        description: "Meeting room has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    form.reset();
    setSelectedRoom(null);
    setIsEditMode(false);
    setIsDialogOpen(false);
  };

  const handleEdit = (room: MeetingRoom) => {
    setSelectedRoom(room);
    setIsEditMode(true);
    form.reset({
      name: room.name,
      location: room.location,
      capacity: room.capacity,
      description: room.description || "",
      hasProjector: room.hasProjector,
      hasVideoConference: room.hasVideoConference,
      hasWhiteboard: room.hasWhiteboard,
      hasTV: room.hasTV,
      hasAirCon: room.hasAirCon,
      hasCatering: room.hasCatering,
      isActive: room.isActive,
      isSharedRoom: room.isSharedRoom,
      tenantCompanyId: room.tenantCompanyId,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (room: MeetingRoom) => {
    if (confirm(`Are you sure you want to delete "${room.name}"?`)) {
      deleteMutation.mutate(room.id);
    }
  };

  const onSubmit = (data: InsertMeetingRoom) => {
    roomMutation.mutate(data);
  };

  const getFacilityIcons = (room: MeetingRoom) => {
    const icons = [];
    if (room.hasProjector) icons.push(<Projector key="projector" className="h-4 w-4" />);
    if (room.hasVideoConference) icons.push(<Video key="video" className="h-4 w-4" />);
    if (room.hasTV) icons.push(<Tv key="tv" className="h-4 w-4" />);
    if (room.hasWhiteboard) icons.push(<PenTool key="whiteboard" className="h-4 w-4" />);
    if (room.hasAirCon) icons.push(<Snowflake key="aircon" className="h-4 w-4" />);
    return icons;
  };

  const getCapacityColor = (capacity: number) => {
    if (capacity <= 4) return "bg-green-100 text-green-800 border-green-200";
    if (capacity <= 10) return "bg-blue-100 text-blue-800 border-blue-200";
    return "bg-purple-100 text-purple-800 border-purple-200";
  };

  const getAllocationTypeColor = (isShared: boolean) => {
    return isShared 
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : "bg-orange-100 text-orange-800 border-orange-200";
  };

  const handleCreateBooking = (date: Date, roomId?: string) => {
    setSelectedBookingDate(date);
    setSelectedRoom(roomId ? rooms.find(r => r.id === roomId) || null : null);
    setEditBooking(null);
    setIsBookingFormOpen(true);
  };

  const [viewBooking, setViewBooking] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const handleBookingView = (booking: any) => {
    setViewBooking(booking);
    setIsViewDialogOpen(true);
  };

  const handleBookingEdit = (booking: any) => {
    // Map API response fields to form expected fields
    const mappedBooking = {
      ...booking,
      roomId: booking.meetingRoomId,
      bookedByStaffId: booking.bookedByStaffId,
      startDateTime: booking.startTime,
      endDateTime: booking.endTime,
      attendees: booking.attendees || [], // Pass attendees array for form to extract staffAttendeeIds
    };
    setEditBooking(mappedBooking);
    setIsBookingFormOpen(true);
  };

  const handleBookingCancel = async (booking: any) => {
    if (confirm('Are you sure you want to cancel this booking?')) {
      try {
        await apiRequest('DELETE', `/api/room-bookings/${booking.id}`);
        queryClient.invalidateQueries({ queryKey: ['/api/room-bookings'] });
        toast({
          title: 'Booking Cancelled',
          description: 'The booking has been cancelled successfully.',
        });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-fixed">
            Meeting Rooms & Booking Management
          </h1>
          <p className="text-sm sm:text-base text-variable mt-1 hidden sm:block">
            Manage meeting rooms, view bookings calendar, and create new reservations
          </p>
        </div>

        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Button 
            onClick={() => {
              handleCreateBooking(new Date());
            }}
            data-testid="button-quick-book"
            variant="outline"
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white border-0 text-xs sm:text-sm whitespace-nowrap"
          >
            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
            Quick Book
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(true);
                }}
                data-testid="button-create-room"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-xs sm:text-sm whitespace-nowrap"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
                Add Meeting Room
              </Button>
            </DialogTrigger>
          
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isEditMode ? "Edit Meeting Room" : "Create New Meeting Room"}
              </DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Room Name *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g., Conference Room A"
                            data-testid="input-room-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g., 2nd Floor, East Wing"
                            data-testid="input-room-location"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacity *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="2" 
                            max="100"
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 2)}
                            data-testid="input-room-capacity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isSharedRoom"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">Shared Room</FormLabel>
                          <p className="text-xs text-variable">Available to all tenants</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-is-shared"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">Active</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-room-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Brief description of the room..."
                          rows={3}
                          data-testid="textarea-room-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Room Facilities</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="hasProjector"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">📽️ Projector</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-has-projector"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hasVideoConference"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">📹 Video Conference</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-has-video"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hasTV"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">📺 TV Screen</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-has-tv"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hasWhiteboard"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">📝 Whiteboard</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-has-whiteboard"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hasAirCon"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">❄️ Air Conditioning</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-has-aircon"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hasCatering"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">🍽️ Catering Available</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-has-catering"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <DialogFooter className="flex gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetForm}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={roomMutation.isPending}
                    data-testid="button-save-room"
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {roomMutation.isPending 
                      ? (isEditMode ? "Updating..." : "Creating...") 
                      : (isEditMode ? "Update Room" : "Create Room")
                    }
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs for Rooms and Bookings */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 gap-2">
          <TabsTrigger value="rooms" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" data-testid="tab-rooms">
            <Settings className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Manage Rooms</span>
            <span className="sm:hidden">Rooms</span>
          </TabsTrigger>
          <TabsTrigger value="bookings" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" data-testid="tab-bookings">
            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Booking Calendar</span>
            <span className="sm:hidden">Calendar</span>
          </TabsTrigger>
        </TabsList>

        {/* Rooms Management Tab */}
        <TabsContent value="rooms" className="space-y-6">
          {/* Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room: MeetingRoom) => (
          <Card 
            key={room.id} 
            className={`transition-all duration-200 hover:shadow-lg ${!room.isActive ? 'opacity-60' : ''}`}
            data-testid={`card-room-${room.id}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg font-semibold text-fixed">
                    {room.name}
                  </CardTitle>
                  <div className="flex items-center text-sm text-variable mt-1">
                    <MapPin className="h-4 w-4 mr-1" />
                    {room.location}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(room)}
                    data-testid={`button-edit-${room.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(room)}
                    className="hover:bg-red-50 hover:border-red-200"
                    data-testid={`button-delete-${room.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                {/* Capacity & Type Badges */}
                <div className="flex gap-2">
                  <Badge className={`${getCapacityColor(room.capacity)} border`}>
                    <Users className="h-3 w-3 mr-1" />
                    {room.capacity} people
                  </Badge>
                  <Badge className={`${getAllocationTypeColor(room.isSharedRoom)} border`}>
                    {room.isSharedRoom ? '🌐 Shared' : '🏢 Tenant Only'}
                  </Badge>
                  {!room.isActive && (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-gray-300">
                      Inactive
                    </Badge>
                  )}
                </div>

                {/* Description */}
                {room.description && (
                  <p className="text-sm text-variable line-clamp-2">
                    {room.description}
                  </p>
                )}

                {/* Facilities */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-variable">
                    Facilities:
                  </span>
                  {getFacilityIcons(room).length > 0 ? (
                    <div className="flex gap-2 text-variable">
                      {getFacilityIcons(room)}
                    </div>
                  ) : (
                    <span className="text-xs text-variable">Basic room</span>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 mt-3">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      setSelectedRoom(room);
                      setActiveTab('bookings');
                    }}
                    data-testid={`button-view-bookings-${room.id}`}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    View Bookings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

        {/* Empty State for Rooms */}
        {rooms.length === 0 && (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <MapPin className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-fixed">No Meeting Rooms</h3>
                <p className="text-variable mt-1">
                  Get started by creating your first meeting room.
                </p>
              </div>
              <Button 
                onClick={() => setIsDialogOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-create-first-room"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Meeting Room
              </Button>
            </div>
          </Card>
        )}
        </TabsContent>

        {/* Booking Calendar Tab */}
        <TabsContent value="bookings" className="space-y-6">
          <RoomBookingCalendar
            selectedRoomId={selectedRoom?.id}
            onBookingView={handleBookingView}
            onBookingEdit={handleBookingEdit}
            onBookingCancel={handleBookingCancel}
            onCreateBooking={handleCreateBooking}
            tenantId="0f97f5a9-2b83-45ae-9ebf-cead4a9abd6a"
          />
        </TabsContent>
      </Tabs>

      {/* Room Booking Form Dialog */}
      <RoomBookingForm
        open={isBookingFormOpen}
        onOpenChange={setIsBookingFormOpen}
        selectedDate={selectedBookingDate}
        selectedRoomId={selectedRoom?.id}
        editBooking={editBooking}
      />

      {/* View Booking Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-view-booking">
          <DialogHeader>
            <DialogTitle data-testid="text-view-title">Booking Details</DialogTitle>
          </DialogHeader>
          {viewBooking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Title</h4>
                  <p className="text-lg font-semibold" data-testid="text-booking-title">{viewBooking.title}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <Badge className="mt-1" data-testid="badge-booking-status">{viewBooking.status}</Badge>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Room</h4>
                  <p className="font-medium" data-testid="text-booking-room">
                    {viewBooking.room?.name || 'Unknown Room'}
                  </p>
                  <p className="text-sm text-muted-foreground">{viewBooking.room?.location}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Organizer</h4>
                  <p className="font-medium" data-testid="text-booking-organizer">
                    {viewBooking.organizer ? 
                      `${viewBooking.organizer.firstName} ${viewBooking.organizer.lastName}` : 
                      'Unknown'}
                  </p>
                  <p className="text-sm text-muted-foreground">{viewBooking.organizer?.email}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Start Time</h4>
                  <p className="font-medium" data-testid="text-booking-start">
                    {viewBooking.startTime ? new Date(viewBooking.startTime).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">End Time</h4>
                  <p className="font-medium" data-testid="text-booking-end">
                    {viewBooking.endTime ? new Date(viewBooking.endTime).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Expected Attendees</h4>
                <p className="font-medium" data-testid="text-booking-attendees">
                  {viewBooking.expectedAttendees || 1} people
                </p>
              </div>

              {viewBooking.description && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                    <p className="mt-1" data-testid="text-booking-description">{viewBooking.description}</p>
                  </div>
                </>
              )}

              {viewBooking.requiresCatering && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Catering</h4>
                    <p className="mt-1">Required</p>
                    {viewBooking.cateringNotes && (
                      <p className="text-sm text-muted-foreground mt-1">{viewBooking.cateringNotes}</p>
                    )}
                  </div>
                </>
              )}

              {viewBooking.specialRequirements && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Special Requirements</h4>
                    <p className="mt-1">{viewBooking.specialRequirements}</p>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsViewDialogOpen(false)}
              data-testid="button-close-view"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}