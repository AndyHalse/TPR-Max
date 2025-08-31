import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CalendarDays, Clock, Users, MapPin, Eye, Edit, Trash2, Plus } from 'lucide-react';
import { format, addDays, startOfDay, endOfDay, isSameDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { RoomBooking, MeetingRoom } from '@shared/schema';

interface BookingWithDetails extends RoomBooking {
  room: MeetingRoom;
  organizer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface RoomBookingCalendarProps {
  selectedRoomId?: string;
  onBookingSelect?: (booking: BookingWithDetails) => void;
  onCreateBooking?: (date: Date, roomId?: string) => void;
  tenantId?: string;
}

export function RoomBookingCalendar({
  selectedRoomId,
  onBookingSelect,
  onCreateBooking,
  tenantId
}: RoomBookingCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  // Calculate date range for fetching bookings (current month + next month)
  const startDate = startOfDay(selectedDate);
  const endDate = endOfDay(addDays(startDate, 60)); // 60 days range

  const { data: bookings = [], isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/room-bookings', {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      room_id: selectedRoomId,
      tenant_id: tenantId
    }],
  });

  const { data: rooms = [] } = useQuery<MeetingRoom[]>({
    queryKey: ['/api/meeting-rooms'],
  });

  // Group bookings by date
  const bookingsByDate = bookings.reduce((acc, booking) => {
    const dateKey = format(parseISO(booking.startDateTime as any), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(booking);
    return acc;
  }, {} as Record<string, BookingWithDetails[]>);

  // Get bookings for selected date
  const selectedDateBookings = bookingsByDate[format(selectedDate, 'yyyy-MM-dd')] || [];

  // Function to determine if a date has bookings
  const getDateBookingCount = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return bookingsByDate[dateKey]?.length || 0;
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      case 'completed': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTime = (dateTime: string) => {
    return format(parseISO(dateTime), 'HH:mm');
  };

  const formatDuration = (start: string, end: string) => {
    const startTime = parseISO(start);
    const endTime = parseISO(end);
    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  const BookingCard = ({ booking }: { booking: BookingWithDetails }) => (
    <Card className="mb-3 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h4 className="font-semibold text-lg mb-1" data-testid={`booking-title-${booking.id}`}>
              {booking.title}
            </h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Clock className="h-4 w-4" />
              <span data-testid={`booking-time-${booking.id}`}>
                {formatTime(booking.startDateTime as any)} - {formatTime(booking.endDateTime as any)}
              </span>
              <span className="text-xs bg-muted px-2 py-1 rounded">
                {formatDuration(booking.startDateTime as any, booking.endDateTime as any)}
              </span>
            </div>
          </div>
          <Badge className={getStatusColor(booking.status)} data-testid={`booking-status-${booking.id}`}>
            {booking.status}
          </Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span data-testid={`booking-room-${booking.id}`}>{booking.room.name}</span>
            <span className="text-muted-foreground">({booking.room.location})</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span data-testid={`booking-organizer-${booking.id}`}>
              {booking.organizer.firstName} {booking.organizer.lastName}
            </span>
            <span className="text-muted-foreground">• {booking.expectedAttendees || 1} attendees</span>
          </div>

          {booking.description && (
            <p className="text-muted-foreground mt-2" data-testid={`booking-description-${booking.id}`}>
              {booking.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBookingSelect?.(booking)}
            data-testid={`button-view-${booking.id}`}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          {booking.status !== 'cancelled' && booking.status !== 'completed' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBookingSelect?.(booking)}
                data-testid={`button-edit-${booking.id}`}
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => onBookingSelect?.(booking)}
                data-testid={`button-cancel-${booking.id}`}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header with view mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-calendar-title">
            Room Booking Calendar
          </h2>
          <p className="text-muted-foreground">
            {selectedRoomId ? `Bookings for selected room` : 'All room bookings'}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            onClick={() => setViewMode('calendar')}
            data-testid="button-calendar-view"
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Calendar
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            onClick={() => setViewMode('list')}
            data-testid="button-list-view"
          >
            <Users className="h-4 w-4 mr-2" />
            List
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Calendar</CardTitle>
                <CardDescription>
                  Select a date to view bookings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  className="rounded-md border"
                  modifiers={{
                    hasBookings: (date) => getDateBookingCount(date) > 0
                  }}
                  modifiersClassNames={{
                    hasBookings: 'bg-blue-100 text-blue-900 font-semibold'
                  }}
                  data-testid="calendar-picker"
                />
                
                {onCreateBooking && (
                  <Button
                    className="w-full mt-4"
                    onClick={() => onCreateBooking(selectedDate, selectedRoomId)}
                    data-testid="button-create-booking"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Book Room
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bookings List */}
        <div className={cn(
          viewMode === 'calendar' ? 'lg:col-span-2' : 'lg:col-span-3'
        )}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle data-testid="text-bookings-date">
                    Bookings for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </CardTitle>
                  <CardDescription>
                    {selectedDateBookings.length} booking{selectedDateBookings.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
                
                {onCreateBooking && (
                  <Button
                    onClick={() => onCreateBooking(selectedDate, selectedRoomId)}
                    data-testid="button-create-booking-header"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Booking
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">Loading bookings...</div>
                </div>
              ) : selectedDateBookings.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-muted-foreground mb-4">
                    No bookings found for this date
                  </div>
                  {onCreateBooking && (
                    <Button
                      variant="outline"
                      onClick={() => onCreateBooking(selectedDate, selectedRoomId)}
                      data-testid="button-create-first-booking"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Booking
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {selectedDateBookings
                      .sort((a, b) => new Date(a.startDateTime as any).getTime() - new Date(b.startDateTime as any).getTime())
                      .map((booking) => (
                        <BookingCard key={booking.id} booking={booking} />
                      ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Room availability summary */}
      {viewMode === 'calendar' && rooms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Room Availability Summary</CardTitle>
            <CardDescription>
              Quick overview of room availability for {format(selectedDate, 'MMMM d, yyyy')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.slice(0, 6).map((room) => {
                const roomBookings = selectedDateBookings.filter(b => b.roomId === room.id);
                const isAvailable = roomBookings.length === 0;
                
                return (
                  <div
                    key={room.id}
                    className={cn(
                      "p-4 rounded-lg border transition-colors",
                      isAvailable 
                        ? "bg-green-50 border-green-200" 
                        : "bg-orange-50 border-orange-200"
                    )}
                    data-testid={`room-availability-${room.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{room.name}</h4>
                      <Badge
                        variant={isAvailable ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {isAvailable ? 'Available' : `${roomBookings.length} booking${roomBookings.length !== 1 ? 's' : ''}`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {room.location}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3 w-3" />
                      <span>{room.capacity} capacity</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}