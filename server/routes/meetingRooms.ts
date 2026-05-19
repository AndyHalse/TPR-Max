import type { Express } from 'express';
import { logger } from '../utils/logger';
import {
  requireAuth,
  isDevDataBypass,
  isDatabaseConnectionError,
  getMockRoomBookings,
} from '../auth';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';

export function registerMeetingRoomRoutes(app: Express): void {

  // ===== MEETING ROOM ENDPOINTS =====
  // Meeting Rooms Management
  app.get("/api/meeting-rooms", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const roomsDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rooms = await roomsDb.select().from(isolatedSchema.meetingRooms);
      
      res.json(rooms);
    } catch (error) {
      logger.error("Error fetching meeting rooms:", error);
      res.status(500).json({ error: "Failed to fetch meeting rooms" });
    }
  });

  app.get("/api/meeting-rooms/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const mrContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const mrDb = await customerDbService.getCustomerDatabase(mrContext.customerId);
      const [room] = await mrDb.select().from(isolatedSchema.meetingRooms)
        .where(eq(isolatedSchema.meetingRooms.id, id));
      
      if (!room) {
        return res.status(404).json({ error: "Meeting room not found" });
      }
      
      res.json(room);
    } catch (error) {
      logger.error("Error fetching meeting room:", error);
      res.status(500).json({ error: "Failed to fetch meeting room" });
    }
  });

  app.post("/api/meeting-rooms", requireAuth, async (req, res) => {
    try {
      const roomData = req.body;
      const mrCreateContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const mrCreateDb = await customerDbService.getCustomerDatabase(mrCreateContext.customerId);
      const [room] = await mrCreateDb.insert(isolatedSchema.meetingRooms).values(roomData).returning();
      res.json(room);
    } catch (error) {
      logger.error("Error creating meeting room:", error);
      res.status(500).json({ error: "Failed to create meeting room" });
    }
  });

  app.patch("/api/meeting-rooms/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const mrUpdateContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const mrUpdateDb = await customerDbService.getCustomerDatabase(mrUpdateContext.customerId);
      const [room] = await mrUpdateDb.update(isolatedSchema.meetingRooms)
        .set(updates).where(eq(isolatedSchema.meetingRooms.id, id)).returning();
      
      if (!room) {
        return res.status(404).json({ error: "Meeting room not found" });
      }
      
      res.json(room);
    } catch (error) {
      logger.error("Error updating meeting room:", error);
      res.status(500).json({ error: "Failed to update meeting room" });
    }
  });

  app.delete("/api/meeting-rooms/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const mrDelContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const mrDelDb = await customerDbService.getCustomerDatabase(mrDelContext.customerId);
      const [deletedRoom] = await mrDelDb.delete(isolatedSchema.meetingRooms)
        .where(eq(isolatedSchema.meetingRooms.id, id)).returning();
      const success = !!deletedRoom;
      
      if (!success) {
        return res.status(404).json({ error: "Meeting room not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting meeting room:", error);
      res.status(500).json({ error: "Failed to delete meeting room" });
    }
  });

  // Room Availability Check - GET with query parameters
  app.get("/api/room-bookings/check-availability", requireAuth, async (req, res) => {
    try {
      const { roomId, startDateTime, endDateTime, excludeBookingId } = req.query;
      
      if (!roomId || !startDateTime || !endDateTime) {
        return res.status(400).json({ 
          error: "Missing required parameters: roomId, startDateTime, endDateTime" 
        });
      }
      
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to check availability" });
      }
      
      const availDb = await customerDbService.getCustomerDatabase(customerId);
      const startDt = new Date(startDateTime as string);
      const endDt = new Date(endDateTime as string);
      const conflictingBookings = await availDb.select().from(isolatedSchema.roomBookings)
        .where(and(
          eq(isolatedSchema.roomBookings.meetingRoomId, roomId as string),
          ne(isolatedSchema.roomBookings.status, 'cancelled'),
          sql`${isolatedSchema.roomBookings.startTime} < ${endDt}`,
          sql`${isolatedSchema.roomBookings.endTime} > ${startDt}`
        ));
      const filteredAvail = excludeBookingId 
        ? conflictingBookings.filter(b => b.id !== excludeBookingId) 
        : conflictingBookings;
      const isAvailable = filteredAvail.length === 0;
      
      if (isAvailable) {
        res.json({ available: true });
      } else {
        const conflicts = filteredAvail;
        
        const filteredConflicts = conflicts.filter(booking => 
          booking.id !== excludeBookingId &&
          booking.status !== 'cancelled'
        );
        
        res.json({ 
          available: false, 
          conflicts: filteredConflicts 
        });
      }
    } catch (error) {
      logger.error("Error checking room availability:", error);
      res.status(500).json({ error: "Failed to check room availability" });
    }
  });

  // Room Availability Check - POST method (legacy)
  app.post("/api/meeting-rooms/:id/check-availability", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { startTime, endTime, excludeBookingId } = req.body;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to check availability" });
      }
      
      const legacyAvailDb = await customerDbService.getCustomerDatabase(customerId);
      const legacyStart = new Date(startTime);
      const legacyEnd = new Date(endTime);
      const legacyConflicts = await legacyAvailDb.select().from(isolatedSchema.roomBookings)
        .where(and(
          eq(isolatedSchema.roomBookings.meetingRoomId, id),
          ne(isolatedSchema.roomBookings.status, 'cancelled'),
          sql`${isolatedSchema.roomBookings.startTime} < ${legacyEnd}`,
          sql`${isolatedSchema.roomBookings.endTime} > ${legacyStart}`
        ));
      const filteredLegacy = excludeBookingId 
        ? legacyConflicts.filter(b => b.id !== excludeBookingId) 
        : legacyConflicts;
      const isAvailable = filteredLegacy.length === 0;
      
      res.json({ available: isAvailable });
    } catch (error) {
      logger.error("Error checking room availability:", error);
      res.status(500).json({ error: "Failed to check room availability" });
    }
  });

  // Room Bookings Management
  app.get("/api/room-bookings", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to view bookings" });
      }
      
      const bookingsDb = await customerDbService.getCustomerDatabase(customerId);
      const rawBookings = await bookingsDb.select().from(isolatedSchema.roomBookings);
      
      const allRooms = await bookingsDb.select().from(isolatedSchema.meetingRooms);
      const roomMap = new Map(allRooms.map(r => [r.id, r]));
      
      const staffIds = [...new Set(rawBookings.map(b => b.bookedByStaffId).filter(Boolean))];
      let staffMap = new Map<string, any>();
      if (staffIds.length > 0) {
        const staffMembers = await bookingsDb.select().from(isolatedSchema.staff)
          .where(inArray(isolatedSchema.staff.id, staffIds as string[]));
        staffMap = new Map(staffMembers.map(s => [s.id, s]));
      }
      
      const enrichedBookings = rawBookings.map(booking => {
        const room = roomMap.get(booking.meetingRoomId);
        const organizer = booking.bookedByStaffId ? staffMap.get(booking.bookedByStaffId) : null;
        return {
          ...booking,
          room: room || { id: booking.meetingRoomId, name: 'Unknown Room', location: '', capacity: 0 },
          organizer: organizer 
            ? { id: organizer.id, firstName: organizer.firstName, lastName: organizer.lastName, email: organizer.email || '' }
            : { id: '', firstName: 'Unknown', lastName: 'Organizer', email: '' },
        };
      });

      res.json(enrichedBookings);
    } catch (error) {
      logger.error("Error fetching room bookings:", error);
      res.status(500).json({ error: "Failed to fetch room bookings" });
    }
  });

  // Today's Room Bookings - specific route must come before parameterized route
  app.get("/api/room-bookings/today", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to view bookings" });
      }
      
      const { date, days } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      const daysAhead = days ? parseInt(days as string) : 1;
      
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endDate = new Date(startOfDay);
      endDate.setDate(endDate.getDate() + daysAhead - 1);
      const endOfDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
      
      const todayBookingsDb = await customerDbService.getCustomerDatabase(customerId);
      const bookings = await todayBookingsDb
        .select({
          id: isolatedSchema.roomBookings.id,
          meetingRoomId: isolatedSchema.roomBookings.meetingRoomId,
          title: isolatedSchema.roomBookings.title,
          description: isolatedSchema.roomBookings.description,
          startTime: isolatedSchema.roomBookings.startTime,
          endTime: isolatedSchema.roomBookings.endTime,
          bookedByStaffId: isolatedSchema.roomBookings.bookedByStaffId,
          attendeeCount: isolatedSchema.roomBookings.attendeeCount,
          expectedAttendees: isolatedSchema.roomBookings.expectedAttendees,
          status: isolatedSchema.roomBookings.status,
          requiresCatering: isolatedSchema.roomBookings.requiresCatering,
          cateringNotes: isolatedSchema.roomBookings.cateringNotes,
          specialRequirements: isolatedSchema.roomBookings.specialRequirements,
          attendeeEmails: isolatedSchema.roomBookings.attendeeEmails,
          roomName: isolatedSchema.meetingRooms.name,
          roomCapacity: isolatedSchema.meetingRooms.capacity,
          roomLocation: isolatedSchema.meetingRooms.location,
          organizerFirstName: isolatedSchema.staff.firstName,
          organizerLastName: isolatedSchema.staff.lastName,
          organizerEmail: isolatedSchema.staff.email,
          organizerDepartment: isolatedSchema.staff.department,
        })
        .from(isolatedSchema.roomBookings)
        .leftJoin(isolatedSchema.meetingRooms, eq(isolatedSchema.roomBookings.meetingRoomId, isolatedSchema.meetingRooms.id))
        .leftJoin(isolatedSchema.staff, eq(isolatedSchema.roomBookings.bookedByStaffId, isolatedSchema.staff.id))
        .where(
          and(
            sql`${isolatedSchema.roomBookings.startTime} >= ${startOfDay}`,
            sql`${isolatedSchema.roomBookings.endTime} <= ${endOfDay}`
          )
        )
        .orderBy(isolatedSchema.roomBookings.startTime);
      
      const transformedBookings = bookings
        .filter(booking => booking.startTime && booking.endTime)
        .map(booking => {
          const startDateTime = new Date(booking.startTime);
          const endDateTime = new Date(booking.endTime);
          
          return {
            id: booking.id,
            title: booking.title,
            description: booking.description,
            date: startDateTime.toISOString().split('T')[0],
            startTime: startDateTime.toLocaleTimeString('en-GB', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            }),
            endTime: endDateTime.toLocaleTimeString('en-GB', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            }),
            roomName: booking.roomName || 'Unknown Room',
            organizer: (booking.organizerFirstName && booking.organizerLastName) ? 
              `${booking.organizerFirstName} ${booking.organizerLastName}` : 
              'Unknown Organizer',
            attendees: booking.attendeeEmails || [],
            expectedAttendees: booking.expectedAttendees || 0,
            status: booking.status,
            requiresCatering: booking.requiresCatering,
            cateringNotes: booking.cateringNotes,
            specialRequirements: booking.specialRequirements
          };
        });
      
      res.json(transformedBookings);
    } catch (error) {
      logger.error("Error fetching today's room bookings:", error);
      
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockRoomBookings());
      }
      
      res.status(500).json({ error: "Failed to fetch today's room bookings" });
    }
  });

  app.get("/api/room-bookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to view booking" });
      }
      
      const bookingGetDb = await customerDbService.getCustomerDatabase(customerId);
      const [booking] = await bookingGetDb.select().from(isolatedSchema.roomBookings)
        .where(eq(isolatedSchema.roomBookings.id, id));
      
      if (!booking) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      res.json(booking);
    } catch (error) {
      logger.error("Error fetching room booking:", error);
      res.status(500).json({ error: "Failed to fetch room booking" });
    }
  });

  app.post("/api/room-bookings", requireAuth, async (req, res) => {
    try {
      const bookingData = req.body;
      
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to create a booking" });
      }
      
      const bookingContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const bookingDb = await customerDbService.getCustomerDatabase(bookingContext.customerId);
      
      let bookedByStaffId = bookingData.bookedByStaffId;
      if (!bookedByStaffId && req.user?.id) {
        const [foundStaff] = await bookingDb.select().from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.userId, req.user.id));
        if (foundStaff) bookedByStaffId = foundStaff.id;
      }
      
      if (!bookedByStaffId) {
        return res.status(400).json({ error: "Unable to identify staff member for booking" });
      }
      
      if (!bookingData.roomId || !bookingData.startDateTime || !bookingData.endDateTime) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // ── Helpers ──────────────────────────────────────────────────────────────
      const staffAttendeeIds: string[] = bookingData.staffAttendeeIds || [];
      const externalAttendeeEmails: string[] = bookingData.externalAttendeeEmails || [];

      // Pre-load staff attendees once (shared across all occurrences)
      const staffMembers = staffAttendeeIds.length > 0
        ? await bookingDb.select().from(isolatedSchema.staff).where(inArray(isolatedSchema.staff.id, staffAttendeeIds))
        : [];
      const staffMap = new Map(staffMembers.map(s => [s.id, s]));

      const insertAttendees = async (bookingId: string) => {
        const vals: any[] = [];
        for (const sid of staffAttendeeIds) {
          const s = staffMap.get(sid);
          vals.push({ bookingId, staffId: sid, name: s ? `${s.firstName} ${s.lastName}` : 'Unknown', email: s?.email || '' });
        }
        for (const email of externalAttendeeEmails) {
          vals.push({ bookingId, email, name: email, staffId: null });
        }
        if (vals.length > 0) await bookingDb.insert(isolatedSchema.roomBookingAttendees).values(vals);
      };

      const createSingleBooking = async (startTime: Date, endTime: Date, recurrencePattern?: string) => {
        // Conflict check
        const conflicts = await bookingDb.select().from(isolatedSchema.roomBookings)
          .where(and(
            eq(isolatedSchema.roomBookings.meetingRoomId, bookingData.roomId),
            ne(isolatedSchema.roomBookings.status, 'cancelled'),
            sql`${isolatedSchema.roomBookings.startTime} < ${endTime}`,
            sql`${isolatedSchema.roomBookings.endTime} > ${startTime}`
          ));
        if (conflicts.length > 0) return null; // skip conflicting slot

        const [booking] = await bookingDb.insert(isolatedSchema.roomBookings)
          .values({
            title: bookingData.title,
            description: bookingData.description,
            meetingRoomId: bookingData.roomId,
            bookedByStaffId,
            startTime,
            endTime,
            status: 'confirmed',
            expectedAttendees: bookingData.expectedAttendees || 1,
            isRecurring: !!recurrencePattern,
            recurrencePattern: recurrencePattern || null,
            requiresCatering: bookingData.cateringRequired || false,
            cateringNotes: bookingData.cateringNotes || null,
            specialRequirements: bookingData.technicalRequirements || null,
            isPrivate: false,
          })
          .returning();
        await insertAttendees(booking.id);
        return booking;
      };

      // ── Recurring path ────────────────────────────────────────────────────────
      if (bookingData.isRecurring && bookingData.recurringType && bookingData.recurringEndDate) {
        const baseStart = new Date(bookingData.startDateTime);
        const baseEnd = new Date(bookingData.endDateTime);
        const durationMs = baseEnd.getTime() - baseStart.getTime();
        const until = new Date(bookingData.recurringEndDate);
        until.setHours(23, 59, 59, 999);

        const groupId = crypto.randomUUID();
        const recurrencePattern = JSON.stringify({
          groupId,
          type: bookingData.recurringType,
          until: until.toISOString(),
        });

        const dates: Date[] = [];
        let cursor = baseStart;
        while (cursor <= until) {
          dates.push(new Date(cursor));
          if (bookingData.recurringType === 'weekly') cursor = new Date(cursor.getTime() + 7 * 86400000);
          else if (bookingData.recurringType === 'fortnightly') cursor = new Date(cursor.getTime() + 14 * 86400000);
          else if (bookingData.recurringType === 'monthly') {
            const next = new Date(cursor);
            next.setMonth(next.getMonth() + 1);
            cursor = next;
          } else break;
        }

        let created = 0;
        let skipped = 0;
        let firstBooking: any = null;

        for (const occStart of dates) {
          const occEnd = new Date(occStart.getTime() + durationMs);
          const booking = await createSingleBooking(occStart, occEnd, recurrencePattern);
          if (booking) {
            created++;
            if (!firstBooking) firstBooking = booking;
          } else {
            skipped++;
          }
        }

        // Send one confirmation email for the series (based on first booking)
        if (firstBooking) {
          try {
            const [bookingRoom] = await bookingDb.select().from(isolatedSchema.meetingRooms)
              .where(eq(isolatedSchema.meetingRooms.id, firstBooking.meetingRoomId));
            const [organizer] = await bookingDb.select().from(isolatedSchema.staff)
              .where(eq(isolatedSchema.staff.id, firstBooking.bookedByStaffId));
            const [settings] = await bookingDb.select().from(isolatedSchema.companySettings).limit(1);
            await emailService.forCustomer(req.customerId).sendBookingConfirmation(
              firstBooking, bookingRoom, organizer, staffMembers, externalAttendeeEmails,
              settings ? { companyName: settings.companyName, logoUrl: settings.logoUrl, address: settings.address, phone: settings.phone, website: settings.website, email: settings.email } : undefined
            );
          } catch (emailError) {
            logger.error("Failed to send recurring booking confirmation email:", emailError);
          }
        }

        return res.json({ recurring: true, created, skipped, groupId });
      }

      // ── Single booking path ───────────────────────────────────────────────────
      const createStart = new Date(bookingData.startDateTime);
      const createEnd = new Date(bookingData.endDateTime);
      const booking = await createSingleBooking(createStart, createEnd);

      if (!booking) {
        return res.status(409).json({ error: "Room is not available during the requested time" });
      }

      try {
        const [bookingRoom] = await bookingDb.select().from(isolatedSchema.meetingRooms)
          .where(eq(isolatedSchema.meetingRooms.id, booking.meetingRoomId));
        const [organizer] = await bookingDb.select().from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.id, booking.bookedByStaffId));
        const [settings] = await bookingDb.select().from(isolatedSchema.companySettings).limit(1);
        await emailService.forCustomer(req.customerId).sendBookingConfirmation(
          booking, bookingRoom, organizer, staffMembers, externalAttendeeEmails,
          settings ? { companyName: settings.companyName, logoUrl: settings.logoUrl, address: settings.address, phone: settings.phone, website: settings.website, email: settings.email } : undefined
        );
      } catch (emailError) {
        logger.error("Failed to send booking confirmation email:", emailError);
      }

      res.json({ recurring: false, created: 1, skipped: 0, booking });
    } catch (error) {
      logger.error("Error creating room booking:", error);
      res.status(500).json({ error: "Failed to create room booking" });
    }
  });

  app.patch("/api/room-bookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to update bookings" });
      }
      
      const patchDb = await customerDbService.getCustomerDatabase(customerId);
      const [currentBooking] = await patchDb.select().from(isolatedSchema.roomBookings)
        .where(eq(isolatedSchema.roomBookings.id, id));
      if (!currentBooking) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      if (updates.startDateTime || updates.endDateTime) {
        const startTime = updates.startDateTime ? new Date(updates.startDateTime) : new Date(currentBooking.startTime);
        const endTime = updates.endDateTime ? new Date(updates.endDateTime) : new Date(currentBooking.endTime);

        const patchConflicts = await patchDb.select().from(isolatedSchema.roomBookings)
          .where(and(
            eq(isolatedSchema.roomBookings.meetingRoomId, currentBooking.meetingRoomId),
            ne(isolatedSchema.roomBookings.status, 'cancelled'),
            ne(isolatedSchema.roomBookings.id, id),
            sql`${isolatedSchema.roomBookings.startTime} < ${endTime}`,
            sql`${isolatedSchema.roomBookings.endTime} > ${startTime}`
          ));

        if (patchConflicts.length > 0) {
          return res.status(409).json({ 
            error: "Room is not available during the updated time" 
          });
        }
      }

      const [booking] = await patchDb.update(isolatedSchema.roomBookings)
        .set(updates).where(eq(isolatedSchema.roomBookings.id, id)).returning();
      
      if (!booking) {
        return res.status(404).json({ error: "Room booking not found" });
      }

      const { staffAttendeeIds, externalAttendeeEmails } = updates;
      if (staffAttendeeIds || externalAttendeeEmails) {
        await patchDb.delete(isolatedSchema.roomBookingAttendees)
          .where(eq(isolatedSchema.roomBookingAttendees.bookingId, id));

        const patchAttendeeValues: any[] = [];
        for (const sid of (staffAttendeeIds || [])) {
          patchAttendeeValues.push({ bookingId: id, staffId: sid, email: '' });
        }
        for (const email of (externalAttendeeEmails || [])) {
          patchAttendeeValues.push({ bookingId: id, email, staffId: null });
        }
        if (patchAttendeeValues.length > 0) {
          await patchDb.insert(isolatedSchema.roomBookingAttendees).values(patchAttendeeValues);
        }

        const [patchFullBooking] = await patchDb.select().from(isolatedSchema.roomBookings)
          .where(eq(isolatedSchema.roomBookings.id, id));
        if (patchFullBooking) {
          const patchStaffAttendees = staffAttendeeIds?.length > 0 
            ? await patchDb.select().from(isolatedSchema.staff).where(inArray(isolatedSchema.staff.id, staffAttendeeIds))
            : [];
          
          try {
            const [patchRoom] = await patchDb.select().from(isolatedSchema.meetingRooms)
              .where(eq(isolatedSchema.meetingRooms.id, patchFullBooking.meetingRoomId));
            const [patchOrganizer] = await patchDb.select().from(isolatedSchema.staff)
              .where(eq(isolatedSchema.staff.id, patchFullBooking.bookedByStaffId));
            const [patchSettings] = await patchDb.select().from(isolatedSchema.companySettings).limit(1);
            await emailService.forCustomer(req.customerId).sendBookingConfirmation(
              patchFullBooking, 
              patchRoom, 
              patchOrganizer, 
              patchStaffAttendees,
              externalAttendeeEmails || [],
              patchSettings ? { companyName: patchSettings.companyName, logoUrl: patchSettings.logoUrl, address: patchSettings.address, phone: patchSettings.phone, website: patchSettings.website, email: patchSettings.email } : undefined
            );
          } catch (emailError) {
            logger.error("Failed to send booking update email:", emailError);
          }
        }
      }
      
      res.json(booking);
    } catch (error) {
      logger.error("Error updating room booking:", error);
      res.status(500).json({ error: "Failed to update room booking" });
    }
  });

  app.post("/api/room-bookings/:id/cancel", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { cancelledBy, attendeeEmails } = req.body;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to cancel booking" });
      }
      
      const cancelDb = await customerDbService.getCustomerDatabase(customerId);
      const [fullBooking] = await cancelDb.select().from(isolatedSchema.roomBookings)
        .where(eq(isolatedSchema.roomBookings.id, id));
      
      if (!fullBooking) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      const [booking] = await cancelDb.update(isolatedSchema.roomBookings)
        .set({ status: 'cancelled', cancelledBy, cancelledAt: new Date() })
        .where(eq(isolatedSchema.roomBookings.id, id)).returning();
      
      if (!booking) {
        return res.status(404).json({ error: "Room booking not found" });
      }

      if (fullBooking) {
        try {
          const attendees = await cancelDb.select().from(isolatedSchema.roomBookingAttendees)
            .where(eq(isolatedSchema.roomBookingAttendees.bookingId, id));
          const staffIds = attendees.filter(a => a.staffId).map(a => a.staffId!);
          const staffAttendees = staffIds.length > 0 
            ? await cancelDb.select().from(isolatedSchema.staff).where(inArray(isolatedSchema.staff.id, staffIds))
            : [];
          const externalEmails = attendees.filter(a => !a.staffId).map(a => a.email);
          
          const [cancelRoom] = await cancelDb.select().from(isolatedSchema.meetingRooms)
            .where(eq(isolatedSchema.meetingRooms.id, fullBooking.meetingRoomId));
          const [cancelOrganizer] = await cancelDb.select().from(isolatedSchema.staff)
            .where(eq(isolatedSchema.staff.id, fullBooking.bookedByStaffId));
          await emailService.forCustomer(req.customerId).sendBookingCancellation(
            fullBooking, 
            cancelRoom, 
            cancelOrganizer, 
            staffAttendees,
            externalEmails
          );
        } catch (emailError) {
          logger.error("Failed to send cancellation email:", emailError);
        }
      }
      
      res.json(booking);
    } catch (error) {
      logger.error("Error cancelling room booking:", error);
      res.status(500).json({ error: "Failed to cancel room booking" });
    }
  });

  app.delete("/api/room-bookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to delete booking" });
      }
      
      const delBookingDb = await customerDbService.getCustomerDatabase(customerId);
      const [booking] = await delBookingDb.select().from(isolatedSchema.roomBookings)
        .where(eq(isolatedSchema.roomBookings.id, id));
      if (!booking) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      const [deletedBooking] = await delBookingDb.delete(isolatedSchema.roomBookings)
        .where(eq(isolatedSchema.roomBookings.id, id)).returning();
      const success = !!deletedBooking;
      
      if (!success) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting room booking:", error);
      res.status(500).json({ error: "Failed to delete room booking" });
    }
  });

  // Meeting Check-in/out
  app.post("/api/room-bookings/:id/check-in", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to check in" });
      }
      
      const checkinMeetDb = await customerDbService.getCustomerDatabase(customerId);
      const [booking] = await checkinMeetDb.update(isolatedSchema.roomBookings)
        .set({ status: 'in_progress', checkedInAt: new Date() })
        .where(eq(isolatedSchema.roomBookings.id, id)).returning();
      
      if (!booking) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      res.json(booking);
    } catch (error) {
      logger.error("Error checking in to meeting:", error);
      res.status(500).json({ error: "Failed to check in to meeting" });
    }
  });

  app.post("/api/room-bookings/:id/end-meeting", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to end meeting" });
      }
      
      const endMeetDb = await customerDbService.getCustomerDatabase(customerId);
      const [booking] = await endMeetDb.update(isolatedSchema.roomBookings)
        .set({ status: 'completed', endedAt: new Date() })
        .where(eq(isolatedSchema.roomBookings.id, id)).returning();
      
      if (!booking) {
        return res.status(404).json({ error: "Room booking not found" });
      }
      
      res.json(booking);
    } catch (error) {
      logger.error("Error ending meeting:", error);
      res.status(500).json({ error: "Failed to end meeting" });
    }
  });

  // Upcoming Bookings & Reminders
  app.get("/api/room-bookings/upcoming", requireAuth, async (req, res) => {
    try {
      const { room_id, minutes } = req.query;
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to view upcoming bookings" });
      }
      
      const upcomingDb = await customerDbService.getCustomerDatabase(customerId);
      const now = new Date();
      const futureTime = new Date(now.getTime() + (minutes ? parseInt(minutes as string) : 15) * 60000);
      const upcomingBookings = await upcomingDb.select().from(isolatedSchema.roomBookings)
        .where(and(
          ne(isolatedSchema.roomBookings.status, 'cancelled'),
          sql`${isolatedSchema.roomBookings.startTime} >= ${now}`,
          sql`${isolatedSchema.roomBookings.startTime} <= ${futureTime}`
        ));
      
      res.json(upcomingBookings);
    } catch (error) {
      logger.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Room Analytics
  app.get("/api/meeting-rooms/analytics/utilization", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      simpleDatabaseService.createCustomerContext(username, req.customerId);
      res.json({});
    } catch (error) {
      logger.error("Error fetching room utilization stats:", error);
      res.status(500).json({ error: "Failed to fetch room utilization stats" });
    }
  });

  app.get("/api/meeting-rooms/analytics/patterns", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      
      if (!customerId) {
        return res.status(401).json({ error: "Please log in to view analytics" });
      }
      
      const patternsDb = await customerDbService.getCustomerDatabase(customerId);
      const patterns = await patternsDb.select().from(isolatedSchema.roomBookings);
      res.json(patterns);
    } catch (error) {
      logger.error("Error fetching meeting patterns:", error);
      res.status(500).json({ error: "Failed to fetch meeting patterns" });
    }
  });

}
