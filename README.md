# TPR Max — Total Protection & Response

### The All-in-One Connected Workforce & Site Safety Platform

TPR gives organisations complete visibility and control over every person on site — visitors, contractors, and staff — with 23 integrated modules covering the full employee and site lifecycle. From contractor onboarding and emergency mustering to HR document management and lone worker protection, TPR replaces disconnected spreadsheets and legacy sign-in books with a single, audit-ready platform.

Built for facilities managers, safety officers, HR teams, and security professionals who need more than a basic sign-in book.

---

## What TPR Does

### Visitor Management
- Walk-in and pre-booked visitor check-in with photo capture and digital signature
- QR-code visitor badges with optional thermal printing (Toshiba TEC / Zebra)
- Host notification emails on arrival
- Health & Safety rules acceptance at sign-in
- NDA / confidentiality agreement acceptance at check-in
- Automatic end-of-day checkout
- Full visitor history and reporting

### Contractor Management
- Contractor company profiles with complete UK compliance tracking:
  - Public Liability and Employers' Liability insurance
  - CIS registration, Right to Work, CSCS cards
  - RAMS (Risk Assessment & Method Statement) document management
  - CDM 2015 project compliance
- Worker-level records with induction completion tracking
- Compliance expiry alerts and notifications
- Contractor kiosk self-service check-in
- CO₂ sustainability reporting per contractor visit

### Staff Management
- Staff directory with departments, roles, and employment details
- QR-code access cards and digital wallet passes (Apple / Google Wallet)
- Time and attendance tracking (check-in / check-out)
- Integration with Suprema BioStar 2 and Paxton Net2 access control systems
- Voice announcements on arrival via 8×8 integration
- Org chart with drag-and-drop line manager assignment

### HR Module *(TPR Max tier)*
A full employee lifecycle suite built directly into the platform:

- **HR Dashboard** — real-time workforce overview with compliance indicators
- **Onboarding** — customisable task-based onboarding checklists per new starter
- **Absence Management** — absence recording, return-to-work workflow, Bradford Factor calculation
- **Leave Management** — annual leave requests, approvals, and balance tracking
- **Right to Work** — RTW document upload, expiry tracking, and kiosk-level access blocking on expiry
- **DBS Checks** — DBS certificate recording with renewal reminders
- **Appraisals** — scheduled performance reviews with outcome recording
- **Training Records** — training matrix and per-employee training log
- **Payroll Export** — CSV / JSON payroll summary including hours worked, sick days, leave taken, starters, and leavers
- **HR Documents** — per-employee confidential document storage with role-gated download
- **Leaver Process** — structured offboarding checklist with last-day and leaving reason tracking

### Risk Assessment Builder *(TPR Pro / Max)*
- Drag-and-drop RA builder supporting General, COSHH, Fire, Manual Handling, and DSE assessments
- Hierarchy-of-controls hazard management with severity / likelihood risk matrix
- AI-powered control measure suggestions (Claude) based on hazard description and task context
- PDF export with company branding
- Full audit trail and version history

### Emergency Mustering & Evacuation
- One-click evacuation activation from any device
- Real-time accountability dashboard — see who is accounted for instantly
- Fire Marshal mobile view (permanent URL, no login required, works on any phone)
- Self-mark-safe email tokens sent to all personnel
- Zone-based sweep management
- Drill mode with separate drill records
- PDF muster reports and post-evacuation incident reports
- Martyn's Law (UK Protect Duty) compliance module

### Lone Worker Protection
- Automated welfare check-in system with configurable intervals
- Escalating alerts to L1, L2, and L3 contacts if no response
- Full session history and audit trail

### Site Inductions
- Customisable multi-step induction builder
- AI-generated safety videos using OpenAI
- Public acceptance links — no login required for inductees
- Completion certificates
- Separate induction tracks for visitors, contractors, and staff

### Planned Preventative Maintenance (PPM)
- Asset register with maintenance schedule templates
- Scheduled work orders with automatic due-date calculation
- Contractor assignment with public work order access links
- Certificate and document upload on job completion
- PDF export and bulk alert notifications

### Meeting Room Booking
- Calendar-based room management with conflict detection
- Recurring bookings and check-in confirmation via QR scan
- Attendee management for staff and external guests

### ID Badge Printing
- Network thermal printing (Toshiba TEC and Zebra)
- Drag-and-drop card designer
- QR code and branding support

### Reporting & Analytics
- On-site occupancy dashboards
- Time and attendance reports
- Contractor compliance summaries
- CO₂ and sustainability reports
- Bradford Factor and absence trend reports
- PDF and CSV export for all report types

---

## Architecture

TPR is a multi-tenant SaaS platform built with **complete database isolation** — each customer receives their own dedicated PostgreSQL database provisioned automatically on signup. This means:

- No cross-customer data leakage is architecturally possible
- GDPR compliance is straightforward — customer data can be fully exported or deleted in isolation
- Each customer's database scales independently

