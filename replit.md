# TPR Max - Visitor Management System

## Overview
TPR Max is a cloud-based Software-as-a-Service (SAAS) visitor management system designed to efficiently manage visitors, contractors, and staff. It generates standardized ID passes with unique QR codes for tracking and security. The system features a modern glassmorphism UI, an intuitive kiosk-style check-in interface, and comprehensive administrative dashboards. Built on a single-tenant-per-database architecture (React, Express, PostgreSQL), each customer gets their own isolated PostgreSQL database, aiming to provide an enterprise-grade, stable, and secure visitor management solution.

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
- **Database**: PostgreSQL (isolated per customer)
- **ORM**: Drizzle ORM (schema-first)
- **Migration Strategy**: Drizzle Kit

### Authentication & Authorization
- **Authentication**: Session-based with `connect-pg-simple`
- **Customer Isolation**: Database-level isolation with customer-specific connections
- **Route Security**: All API routes use `requireAuth` middleware (134 routes verified). Public/token-based routes (emergency, H&S acceptance, QR checkout) use safe fallback `req.user?.username || 'system'`
- **CSRF Protection**: Double-submit cookie pattern with exemptions for safe methods, webhooks, and emergency endpoints
- **Session Security**: `secure: true` (production), `httpOnly: true`, `sameSite: strict` (production), 24-hour expiry
- **Dev Bypass Safety**: DEV_AUTH_BYPASS and DEV_DATA_BYPASS require BOTH `NODE_ENV === 'development'` AND specific env vars set to `'true'`
- **Preview Routes**: Induction preview routes gated behind `NODE_ENV === 'development'` to prevent data leakage in production

