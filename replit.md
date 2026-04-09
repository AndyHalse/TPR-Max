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
- **BioStar 2 Access Control Integration**: Full integration with Suprema BioStar 2 (REST API v2.7.10+ New Local API format). Authenticates via `POST /api/login` with `bs-session-id` header, retrieves real-time access events via `POST /api/events/search` using the Query format with UTC ISO-8601 timestamps. Supports both old (0x1xxx/0x4xxx) and new (0x5xxx) BioStar 2 event code ranges. User ID correctly parsed from new API format (`user_id.user_id`, not `user_id.id`). WebSocket real-time streaming via `wss://<server>/wsapi` (auto-discovered with path cycling through `/wsapi/events/subscribe` → `/wsapi` → `/api/events/subscribe`). Multi-tenant polling every 5 minutes with staff check-in/out detection via `biostarUserId` linkage. Device roles (ENTRY/EXIT/ENTRY_EXIT/IGNORE) control on-site detection logic. Self-signed certificate support via custom `httpsAgent`.
- **API & Webhook Management**: Customer-isolated API key and webhook secret generation, configurable webhook events, delivery testing, and rate limiting.
- **Daily Reset / End of Day System**: Multi-tenant aware system using `node-cron` for automatic checkout of on-site personnel based on configurable schedules, including grace periods and notifications.
- **Email Outbox System**: Customer-isolated log of all system-sent emails, viewable by administrators with search/filter capabilities and HTML previews.
- **Zone-Based Evacuation**: Supports up to 16 configurable evacuation zones per customer with interactive floor plan placement, zone-filtered emergency alerts, and zone assignment during check-in.
- **Drill Mode**: Evacuation drills are clearly marked amber in the UI and in emails. Post-drill Incident Report PDF download. `is_drill` column in shared `evacuations` table.
- **Zone Sweep Mode**: Fire Marshal muster page has collapsible zone sweep panel, zone filter tabs, "MINE" badge for own zone, cleared/pending indicators.
- **Incident Monitor**: Read-only shareable link (`/monitor/{evacuationId}?customer={id}`) for senior management to view live evacuation stats without authentication. Purple "Monitor Link" button in EmergencyMuster.
- **Incident Manager Monitor**: Permanent static URL (`/incident-monitor/{urlId}`) stored as `incidentManagerUrlId` in `companySettings`. Senior management can view live muster stats, zone breakdown, PEEP flags, and WebSocket-driven real-time updates without login. Admin generates/regenerates link via Settings → Zones → Emergency Access section. Backend resolves customer from urlId via cross-schema search. Migration #030 added `incidentManagerUrlId TEXT` to `companySettings`.
- **Nudge Unaccounted**: During an active emergency, admin can send reminder emails to all unaccounted personnel via "Nudge Unaccounted" button. Emails include a self-confirm mark-safe link.
- **Martyn's Law (UK Protect Duty)**: Dedicated compliance section at `/martyn-law` with 5 tabs: Venue & Scope, 12-item UK compliance Checklist, Security Plan (terrorism action plan / lockdown / evacuation / comms), Evidence Log (training/drills), and **System Check** (live TPR Max requirement mapping). Customer-isolated storage in `martyn_law_config` table (migration #024). Navigation link added to sidebar. System Check tab auto-fetches `GET /api/compliance/summary` (8 requirements from live data: zones, fire marshals, drills, preBookings, incidentReports, companySettings). PDF report available via `GET /api/compliance/report` (Puppeteer with HTML fallback). "What is Martyn's Law?" accordion with official Home Office factsheet link.
- **Lone Worker Protection (Task #7)**: Full automated welfare check system for staff and contractors working alone. Schema: `loneWorkerSessions` and `loneWorkerTokens` tables (migration #033); lone worker fields on `staff`, `contractorWorkers`, and `companySettings`. Backend: `POST /api/staff/:id/lone-worker/start|end`, `POST /api/contractor-workers/:id/lone-worker/start|end`, `GET /api/lone-worker/active`, `GET /api/lone-worker/sessions`, public `GET /api/lone-worker/ok/:token` (no auth). 60-second background cron fires L1/L2/L3 escalation emails when deadlines are missed. Emails: welfare check email with "I'm OK" link + 3-level escalation emails. Frontend: Shield/ShieldOff icon buttons on staff rows (grid + list + mobile) and contractor rows; amber pulsing badge when active. Dashboard live widget (hidden when no sessions). Settings → Lone Worker tab with enable toggle, interval/grace period, and L1/L2/L3 escalation contact config. Reports page → Lone Worker Sessions log (mobile cards + desktop table). Public page `/lone-worker/ok/:token` renders success/expired/already-used/inactive states without auth.
- **Drill Mode & Incident Reports**: Fire Drill toggle on the Muster page activates amber "FIRE DRILL IN PROGRESS" banner, labels emails with `[FIRE DRILL]` prefix, and marks the evacuation record with `is_drill=true`. On evacuation completion, an `incident_reports` record is auto-saved (customer-isolated, migration #025) storing accountability stats. `/incident-reports` page lists all past events with drill/emergency badge, duration, accountability counts and completion %, with "View / Print" link opening the HTML incident report. The report itself renders as print-ready HTML with event summary, stats, and full personnel register.

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

## Contractor Onboarding Overhaul (UK Compliance)
- **3-Step Company Wizard**: "Add New Contractor Company" replaced with a guided 3-step wizard: Step 1 Company Details → Step 2 UK Document Checklist → Step 3 Review & Submit → Step 4 Success panel. Progress stepper, Back/Next navigation, required-field gating on Next. After creation, Step 4 offers "Done" or "Add First Worker →" to immediately open the worker wizard pre-filled with the new company.
- **3-Step Worker Wizard**: "Add Worker" dialogs (in both ContractorManagement and ContractorDetails) replaced with: Step 1 Personal Details → Step 2 Right to Work & Cards → Step 3 Training & Compliance Summary. Legal basis shown for each item. Compliance summary panel before save. Right to Work expiry date field shown when status is Valid or Expired (mapped to `rightToWorkExpiryDate` in DB).
- **UK Document Framework**: Both wizards embed the full UK compliance framework: Legally Required (Public Liability, Employers' Liability, CIS) | Site Required (H&S Policy, RAMS) | Good Practice (Modern Slavery, Environmental Policy, Professional Indemnity). Worker equivalents: Right to Work, CSCS, IPAF, Asbestos Awareness, Manual Handling.
- **Compliance Status Badges (T003)**: Company cards in both grid and list views show a coloured compliance badge derived from `documentsStatus` field: 🔴 Missing legal docs / 🟡 Incomplete / 🟢 Compliant / ⬜ Not started. Badge derives from backend `documentsStatus` which covers all 8 doc types. `⚡ Finish setup` link shown if `onboardingCompleted === false`.
- **UK Document Checklist Tab (T004)**: Documents tab on ContractorDetails now shows a structured checklist of all 8 UK document types, grouped by Legally Required / Site Required / Good Practice. Compliance score bar at top. Expiry warnings for docs due within 30 days (⚠️). Upload/Replace/View buttons per document. `GET /api/contractors` extended to include all 8 document types in `documentsStatus`.
- **RAMS Management (full module)**: Risk Assessment & Method Statement (RAMS) system integrated as 7th tab in ContractorManagement. Schema: `ramsDocuments` extended with versioning (`version`, `previousVersionId`), approval workflow (`approvedBy`, `approvedAt`, `rejectionReason`), job context (`jobDescription`, `siteLocation`, `workCategory`), `requiredBeforeAccess` flag. Two new tables: `ramsAcknowledgements` (worker sign-off with deduplication) and `ramsAuditLog` (full history). 9 API routes (`/api/rams/*`): list, create, update, approve, reject, new-version (archives old), soft-delete, get-acknowledgements, acknowledge, audit-trail, get-single. UI: stat cards, search/filter bar, status badges, inline approve/reject, UploadDialog, ReviewDialog, DetailDialog with 3-tab view (Details / Acknowledgements / Audit Trail), per-company compliance summary.
- **RAMS linked to Contractor Compliance tab**: `RAMSManagement` component now accepts `companyId` and `embedded` props. When used in `ContractorDetails.tsx`, it: (1) fetches only that contractor's RAMS docs via `GET /api/rams?companyId=...`, (2) hides the company filter and multi-company compliance summary, (3) pre-fills the upload dialog with the contractor's company ID. The hardcoded "RAMs Certification" placeholder in the Compliance tab is replaced by the live `<RAMSManagement companyId={id} embedded />`. The Activity tab now merges RAMS events (uploads, approvals, rejections, new versions) derived from the RAMS docs into the contractor's activity timeline, sorted newest-first, with coloured badge labels and contextual icons.