```
┌──────────────────────────────────────────────────────┐
│                    TPR Platform                      │
│                                                      │
│  ┌─────────────────┐   ┌──────────────────────────┐  │
│  │  Shared DB      │   │  Per-Customer Databases  │  │
│  │  (accounts,     │   │  ┌────────┐  ┌────────┐  │  │
│  │   billing,      │   │  │Cust A  │  │Cust B  │  │  │
│  │   platform      │   │  │  DB    │  │  DB    │  │  │
│  │   admin)        │   │  └────────┘  └────────┘  │  │
│  └─────────────────┘   └──────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TailwindCSS, shadcn/ui, TanStack Query |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Neon serverless), Drizzle ORM |
| Auth | Session-based with bcrypt, CSRF protection |
| Real-time | WebSockets (on-site presence, evacuation board) |
| File Storage | Google Cloud Storage / object storage |
| PDF Generation | Puppeteer (headless Chromium), pdf-lib |
| AI | OpenAI (induction videos), Google Gemini (CO₂ reporting), Anthropic Claude (RA Builder) |
| Printing | Toshiba TEC, Zebra (TCP/IP thermal printing) |
| Access Control | Suprema BioStar 2, Paxton Net2, Suprema CLUe |
| Communications | SendGrid (email), 8×8 (voice) |
| Payments | Stripe (subscriptions, free trials, webhooks) |
| Build | Vite, esbuild |

---

## Integrations

| Integration | Purpose |
|---|---|
| **Suprema BioStar 2** | Access control sync, live entry events, staff attendance |
| **Paxton Net2** | Access control sync, door management |
| **Suprema CLUe** | QR-code dynamic visitor access passes |
| **Stripe** | Subscription billing, 14-day free trials |
| **SendGrid** | Transactional email delivery |
| **OpenAI** | AI-generated site induction videos |
| **Anthropic Claude** | AI control measure suggestions in RA Builder |
| **Google Gemini** | CO₂ and sustainability calculations |
| **8×8** | Voice announcements on staff / visitor arrival |
| **Toshiba TEC / Zebra** | Network thermal badge and pass printing |
| **Google Cloud Storage** | Document, photo, and certificate storage |

---

## Subscription Tiers

| Feature | TPR Basic | TPR Pro | TPR Max |
|---|---|---|---|
| Visitor Management | ✅ | ✅ | ✅ |
| Contractor Management | ✅ | ✅ | ✅ |
| Staff Management | ✅ | ✅ | ✅ |
| Emergency Mustering | ✅ | ✅ | ✅ |
| Lone Worker Protection | — | ✅ | ✅ |
| Site Inductions | — | ✅ | ✅ |
| PPM | — | ✅ | ✅ |
| Meeting Room Booking | — | ✅ | ✅ |
| Risk Assessment Builder | — | ✅ | ✅ |
| Full HR Module | — | — | ✅ |
| Martyn's Law Module | — | — | ✅ |
| AI Features | — | — | ✅ |

---

## Getting Started

### Prerequisites

- Node.js 18 or later
- PostgreSQL database (we recommend [Neon](https://neon.tech) for serverless PostgreSQL)
- A Stripe account (test mode is fine for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/AndyHalse/TPR.git
cd TPR

# Install dependencies
npm install

# Copy the example environment file and fill in your values
cp .env.example .env
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Long random string for session signing |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` for development) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SENDGRID_API_KEY` | SendGrid API key for email delivery |
| `OPENAI_API_KEY` | OpenAI key for AI induction video generation |
| `GEMINI_API_KEY` | Google Gemini key for CO₂ reporting |
| `EIGHT_X_EIGHT_API_KEY` | 8×8 key for voice announcements |
| `NODE_ENV` | Set to `production` for live deployments |

### Running in Development

```bash
npm run dev
```

The application will start on `http://localhost:5000`.

### Building for Production

```bash
npm run build
npm run start
```

### Database Setup

```bash
# Push the schema to your database
npm run db:push
```

---

## Project Structure

```
TPR/
├── src/                  # React frontend
│   ├── pages/            # Route-level page components
│   ├── components/       # Shared UI components
│   └── lib/              # Frontend utilities and API client
├── server/               # Express backend
│   ├── routes/           # Feature-based API route modules
│   │   ├── visitors.ts
│   │   ├── contractors.ts
│   │   ├── staff.ts
│   │   ├── emergency.ts
│   │   ├── raBuilder.ts
│   │   ├── hrStaff.ts
│   │   ├── hrAbsence.ts
│   │   ├── hrLeave.ts
│   │   ├── hrLeaver.ts
│   │   ├── hrPayroll.ts
│   │   ├── hrRightToWork.ts
│   │   ├── hrDocuments.ts
│   │   ├── hrDbs.ts
│   │   ├── hrAppraisals.ts
│   │   ├── hrTraining.ts
│   │   ├── hrOnboarding.ts
│   │   ├── hrDashboard.ts
│   │   ├── induction.ts
│   │   ├── loneWorker.ts
│   │   ├── ppm.ts
│   │   ├── rams.ts
│   │   ├── meetingRooms.ts
│   │   ├── reports.ts
│   │   └── billing.ts
│   ├── managers/         # AI and service managers
│   ├── services/         # Business logic services
│   └── utils/            # Shared utilities
├── shared/               # Types and schema shared between client and server
├── drizzle/              # Database migrations
└── docs/                 # Deployment and architecture documentation
```

---

## Deployment

Documentation for production deployment is in the `docs/` directory:

- `ARCHITECTURE.md` — Multi-tenant architecture detail
- `PRODUCTION_READINESS.md` — Pre-launch checklist

---

## Platform Administration

TPR includes a platform administration portal at `/platform-admin` for managing all customer accounts, provisioning new customers, monitoring usage, and controlling feature access per subscription tier.

---

## Licence

MIT

---

## About ACS Safety & Security Ltd

TPR is developed and maintained by **ACS Safety & Security Ltd**, specialists in access control, CCTV, and site safety compliance systems.
