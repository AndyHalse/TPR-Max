# VisiGate Pro - Visitor Management System

## Overview
VisiGate Pro is a cloud-based Software-as-a-Service (SAAS) visitor management system designed to efficiently manage visitors, contractors, and staff. It generates standardized ID passes with unique QR codes for tracking and security. The system features a modern glassmorphism UI, an intuitive kiosk-style check-in interface, and comprehensive administrative dashboards. Built on a multi-tenant architecture (React, Express, PostgreSQL), it ensures data isolation for each company, aiming to provide an enterprise-grade, stable, and secure visitor management solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Framework**: Custom component library built on Radix UI primitives with Tailwind CSS
- **Design System**: Glassmorphism design, responsive, mobile-first, and ARIA compliant
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API Design**: RESTful API
- **Database Integration**: Drizzle ORM
- **Schema Validation**: Zod

### Data Storage
- **Database**: PostgreSQL (multi-tenant)
- **ORM**: Drizzle ORM (schema-first)
- **Migration Strategy**: Drizzle Kit

### Authentication & Authorization
- **Authentication**: Session-based with `connect-pg-simple`
- **Multi-tenancy**: Database-level isolation with tenant-specific connections

### Key Features & Technical Implementations
- **Multi-Method Thermal Printing**: Supports TEC/Toshiba and Zebra thermal printers, including direct, browser, and Windows printing solutions with print quality and job tracking.
- **QR Code Generation**: Integrated for visitor tracking.
- **Real-time Updates**: Optimistic updates via React Query.
- **Feature Toggle System**: Database-driven toggles for enabling/disabling features per customer.
- **Reports System**: Multi-tenant isolated report generation, viewing, and emailing.
- **Pre-booking System**: Supports visitor pre-bookings, invitations, and management.
- **User Management**: Comprehensive user, role, and invitation management with multi-tenant isolation and CSRF protection.
- **Voice Notification System**: Visitor arrival announcements via 8x8 API.
- **Room Booking System**: Full CRUD operations for room bookings, including staff attendees, availability checks, and multi-tenant isolation.
- **Fire Marshal Static URL System**: Fully implemented and tested permanent, non-expiring static URLs for Fire Marshal emergency access (/fire-marshal/:urlId format). Auto-generates 12-character URL-safe IDs for both new and existing Fire Marshals. Cross-tenant database search locates Fire Marshals across all customer databases. Frontend bypasses session auth for public Fire Marshal routes. UI shows URL status with copy functionality in Staff Management. **Enhanced with "Peace Time" mode**: Fire Marshal URLs now display current on-site personnel (staff, visitors, contractors) even during normal operations for familiarization and readiness. Auto-refreshes every 10 seconds with search/filter capabilities.

## External Dependencies
- **@tanstack/react-query**: Server state management.
- **drizzle-orm**: Type-safe PostgreSQL ORM.
- **@neondatabase/serverless**: PostgreSQL database driver.
- **wouter**: React routing library.
- **@radix-ui/react-***: Accessible UI primitives.
- **tailwindcss**: Utility-first CSS framework.
- **vite**: Build tool.
- **typescript**: Static type checking.
- **zod**: Runtime type validation.
- **date-fns**: Date manipulation library.
- **connect-pg-simple**: PostgreSQL-backed session storage.
- **express-session**: Session middleware.
- **Stripe**: Payment processing and subscription management.
- **8x8 API**: Voice notification features.
- **QR Code Service**: External API for QR code generation.