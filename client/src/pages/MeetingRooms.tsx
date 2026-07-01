import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMeetingRoomSchema } from "@shared/schema";
import type { InsertMeetingRoom, MeetingRoom, RoomFacilityType } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { RoomBookingCalendar } from "@/components/RoomBookingCalendar";
import { RoomBookingForm } from "@/components/RoomBookingForm";
import GlassCard from "@/components/GlassCard";
import { format } from "date-fns";
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
  Settings,
  DoorOpen,
  Repeat,
  UserCheck,
  Mail,
  Info,
  Tag,
  Wrench,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Standard facility definitions ─────────────────────────────────────────
const STANDARD_FACILITIES = [
  { key: "hasProjector",       label: "Projector",          icon: <Projector className="h-3 w-3" /> },
  { key: "hasVideoConference", label: "Video Conference",    icon: <Video className="h-3 w-3" /> },
  { key: "hasTV",              label: "TV Screen",          icon: <Tv className="h-3 w-3" /> },
  { key: "hasWhiteboard",      label: "Whiteboard",         icon: <PenTool className="h-3 w-3" /> },
  { key: "hasAirCon",          label: "Air Conditioning",   icon: <Snowflake className="h-3 w-3" /> },
  { key: "hasCatering",        label: "Catering Available", icon: <span className="text-[10px]">🍽</span> },
] as const;

type StandardFacilityKey = typeof STANDARD_FACILITIES[number]["key"];

