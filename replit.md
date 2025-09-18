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