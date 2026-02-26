# TPR Max - Visitor Management System

## Overview
TPR Max is a cloud-based Software-as-a-Service (SAAS) visitor management system designed for efficient management of visitors, contractors, and staff. It provides standardized ID passes with QR codes for tracking and security, featuring a modern glassmorphism UI, an intuitive kiosk check-in, and comprehensive administrative dashboards. The system aims to deliver an enterprise-grade, stable, and secure solution with a single-tenant-per-database architecture, ensuring data isolation for each customer. Key capabilities include pre-booking, user management, real-time tracking, and emergency management features.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Architecture
- **Overall Design**: Single-tenant-per-database architecture using React, Express, and PostgreSQL, providing isolated PostgreSQL databases for each customer.
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack Query for state management, and a custom component library built on Radix UI primitives with Tailwind CSS. Utilizes a glassmorphism design system, is responsive, mobile-first, and ARIA compliant.
- **Backend**: Node.js with Express.js, TypeScript, RESTful API design, and Drizzle ORM for database integration. Zod is used for schema validation.
- **Data Storage**: PostgreSQL with Drizzle ORM (schema-first) and Drizzle Kit for migrations. Customer isolation is achieved at the database level.
- **Authentication & Authorization**: Session-based authentication with `connect-pg-simple`, database-level customer isolation, and comprehensive CSRF protection. All API routes are secured with `requireAuth` middleware.
- **Security**: Robust session security with `secure: true`, `httpOnly: true`, and `sameSite: strict` settings in production, along with CSRF protection using a double-submit cookie pattern.

### Key Features & Technical Implementations
- **ID & Tracking**: Generates unique QR codes for visitor tracking and ID passes.
- **Printing**: Supports multi-method thermal printing for TEC/Toshiba and Zebra printers.
- **Real-time Updates**: Implemented using optimistic updates via React Query.
- **Feature Toggles**: Database-driven system for per-customer feature enablement/disablement.
- **Reporting**: Customer-isolated report generation, viewing, and emailing, storing reports in each customer's specific PostgreSQL schema.
- **Pre-booking System**: Facilitates visitor pre-bookings, invitations, and management.
- **User Management**: Comprehensive user, role, and invitation management with customer isolation.
- **Voice Notifications**: Visitor arrival announcements powered by the 8x8 API.
- **Room Booking**: Full CRUD operations for room bookings, including staff attendees and availability checks, with customer isolation.
- **Fire Marshal System**: Provides static, permanent URLs for Fire Marshal emergency access, cross-database search for personnel, and a "Peace Time" mode for real-time visibility of on-site personnel.
- **Emergency Evacuation System**: Production-ready email alert system with pre-flight validation. Auto-generates Fire Marshal URLs, sends evacuation alerts with self-service mark-safe links, and ensures smart email distribution to prevent duplicates.
- **AI-Powered Induction Video System**: Generates commercial-grade safety training videos using Replit AI (OpenAI and GPT-Image-1). Features async generation with real-time polling, customer-isolated questions, and company branding in video slides. Supports kiosk mode and email delivery of induction links.
- **CO2 Sustainability Reporting**: Tracks carbon footprint for contractor commutes using Gemini AI (via Replit AI Integrations), generating detailed, customer-isolated reports.
- **Paxton Net2 Access Control**: Commercial upsell integration for Paxton Net2 systems, offering OAuth2 authentication, bi-directional staff sync, remote door control, and event retrieval.
- **API & Webhook Management**: Customer-isolated API key and webhook secret generation, configurable webhook events, delivery testing, and rate limiting.
- **Daily Reset / End of Day System**: Multi-tenant aware system using `node-cron` for automatic checkout of on-site personnel based on configurable schedules, including grace periods and notifications.
- **Email Outbox System**: Customer-isolated log of all system-sent emails, viewable by administrators with search/filter capabilities and HTML previews.
- **Zone-Based Evacuation**: Supports up to 16 configurable evacuation zones per customer with interactive floor plan placement, zone-filtered emergency alerts, and zone assignment during check-in.

## External Dependencies
- **@tanstack/react-query**: For server state management.
- **drizzle-orm**: Type-safe PostgreSQL ORM.
- **@neondatabase/serverless**: PostgreSQL database driver.
- **wouter**: For React routing.
- **@radix-ui/react-***: For accessible UI primitives.
- **tailwindcss**: For styling.
- **vite**: Build tool.
- **typescript**: For static type checking.
- **zod**: For runtime type validation.
- **date-fns**: For date manipulation.
- **connect-pg-simple**: For PostgreSQL-backed session storage.
- **express-session**: For session middleware.
- **Stripe**: For payment processing and subscription management.
- **8x8 API**: For voice notification features.
- **QR Code Service**: External API for QR code generation.
- **Gemini AI (Replit AI)**: Utilized via @google/genai SDK for CO2 reporting and postcode calculations.
- **Paxton Net2 API**: For access control integration.