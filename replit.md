# VisiGate Pro - Visitor Management System

## Overview

VisiGate Pro is a modern, cloud-based Software-as-a-Service (SAAS) visitor management system designed to manage visitors, contractors, and staff efficiently. The system generates and prints standardized ID passes with unique QR codes for tracking and security purposes. Built with a modern glassmorphism UI design, it provides an intuitive kiosk-style interface for check-ins and comprehensive dashboard views for administrative management.

The application follows a full-stack architecture with React frontend, Express backend, and PostgreSQL database, designed to handle multi-tenant scenarios where each company gets its own isolated data space.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development practices
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **UI Framework**: Custom component library built on Radix UI primitives with Tailwind CSS
- **Design System**: Glassmorphism design with CSS custom properties for theming
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for consistent type safety across the stack
- **API Design**: RESTful API with clear endpoint structure for resources (staff, visitors, stats)
- **Database Integration**: Drizzle ORM for type-safe database operations
- **Schema Validation**: Zod schemas for runtime type validation and API request/response validation

### Data Storage Architecture
- **Database**: PostgreSQL configured for multi-tenant architecture
- **ORM**: Drizzle ORM with schema-first approach
- **Schema Design**: 
  - Staff table for employee management with department tracking
  - Visitors table with check-in/out timestamps and QR code generation
  - Users table for authentication (prepared for future auth implementation)
- **Migration Strategy**: Drizzle Kit for database schema migrations and version control

### Authentication & Authorization
- **Current State**: Basic structure in place with user schema
- **Planned Implementation**: Session-based authentication with connect-pg-simple for PostgreSQL session storage
- **Multi-tenancy**: Database-level isolation with tenant-specific database connections

### UI/UX Design Patterns
- **Glassmorphism**: Modern glass-effect styling with backdrop blur and transparency
- **Responsive Design**: Mobile-first approach with adaptive layouts
- **Accessibility**: Radix UI primitives ensure ARIA compliance and keyboard navigation
- **Component Architecture**: Atomic design with reusable UI components

### Integration Capabilities
- **Printer Support**: Designed for B-FV4 Desktop Printer integration (95mm x 66mm passes)
- **QR Code Generation**: External QR code service integration for visitor tracking
- **Real-time Updates**: React Query provides optimistic updates and background synchronization

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query**: Server state management and caching layer
- **drizzle-orm**: Type-safe database ORM for PostgreSQL operations
- **@neondatabase/serverless**: PostgreSQL database driver optimized for serverless environments
- **wouter**: Lightweight routing library for React applications

### UI Component Libraries
- **@radix-ui/react-***: Comprehensive suite of accessible UI primitives including:
  - Dialog, Dropdown, Select, Accordion, Toast components
  - Form controls like Checkbox, Radio Group, Switch
  - Navigation components and overlays
- **tailwindcss**: Utility-first CSS framework for rapid UI development
- **class-variance-authority**: Type-safe variant-based component styling
- **lucide-react**: Modern icon library with consistent design

### Development & Build Tools
- **vite**: Fast build tool with hot module replacement
- **typescript**: Static type checking for both frontend and backend
- **drizzle-kit**: Database migration and introspection tools
- **@replit/vite-plugin-***: Replit-specific development environment plugins

### Validation & Utilities
- **zod**: Runtime type validation and schema definition
- **drizzle-zod**: Integration between Drizzle schemas and Zod validation
- **date-fns**: Modern date manipulation library
- **clsx & tailwind-merge**: Conditional CSS class composition utilities

### Session Management
- **connect-pg-simple**: PostgreSQL-backed session storage for Express applications
- **express-session**: Session middleware for authentication state management

### Printer Integration (Planned)
- **B-FV4 Desktop Printer**: Thermal printer for 95mm x 66mm ID passes
- **QR Code Service**: External API for generating visitor tracking QR codes