export default function MeetingRooms() {
  const { t } = useTranslation("meetingRooms");
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState<Date>(new Date());
  const [editBooking, setEditBooking] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("rooms");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Custom facilities state for the room dialog (separate from the form)
  const [selectedCustomFacilities, setSelectedCustomFacilities] = useState<string[]>([]);

  // Facility type management state
  const [newFacilityName, setNewFacilityName] = useState("");
  const [newFacilityIcon, setNewFacilityIcon] = useState("🏷");
  const [editingFacility, setEditingFacility] = useState<RoomFacilityType | null>(null);
  const [editFacilityName, setEditFacilityName] = useState("");
  const [editFacilityIcon, setEditFacilityIcon] = useState("🏷");

  // Queries
  const { data: rooms = [], isLoading } = useQuery<MeetingRoom[]>({
    queryKey: ["/api/meeting-rooms"],
  });

  const { data: facilityTypes = [] } = useQuery<RoomFacilityType[]>({
    queryKey: ["/api/meeting-room-facility-types"],
  });

  const activeFacilityTypes = facilityTypes.filter((ft) => ft.isActive);

  // Room form
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
    },
  });

  // Room CRUD mutations
  const roomMutation = useMutation({
    mutationFn: async (data: InsertMeetingRoom) => {
      const payload = { ...data, customFacilities: selectedCustomFacilities };
      if (isEditMode && selectedRoom) {
        const res = await apiRequest("PATCH", `/api/meeting-rooms/${selectedRoom.id}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/meeting-rooms", payload);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-rooms"] });
      toast({
        title: isEditMode ? t("toast.roomUpdated") : t("toast.roomCreated"),
        description: isEditMode ? t("toast.roomUpdatedDesc") : t("toast.roomCreatedDesc"),
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (roomId: string) => {
      await apiRequest("DELETE", `/api/meeting-rooms/${roomId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-rooms"] });
      toast({ title: t("toast.roomDeleted"), description: t("toast.roomDeletedDesc") });
    },
    onError: (error: any) => {
      toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
    },
  });

  // Facility type mutations
  const createFacilityMutation = useMutation({
    mutationFn: async ({ name, icon }: { name: string; icon: string }) => {
      const res = await apiRequest("POST", "/api/meeting-room-facility-types", { name, icon });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-room-facility-types"] });
      setNewFacilityName("");
      setNewFacilityIcon("🏷");
      toast({ title: "Facility type added" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateFacilityMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; icon?: string; isActive?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/meeting-room-facility-types/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-room-facility-types"] });
      setEditingFacility(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteFacilityMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/meeting-room-facility-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-room-facility-types"] });
      toast({ title: "Facility type removed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    form.reset();
    setSelectedCustomFacilities([]);
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
      hasProjector: (room as any).hasProjector,
      hasVideoConference: (room as any).hasVideoConference,
      hasWhiteboard: (room as any).hasWhiteboard,
      hasTV: (room as any).hasTV,
      hasAirCon: (room as any).hasAirCon,
      hasCatering: (room as any).hasCatering,
      isActive: room.isActive,
    });
    setSelectedCustomFacilities((room as any).customFacilities ?? []);
    setIsDialogOpen(true);
  };

  const handleDelete = (room: MeetingRoom) => {
    if (confirm(t("confirmDelete", { name: room.name }))) {
      deleteMutation.mutate(room.id);
    }
  };

  const onSubmit = (data: InsertMeetingRoom) => roomMutation.mutate(data);

  const toggleCustomFacility = (id: string) => {
    setSelectedCustomFacilities((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ── Room card helpers ─────────────────────────────────────────────────────
  const getFacilityLabels = (room: MeetingRoom) => {
    const labels: { icon: any; label: string }[] = [];
    const r = room as any;
    STANDARD_FACILITIES.forEach(({ key, label, icon }) => {
      if (r[key]) labels.push({ icon, label });
    });
    const customIds: string[] = r.customFacilities ?? [];
    customIds.forEach((id) => {
      const ft = facilityTypes.find((x) => x.id === id);
      if (ft) labels.push({ icon: <span className="text-[10px]">{ft.icon}</span>, label: ft.name });
    });
    return labels;
  };

  const getCapacityColor = (capacity: number) => {
    if (capacity <= 4) return "bg-green-100 text-green-800 border-green-200";
    if (capacity <= 10) return "bg-blue-100 text-blue-800 border-blue-200";
    return "bg-purple-100 text-purple-800 border-purple-200";
  };

  const getRoomGradient = (index: number) => {
    const gradients = [
      "bg-gradient-to-br from-blue-500 to-indigo-600",
      "bg-gradient-to-br from-purple-500 to-pink-600",
      "bg-gradient-to-br from-emerald-500 to-teal-600",
      "bg-gradient-to-br from-orange-500 to-amber-600",
      "bg-gradient-to-br from-rose-500 to-red-600",
      "bg-gradient-to-br from-cyan-500 to-blue-600",
    ];
    return gradients[index % gradients.length];
  };

  const handleCreateBooking = (date: Date, roomId?: string) => {
    setSelectedBookingDate(date);
    setSelectedRoom(roomId ? rooms.find((r) => r.id === roomId) || null : null);
    setEditBooking(null);
    setIsBookingFormOpen(true);
  };

  const [viewBooking, setViewBooking] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const handleBookingView = (booking: any) => { setViewBooking(booking); setIsViewDialogOpen(true); };
  const handleBookingEdit = (booking: any) => {
    setEditBooking({ ...booking, roomId: booking.meetingRoomId, startDateTime: booking.startTime, endDateTime: booking.endTime, attendees: booking.attendees || [] });
    setIsBookingFormOpen(true);
  };
  const handleBookingCancel = async (booking: any) => {
    if (confirm(t("confirmCancelBooking"))) {
      try {
        await apiRequest("POST", `/api/room-bookings/${booking.id}/cancel`, {});
        queryClient.invalidateQueries({ queryKey: ["/api/room-bookings"] });
        toast({ title: t("toast.bookingCancelled"), description: t("toast.bookingCancelledDesc") });
      } catch (error: any) {
        toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-fixed">{t("title")}</h1>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 hover:text-blue-500 cursor-pointer flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs"><p>{t("titleTooltip")}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm sm:text-base text-variable mt-1 hidden sm:block">{t("subtitle")}</p>
        </div>

        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Button
            onClick={() => handleCreateBooking(new Date())}
            data-testid="button-quick-book"
            variant="outline"
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white border-0 text-xs sm:text-sm whitespace-nowrap"
          >
            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
            {t("quickBook")}
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => { resetForm(); setIsDialogOpen(true); }}
                data-testid="button-create-room"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-xs sm:text-sm whitespace-nowrap"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
                {t("addMeetingRoom")}
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{isEditMode ? t("roomForm.editTitle") : t("roomForm.createTitle")}</DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("roomForm.roomName")}</FormLabel>
                        <FormControl><Input {...field} data-testid="input-room-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="location" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("roomForm.location")}</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-room-location" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="capacity" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("roomForm.capacity")}</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="100" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} data-testid="input-room-capacity" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="isActive" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5"><FormLabel className="text-sm font-medium">{t("roomForm.active")}</FormLabel></div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-room-active" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("roomForm.description")}</FormLabel>
                      <FormControl><Textarea {...field} value={field.value ?? ""} placeholder={t("roomForm.descriptionPlaceholder")} rows={3} data-testid="textarea-room-description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Separator />

                  {/* Standard Facilities */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-variable uppercase tracking-wide">{t("roomForm.facilities")} — Standard</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {STANDARD_FACILITIES.map(({ key, label }) => (
                        <FormField key={key} control={form.control} name={key as StandardFacilityKey} render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5"><FormLabel className="text-sm font-medium">{label}</FormLabel></div>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                  </div>

                  {/* Custom Facilities */}
                  {activeFacilityTypes.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-variable uppercase tracking-wide">
                          {t("roomForm.facilities")} — Custom
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {activeFacilityTypes.map((ft) => (
                            <div key={ft.id} className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <span className="text-sm font-medium">
                                {ft.icon} {ft.name}
                              </span>
                              <Switch
                                checked={selectedCustomFacilities.includes(ft.id)}
                                onCheckedChange={() => toggleCustomFacility(ft.id)}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-variable">
                          Manage custom facility types in the <button type="button" className="underline text-blue-600" onClick={() => { setIsDialogOpen(false); setActiveTab("facilities"); }}>Room Facilities</button> settings tab.
                        </p>
                      </div>
                    </>
                  )}

                  <DialogFooter className="flex gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={resetForm} data-testid="button-cancel">
                      {t("common:cancel")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={roomMutation.isPending}
                      data-testid="button-save-room"
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {roomMutation.isPending
                        ? (isEditMode ? t("roomForm.updating") : t("roomForm.creating"))
                        : (isEditMode ? t("roomForm.updateRoom") : t("roomForm.createRoom"))}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 gap-2">
          <TabsTrigger value="rooms" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" data-testid="tab-rooms">
            <Settings className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">{t("tabs.manageRooms")}</span>
            <span className="sm:hidden">{t("tabs.rooms")}</span>
          </TabsTrigger>
          <TabsTrigger value="bookings" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" data-testid="tab-bookings">
            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">{t("tabs.bookingCalendar")}</span>
            <span className="sm:hidden">{t("tabs.calendar")}</span>
          </TabsTrigger>
          <TabsTrigger value="facilities" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" data-testid="tab-facilities">
            <Wrench className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Room Facilities</span>
            <span className="sm:hidden">Facilities</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Rooms Management Tab ─────────────────────────────────────────── */}
        <TabsContent value="rooms" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room: MeetingRoom, index: number) => (
              <GlassCard key={room.id} hover className={`p-4 ${!room.isActive ? "opacity-60" : ""}`} data-testid={`card-room-${room.id}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 ${getRoomGradient(index)} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <DoorOpen className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-semibold text-fixed text-sm truncate">{room.name}</h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${room.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {room.isActive ? t("card.available") : t("card.inactive")}
                      </span>
                    </div>
                    <div className="flex items-center text-xs text-variable mt-0.5">
                      <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="truncate">{room.location}</span>
                    </div>
                    {room.description && <p className="text-xs text-variable/70 mt-0.5 line-clamp-1">{room.description}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${getCapacityColor(room.capacity)}`}>
                    <Users className="h-3 w-3" />
                    {t("card.people", { count: room.capacity })}
                  </span>
                </div>

                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    <span className="text-[10px] font-medium text-variable">{t("card.facilitiesLabel")}</span>
                    {getFacilityLabels(room).length > 0 ? (
                      getFacilityLabels(room).map(({ icon, label }) => (
                        <Tooltip key={label}>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/50 border border-white/40 text-variable cursor-default">
                              {icon} {label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p>{label}</p></TooltipContent>
                        </Tooltip>
                      ))
                    ) : (
                      <span className="text-[10px] text-variable">{t("card.basicRoom")}</span>
                    )}
                  </div>
                </TooltipProvider>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                  <div className="flex items-center gap-1">
                    <TooltipProvider delayDuration={400}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(room)} className="h-8 w-8 p-0" data-testid={`button-edit-${room.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{t("common:edit")}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider delayDuration={400}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(room)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`button-delete-${room.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{t("common:delete")}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setSelectedRoom(room); setActiveTab("bookings"); }} className="h-9 px-3 text-sm font-medium text-blue-600 hover:text-blue-700 border-blue-300 hover:border-blue-400 hover:bg-blue-50" data-testid={`button-view-bookings-${room.id}`}>
                    <Calendar className="h-4 w-4 mr-1.5" />
                    {t("card.viewBookings")}
                  </Button>
                </div>
              </GlassCard>
            ))}
          </div>

          {rooms.length === 0 && (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <MapPin className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-fixed">{t("empty.title")}</h3>
                  <p className="text-variable mt-1">{t("empty.description")}</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" data-testid="button-create-first-room">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("empty.createButton")}
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── Booking Calendar Tab ──────────────────────────────────────────── */}
        <TabsContent value="bookings" className="space-y-6">
          <RoomBookingCalendar
            selectedRoomId={selectedRoom?.id}
            onBookingView={handleBookingView}
            onBookingEdit={handleBookingEdit}
            onBookingCancel={handleBookingCancel}
            onCreateBooking={handleCreateBooking}
          />
        </TabsContent>

        {/* ── Room Facilities Settings Tab ──────────────────────────────────── */}
        <TabsContent value="facilities" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Standard facilities — read-only reference */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-500" />
                  Standard Facilities
                </CardTitle>
                <p className="text-xs text-variable">Built-in facility options available on all accounts. These cannot be removed.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {STANDARD_FACILITIES.map(({ key, label, icon }) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2.5 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{icon}</span>
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Built-in</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Custom facility types */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-purple-500" />
                    Custom Facility Types
                  </CardTitle>
                  <p className="text-xs text-variable">Add your own facility types — e.g. Examination Table, Ultrasound Machine, Oxygen Point.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Add new facility form */}
                  <div className="flex gap-2 items-end">
                    <div className="w-14">
                      <label className="text-xs font-medium text-variable mb-1 block">Icon</label>
                      <Input
                        value={newFacilityIcon}
                        onChange={(e) => setNewFacilityIcon(e.target.value)}
                        maxLength={4}
                        className="text-center text-lg px-1"
                        placeholder="🏷"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-variable mb-1 block">Facility Name *</label>
                      <Input
                        value={newFacilityName}
                        onChange={(e) => setNewFacilityName(e.target.value)}
                        placeholder="e.g. Examination Table"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (newFacilityName.trim()) createFacilityMutation.mutate({ name: newFacilityName.trim(), icon: newFacilityIcon });
                          }
                        }}
                      />
                    </div>
                    <Button
                      onClick={() => { if (newFacilityName.trim()) createFacilityMutation.mutate({ name: newFacilityName.trim(), icon: newFacilityIcon }); }}
                      disabled={!newFacilityName.trim() || createFacilityMutation.isPending}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 flex-shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <Separator />

                  {/* Existing custom types */}
                  {facilityTypes.length === 0 ? (
                    <div className="text-center py-6 text-variable">
                      <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No custom facility types yet.</p>
                      <p className="text-xs mt-1">Add your first one above.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {facilityTypes.map((ft) => (
                        <div key={ft.id} className={`rounded-lg border px-3 py-2.5 ${ft.isActive ? "" : "opacity-50"}`}>
                          {editingFacility?.id === ft.id ? (
                            <div className="flex gap-2 items-center">
                              <Input
                                value={editFacilityIcon}
                                onChange={(e) => setEditFacilityIcon(e.target.value)}
                                maxLength={4}
                                className="w-14 text-center text-lg px-1"
                              />
                              <Input
                                value={editFacilityName}
                                onChange={(e) => setEditFacilityName(e.target.value)}
                                className="flex-1"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && editFacilityName.trim()) {
                                    updateFacilityMutation.mutate({ id: ft.id, name: editFacilityName.trim(), icon: editFacilityIcon });
                                  }
                                  if (e.key === "Escape") setEditingFacility(null);
                                }}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => { if (editFacilityName.trim()) updateFacilityMutation.mutate({ id: ft.id, name: editFacilityName.trim(), icon: editFacilityIcon }); }}
                                disabled={!editFacilityName.trim() || updateFacilityMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingFacility(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-lg flex-shrink-0">{ft.icon}</span>
                                <span className="text-sm font-medium truncate">{ft.name}</span>
                                {!ft.isActive && <Badge variant="outline" className="text-[10px] flex-shrink-0">Inactive</Badge>}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Switch
                                        checked={ft.isActive}
                                        onCheckedChange={(checked) => updateFacilityMutation.mutate({ id: ft.id, isActive: checked })}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent><p>{ft.isActive ? "Disable" : "Enable"} this facility type</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => { setEditingFacility(ft); setEditFacilityName(ft.name); setEditFacilityIcon(ft.icon ?? "🏷"); }}
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Edit</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => { if (confirm(`Remove "${ft.name}" facility type?`)) deleteFacilityMutation.mutate(ft.id); }}
                                        disabled={deleteFacilityMutation.isPending}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Delete facility type</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-4">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>How it works:</strong> Custom facility types you add here appear as toggles when creating or editing a room.
                    Disabling a type hides it from room forms but keeps the data on existing rooms intact.
                    Deleting a type removes it from all future room views — existing room records are unaffected.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
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
            <DialogTitle data-testid="text-view-title">{t("viewDialog.title")}</DialogTitle>
          </DialogHeader>
          {viewBooking && (() => {
            let recurringPattern: { type?: string; until?: string; groupId?: string } | null = null;
            if (viewBooking.isRecurring && viewBooking.recurrencePattern) {
              try { recurringPattern = typeof viewBooking.recurrencePattern === "string" ? JSON.parse(viewBooking.recurrencePattern) : viewBooking.recurrencePattern; } catch {}
            }
            const typeLabel: Record<string, string> = { weekly: t("viewDialog.weekly"), fortnightly: t("viewDialog.fortnightly"), monthly: t("viewDialog.monthly") };
            const attendees: any[] = viewBooking.attendees || [];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.titleField")}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-lg font-semibold" data-testid="text-booking-title">{viewBooking.title}</p>
                      {viewBooking.isRecurring && (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                          <Repeat className="h-3 w-3" /> {t("viewDialog.recurring")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">{t("common:status")}</h4>
                    <Badge className="mt-1" data-testid="badge-booking-status">{viewBooking.status}</Badge>
                  </div>
                </div>

                {recurringPattern && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                      <Repeat className="h-4 w-4" /> {t("viewDialog.recurringSeries")}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div><span className="font-medium">{t("viewDialog.frequency")}</span>{typeLabel[recurringPattern.type || ""] || recurringPattern.type || t("viewDialog.unknown")}</div>
                      {recurringPattern.until && <div><span className="font-medium">{t("viewDialog.repeatsUntil")}</span>{format(new Date(recurringPattern.until), "d MMM yyyy")}</div>}
                    </div>
                    <p className="text-xs text-muted-foreground italic">{t("viewDialog.editOccurrence")}</p>
                  </div>
                )}

                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.room")}</h4>
                    <p className="font-medium" data-testid="text-booking-room">{viewBooking.room?.name || t("viewDialog.unknownRoom")}</p>
                    <p className="text-sm text-muted-foreground">{viewBooking.room?.location}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.organizer")}</h4>
                    <p className="font-medium" data-testid="text-booking-organizer">{viewBooking.organizer ? `${viewBooking.organizer.firstName} ${viewBooking.organizer.lastName}` : t("viewDialog.unknown")}</p>
                    <p className="text-sm text-muted-foreground">{viewBooking.organizer?.email}</p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.startTime")}</h4>
                    <p className="font-medium" data-testid="text-booking-start">{viewBooking.startTime ? format(new Date(viewBooking.startTime), "dd/MM/yyyy, HH:mm") : "N/A"}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.endTime")}</h4>
                    <p className="font-medium" data-testid="text-booking-end">{viewBooking.endTime ? format(new Date(viewBooking.endTime), "dd/MM/yyyy, HH:mm") : "N/A"}</p>
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t("viewDialog.attendees", { count: viewBooking.expectedAttendees || 1 })}</h4>
                  {attendees.length > 0 ? (
                    <div className="space-y-1.5">
                      {attendees.map((att: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          {att.staffId ? <UserCheck className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                          <span className="font-medium">{att.name}</span>
                          {att.email && <span className="text-muted-foreground">({att.email})</span>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">{t("viewDialog.noAttendees")}</p>}
                </div>
                {viewBooking.description && (<><Separator /><div><h4 className="text-sm font-medium text-muted-foreground">{t("common:notes")}</h4><p className="mt-1" data-testid="text-booking-description">{viewBooking.description}</p></div></>)}
                {viewBooking.requiresCatering && (<><Separator /><div><h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.catering")}</h4><p className="mt-1">{t("viewDialog.required")}</p>{viewBooking.cateringNotes && <p className="text-sm text-muted-foreground mt-1">{viewBooking.cateringNotes}</p>}</div></>)}
                {viewBooking.specialRequirements && (<><Separator /><div><h4 className="text-sm font-medium text-muted-foreground">{t("viewDialog.specialRequirements")}</h4><p className="mt-1">{viewBooking.specialRequirements}</p></div></>)}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)} data-testid="button-close-view">{t("common:close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