### Key Features & Technical Implementations
- **Multi-Method Thermal Printing**: Supports TEC/Toshiba and Zebra thermal printers, including direct, browser, and Windows printing solutions with print quality and job tracking.
- **QR Code Generation**: Integrated for visitor tracking.
- **Real-time Updates**: Optimistic updates via React Query.
- **Feature Toggle System**: Database-driven toggles for enabling/disabling features per customer.
- **Reports System**: Customer-isolated report generation, viewing, and emailing. Reports are stored in each customer's isolated PostgreSQL schema (`isolatedSchema.reports`) — NOT the global shared database. All report API routes use `custDb` (customer-specific connection) ensuring database-level isolation. Migration 013 (`20260225_013_rebuild_isolated_reports`) rebuilt the reports table in each customer schema with the correct column structure.
- **Pre-booking System**: Supports visitor pre-bookings, invitations, and management.
- **User Management**: Comprehensive user, role, and invitation management with customer isolation and CSRF protection.
- **Voice Notification System**: Visitor arrival announcements via 8x8 API.
- **Room Booking System**: Full CRUD operations for room bookings, including staff attendees, availability checks, and customer isolation.
- **Fire Marshal Static URL System**: Fully implemented and tested permanent, non-expiring static URLs for Fire Marshal emergency access (/fire-marshal/:urlId format). Auto-generates 12-character URL-safe IDs for both new and existing Fire Marshals. Cross-database search locates Fire Marshals across all customer databases. Frontend bypasses session auth for public Fire Marshal routes. UI shows URL status with copy functionality in Staff Management. **Enhanced with "Peace Time" mode**: Fire Marshal URLs ALWAYS display current on-site personnel (staff, visitors, contractors) at ANY point in time, regardless of evacuation status. Default filter set to 'all' ensures everyone is visible even when 100% accounted for. Personnel query always enabled to maintain real-time visibility. Auto-refreshes every 5 seconds with search/filter capabilities.
- **Emergency Evacuation Email System**: Production-ready, life-safety critical email alert system with comprehensive pre-flight validation. **Auto-generates Fire Marshal URLs** when staff is created/updated (department contains "safety"/"security" OR isFireMarshal=true). **Pre-flight checks** before activation: database accessibility, company settings verification, Fire Marshal URL validation. Staff, visitors, and contractors receive evacuation alerts with unique self-service mark-safe links using production URLs (REPLIT_DOMAINS). Fire Marshals receive dedicated emergency alerts with their permanent Fire Marshal panel URLs. Smart email distribution prevents duplicate emails - Fire Marshals receive only their specialized alert, not the regular staff alert. All safety tokens are customer-isolated and expire after 24 hours. Mark-safe functionality updates the main application database in real-time, reflecting instantly across all Fire Marshal views. **Production tested**: Successfully sends all evacuation and Fire Marshal emails with zero failures.
- **AI-Powered Induction Video System**: Commercial-grade safety training video generation using Replit AI Integrations (OpenAI). GPT-5 generates context-aware UK HSE 2024-compliant safety scripts tailored to company industry and requirements. **GPT-Image-1** creates photorealistic, scene-specific workplace safety images via Replit AI Integrations - billed to Replit credits, bypassing personal API billing limits. OpenAI TTS provides professional voice narration with role-specific voices (alloy/onyx/nova). Fallback chain ensures reliability: GPT-Image-1 → Gemini → SVG. **Architecture**: Async generation with real-time progress polling (5 steps: script → slides → questions → save). Questions stored with `customerId-roleType` videoId for customer isolation (no shared question pool contamination). DELETE-then-insert pattern prevents question accumulation. **"2112 questions" bug fixed**: (1) `GET /api/induction/questions` now has `requireAuth` so `req.customerId` is correctly populated — previously missing auth caused fallback to `'default'` returning 0 questions; (2) startup cleanup permanently deletes all legacy-format questions (videoId = 'visitor'/'staff'/'contractor'). QuestionService generates exactly 10 questions across 5 mandatory UK safety categories. Cleanup endpoint at `DELETE /api/induction/questions/cleanup?roleType=X&nuclear=true` removes ALL stale questions (nuclear mode). Status polling at `GET /api/induction/status/:roleType`. **Customer isolation for video serving**: `GET /api/induction/video/:roleType` checks customer-isolated DB first (using session), falls back to global. **Settings API**: `GET /api/induction/settings` returns customer-isolated settings including `kioskEnabled`, `sendLinkEnabled`, `generatedAt`, `questionsGenerated`, `videoDurationMinutes`. **Script generation reliability**: Uses `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit AI), applies `modelType` param correctly, retries with simplified prompt on failure before emergency fallback. **UI (InductionSettings.tsx)**: Multi-step progress indicator, inline preview with fullscreen option, Questions panel with Regenerate/Clear All buttons, **kiosk enable toggle per role** (shows induction during walk-in check-in), **Send Link dialog** (enter name + email to send induction by email), **Advanced Options** collapsible section (AI model info + full UK HSE legislation list). **Kiosk routes**: `PATCH /api/induction/settings/:roleType/toggle` saves kioskEnabled/sendLinkEnabled. `GET /api/induction/kiosk-status/:roleType` for kiosk check-in flow. `POST /api/induction/kiosk-token` creates token for in-person induction. **Schema**: `kioskEnabled` and `sendLinkEnabled` columns added to both global (`shared/schema.ts`) and customer-isolated (`server/isolatedSchema.ts`) inductionSettings tables. Migration `20260226_012_add_induction_kiosk_enabled` applies to all customer schemas. Global DB migrated via ALTER TABLE in seedInductionSettings.ts at startup.
- **CO2 Sustainability Reporting System**: Comprehensive carbon footprint tracking for contractor commutes using Gemini AI (via Replit AI Integrations). Gemini-2.5-flash calculates distances between UK postcodes with intelligent route type detection (motorway/A-roads/mixed). Generates detailed sustainability reports analyzing total emissions, worker breakdowns, and actionable recommendations. All reports are customer-isolated with database storage. Fallback logic ensures reliability when AI is unavailable. Billed to Replit credits with no API key management required.
- **Paxton Net2 Access Control Integration**: Commercial upsell feature providing full integration with Paxton Net2 access control systems. OAuth2 authentication with JWT token management, bi-directional staff sync, remote door control, access level management, and event retrieval. Configurable via Settings > Integrations tab with test connection, manual sync, and auto-sync capabilities. Webhook receiver for real-time Net2 events. TLS verification configurable via PAXTON_ALLOW_SELF_SIGNED env var for on-premise servers with self-signed certificates.
- **API & Webhook Management System**: Customer-isolated API key generation (tpr_ prefix, 64-char hex), webhook secret management (whsec_ prefix), configurable webhook events (visitor/staff/contractor check-in/out, emergency activation, booking creation), webhook delivery testing, and rate limiting. Full CRUD via Settings > Integrations tab.
- **Daily Reset / End of Day System**: Fully fixed and multi-tenant aware. Uses `node-cron` to schedule automatic checkout of all on-site personnel at the configured reset time. `setupAutomaticDailyReset()` iterates ALL customers via `customerDbService.getAllCustomers()` and creates a separate cron task per customer (tracked in `dailyResetTasks` Map). Tasks are stopped and rescheduled immediately when settings are saved (if any of `enableDailyReset`, `dailyResetTime`, `dailyResetTimezone`, `gracePeriodMinutes`, `enableWeekendReset`, `enable24x7Operations`, `enableHolidayReset` change). The cron callback re-reads settings fresh at fire time (not from startup closure) so any in-flight changes always take effect. Grace period notification emails are sent to on-site personnel before the actual checkout. Supports weekday-only and 24/7 operations bypass modes.
- **Zone-Based Evacuation System**: Up to 16 configurable evacuation zones per customer with color-coded markers, interactive floor plan placement, and zone-filtered emergency alerts. Zones are managed via Settings > Zone Management with drag-drop reordering. During evacuation activation, administrators can select specific zones to target alerts only to personnel in those zones (Fire Marshals always receive alerts regardless). The muster page includes zone selector buttons for filtering personnel by zone. Zone assignments available for staff, visitors, contractors, and members during check-in. Database schema: `evacuation_zones` table with `mapX`/`mapY` coordinates for floor plan overlay positioning; `zoneId` VARCHAR field on staff/visitors/members/contractor_workers tables.

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
- **Gemini AI (Replit AI)**: CO2 sustainability report generation and UK postcode distance calculations via @google/genai SDK.
- **Paxton Net2 API**: Access control integration (commercial upsell) with OAuth2 authentication, user sync, door control, and event retrieval. Requires PAXTON_ALLOW_SELF_SIGNED=true env var for self-signed certificates.