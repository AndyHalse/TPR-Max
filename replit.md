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
- **Schema Design**: Tables for staff, visitors, and users (for authentication)
- **Migration Strategy**: Drizzle Kit for database schema migrations

### Authentication & Authorization
- **Planned Implementation**: Session-based authentication with connect-pg-simple for PostgreSQL session storage.
- **Multi-tenancy**: Database-level isolation with tenant-specific connections.

### UI/UX Design Patterns
- **Glassmorphism**: Modern glass-effect styling.
- **Responsive Design**: Mobile-first approach.
- **Accessibility**: Radix UI primitives for ARIA compliance.
- **Component Architecture**: Atomic design with reusable UI components.

### Integration Capabilities
- **Multi-Method Thermal Printing**: Solutions for SaaS-to-local printer challenges, including direct, browser, and Windows printing. Supports TEC/Toshiba and Zebra thermal printers.
- **Print Quality Management**: Dynamic presets.
- **Print Job Tracking**: Real-time status monitoring.
- **Printer Health Monitoring**: Diagnostics and test printing.
- **QR Code Generation**: External service integration for visitor tracking.
- **Real-time Updates**: React Query for optimistic updates.
- **Feature Toggle System**: Allows customers to disable unused features via database-stored boolean toggles, affecting UI navigation and dashboard rendering.

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query**: Server state management.
- **drizzle-orm**: Type-safe PostgreSQL ORM.
- **@neondatabase/serverless**: PostgreSQL database driver.
- **wouter**: React routing library.

### UI Component Libraries
- **@radix-ui/react-***: Accessible UI primitives (Dialog, Dropdown, Select, etc.).
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
- **Stripe Integration**: Comprehensive payment processing with graceful fallback handling
- **Subscription Management**: Professional plan management with Stripe billing portal
- **Production Deployment Safety**: StripeService handles missing API keys gracefully to prevent deployment crashes

## Recent Changes

### September 30, 2025 - Email Invitation Fixes
- **Invitation URL Fix**: Corrected invitation link to use proper Replit domain (REPLIT_DOMAINS) instead of broken local-corp.replit.dev URL
- **Smart Logo Handling**: Email template now validates logo URLs and only displays valid http/https URLs, showing emoji fallback for invalid/local paths
- **Environment Detection**: Proper base URL generation for development (REPLIT_DOMAINS) and production (BASE_URL) environments
- **Debugging Support**: Added logging for invitation URL generation to monitor and verify correct domain usage

### September 30, 2025 - Complete User Management System with Editing
- **User Editing Functionality**: Full user editing with role-based permissions - admins can edit all user details including passwords and roles
- **Admin-Only Role Changes**: Security layer ensures only admin users can change user roles, preventing privilege escalation
- **Optional Password Updates**: Edit users without changing passwords (leave blank to keep current password)
- **Role-Based UI Controls**: Edit buttons only visible to admin users, enforcing access control at UI level
- **Dynamic User Display**: Settings page fetches and displays all users from customer database with real-time updates
- **User Deletion**: Complete user deletion functionality with confirmation dialogs and proper security checks
- **CSRF Protection**: Comprehensive CSRF token support for all mutating requests (POST/PUT/DELETE)
- **Database Isolation Fix**: Fixed critical bug where manual user creation was writing to public schema; now properly uses session-based customer context
- **API Endpoints**: Added GET /api/users, POST /api/users/manual, PUT /api/users/:id, and DELETE /api/users/:id with proper authentication and authorization
- **Multi-tenant Security**: All user operations properly isolated by customer database with UUID-based schema names
- **Enhanced Auth Response**: /api/auth/me now returns user role for client-side authorization checks

### September 28, 2025 - Deployment Fixes
- **Fixed Publishing Errors**: Resolved Stripe configuration issues that were causing deployment crashes
- **Graceful Stripe Handling**: StripeService now handles missing STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PROFESSIONAL_PRICE_ID gracefully in production
- **Marketing Page Updates**: Enhanced voice notification features showcase on /marketing page highlighting automatic audio announcements for visitor arrivals
- **Voice Notification System**: Fully operational with 8x8 API integration and configurable phone system settings