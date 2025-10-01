# VisiGate Pro - Visitor Management System

## Overview

VisiGate Pro is a modern, cloud-based Software-as-a-Service (SAAS) visitor management system. Its primary purpose is to efficiently manage visitors, contractors, and staff by generating standardized ID passes with unique QR codes for tracking and security. The system features a glassmorphism UI, an intuitive kiosk-style interface for check-ins, and comprehensive administrative dashboards. It is built on a full-stack architecture (React, Express, PostgreSQL) designed for multi-tenant scenarios, ensuring data isolation for each company. The project's ambition is to provide an enterprise-grade, stable, and secure visitor management solution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query for server state management and caching
- **UI Framework**: Custom component library built on Radix UI primitives with Tailwind CSS
- **Design System**: Glassmorphism design with CSS custom properties for theming
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API Design**: RESTful API
- **Database Integration**: Drizzle ORM
- **Schema Validation**: Zod schemas

### Data Storage Architecture
- **Database**: PostgreSQL, configured for multi-tenant architecture
- **ORM**: Drizzle ORM with schema-first approach
- **Migration Strategy**: Drizzle Kit for database schema migrations

### Authentication & Authorization
- **Implementation**: Session-based authentication with `connect-pg-simple` for PostgreSQL session storage.
- **Multi-tenancy**: Database-level isolation with tenant-specific connections.

### UI/UX Design Patterns
- **Glassmorphism**: Modern glass-effect styling.
- **Responsive Design**: Mobile-first approach.
- **Accessibility**: Radix UI primitives for ARIA compliance.
- **Component Architecture**: Atomic design with reusable UI components.

### Technical Implementations
- **Multi-Method Thermal Printing**: Solutions for SaaS-to-local printer challenges, including direct, browser, and Windows printing, supporting TEC/Toshiba and Zebra thermal printers. Includes print quality management, job tracking, and printer health monitoring.
- **QR Code Generation**: Integrated for visitor tracking.
- **Real-time Updates**: Optimistic updates via React Query.
- **Feature Toggle System**: Allows customers to disable unused features via database-stored boolean toggles, affecting UI navigation and dashboard rendering.
- **Reports System**: Fully operational with multi-tenant isolation, enabling generation, viewing, and emailing of reports.
- **Pre-booking System**: Supports visitor pre-bookings, including handling visit dates/times and managing invitations.
- **User Management**: Comprehensive system for managing user accounts, roles, invitations, and deletion, with proper multi-tenant isolation and CSRF protection.
- **Voice Notification System**: Fully operational with 8x8 API integration and configurable phone system settings for visitor arrival announcements.

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query**: Server state management.
- **drizzle-orm**: Type-safe PostgreSQL ORM.
- **@neondatabase/serverless**: PostgreSQL database driver.
- **wouter**: React routing library.

### UI Component Libraries
- **@radix-ui/react-***: Accessible UI primitives.
- **tailwindcss**: Utility-first CSS framework.
- **class-variance-authority**: Type-safe variant-based component styling.
- **lucide-react**: Icon library.

### Development & Build Tools
- **vite**: Fast build tool.
- **typescript**: Static type checking.
- **drizzle-kit**: Database migration tools.

### Validation & Utilities
- **zod**: Runtime type validation.
- **drizzle-zod**: Drizzle and Zod integration.
- **date-fns**: Date manipulation library.
- **clsx & tailwind-merge**: Conditional CSS class composition.

### Session Management
- **connect-pg-simple**: PostgreSQL-backed session storage.
- **express-session**: Session middleware.

### Printer Integration
- **B-FV4 Desktop Printer**: Thermal printer support.
- **QR Code Service**: External API for QR code generation.

### Payment Integration
- **Stripe Integration**: Comprehensive payment processing and subscription management with graceful fallback handling.

### Communication Integration
- **8x8 API**: Integrated for voice notification features.

## Recent Changes

### October 01, 2025 - Room Booking Security and Multi-tenant Isolation Fixes
- **CRITICAL SECURITY FIX**: Eliminated tenant spoofing vulnerability in POST /api/room-bookings by removing fallback to client-provided tenantCompanyId
- **Tenant Ownership Verification**: Added mandatory tenant ownership check in PATCH /api/room-bookings/:id to prevent cross-tenant updates
- **Data Isolation**: GET /api/room-bookings/today now properly filters by tenant using getRoomBookingsByTenant()
- **Availability Check Security**: checkRoomAvailability now properly filters by tenantId for accurate multi-tenant conflict detection
- **Field Name Fixes**: Corrected startDateTime/endDateTime → startTime/endTime mapping throughout the system
- **Validation**: Added required field validation for POST requests
- **Data Integrity**: Invalid booking records (missing start/end times) are now filtered out instead of silently coerced
- **Authentication**: Added requireAuth middleware to POST, PATCH, and GET /today endpoints
- **Frontend**: Added null safety checks for date parsing in RoomBookingForm
- **Impact**: Room booking system now enforces strict multi-tenant isolation, preventing cross-tenant data access and ensuring data consistency

### October 01, 2025 - Pre-booking Multi-tenant Isolation Fix
- **CRITICAL FIX**: All pre-booking endpoints now properly filter by customer tenant for true data isolation
- **Customer-Filtered Methods**: Added getAllPreBookingsByCustomer(), getUpcomingPreBookingsByCustomer(), and getReceptionDiaryByCustomer() to DatabaseStorage and MemStorage
- **Security Enhancement**: Added requireAuth middleware to /api/prebookings, /api/prebookings/upcoming, and /api/reception/diary endpoints
- **Reception Diary Fix**: Dashboard reception diary now only shows pre-bookings for the logged-in customer
- **Visitor Management Fix**: Pre-booking tab now only shows pre-bookings for the logged-in customer
- **Database Separation**: Production and development databases are completely separate - pre-bookings must be created in each environment individually
- **Impact**: Each customer can now only see and manage their own pre-bookings, preventing cross-tenant data exposure

### October 01, 2025 - Reports System Complete with Multi-tenant Isolation
- **Reports System Fully Operational**: All report endpoints now working correctly with proper customer isolation
- **Database Schema Fix**: Added customerId column to reports table for multi-tenant data isolation
- **Customer-Filtered Queries**: Implemented getReportsByCustomer(customerId) method in DatabaseStorage for tenant-safe report retrieval
- **Security Enhancement**: All report endpoints use requireAuth middleware
- **Method Naming Fix**: Corrected databaseService.getStaffMembers() to getAllStaff() in report view and email endpoints
- **Defense-in-Depth Security**: Report updates verify report.customerId matches session context.customerId before allowing operations
- **Impact**: Reports page fully functional with listing, generation, viewing, and emailing capabilities - all properly isolated by customer