# TPR Max — Total Personnel Register

**A comprehensive site management and compliance platform for the safety and security sector.**

TPR Max gives organisations complete visibility and control over everyone on site — visitors, contractors, and staff — with a powerful emergency mustering module, full UK contractor compliance management, and a suite of integrations with leading access control hardware.

Built for facilities managers, safety officers, and security teams who need more than a basic sign-in book.

---

## What TPR Max Does

### Visitor Management
- Walk-in and pre-booked visitor check-in with photo capture and digital signature
- QR-code visitor badges with optional thermal printing
- Host notification emails on arrival
- Health & safety rules acceptance at sign-in
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
- Staff directory with departments and role management
- QR-code access cards and digital wallet passes
- Time and attendance tracking (check-in/out)
- Integration with Biostar 2 and Paxton Net2 access control systems
- Voice announcements on arrival via 8x8 integration

### Emergency Mustering & Evacuation
- One-click evacuation activation from any device
- Real-time accountability dashboard — see who is accounted for instantly
- Fire Marshal mobile view (permanent URL, no login required, works on any phone)
- Self-mark-safe email tokens sent to all personnel
- Zone-based sweep management
- Drill mode with separate drill records
- PDF muster reports and post-evacuation incident reports
- Martyn's Law compliance module

### Lone Worker Protection
- Automated welfare check-in system with configurable intervals
- Escalating alerts to L1, L2, and L3 contacts if no response
- Full session history and audit trail

### Site Inductions
- Customisable multi-step induction builder
- AI-generated safety videos using OpenAI
- Public acceptance links (no login required for inductees)
- Completion certificates
- Separate induction tracks for visitors, contractors, and staff

### Planned Preventative Maintenance (PPM)
- Asset register with maintenance templates
- Scheduled work orders with automatic due-date calculation
- Contractor assignment with public work order access links
- Certificate and document upload on job completion
- PDF export and bulk alert notifications

### Meeting Room Booking
- Calendar-based room management with conflict detection
- Recurring bookings and check-in confirmation

### ID Badge Printing
- Network thermal printing (Toshiba TEC and Zebra)
- Drag-and-drop card designer
- QR code and branding support

### Reporting & Analytics
- On-site occupancy dashboards
- Time and attendance reports
- Contractor compliance summaries
- CO₂ and sustainability reports
- PDF export for all report types

---

## Architecture

TPR Max is a multi-tenant SaaS platform built with **complete database isolation** — each customer receives their own dedicated PostgreSQL database provisioned automatically on signup. This means:

- No cross-customer data leakage is architecturally possible
- GDPR compliance is straightforward — customer data can be fully exported or deleted in isolation
- Each customer's database scales independently

```
┌─────────────────────────────────────────┐
│              TPR Max Platform           │
│                                         │
│  ┌─────────────┐   ┌─────────────────┐  │
│  │  Management │   │  Customer DBs   │  │
│  │  Database   │   │  (one per       │  │
│  │  (shared)   │   │   customer)     │  │
│  └─────────────┘   └─────────────────┘  │
└─────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TailwindCSS, shadcn/ui, TanStack Query |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Neon serverless), Drizzle ORM |
| Auth | Session-based with bcrypt, CSRF protection |
| Payments | Stripe (subscriptions, free trials, webhooks) |
| Email | SendGrid / Nodemailer (SMTP) |
| File Storage | Google Cloud Storage / object storage |
| PDF Generation | Puppeteer, pdf-lib |
| AI | OpenAI (induction videos), Google Gemini (CO₂ reporting) |
| Printing | Toshiba TEC, Zebra (TCP/IP thermal printing) |
| Access Control | Suprema Biostar 2, Paxton Net2, Suprema CLUe |
| Voice | 8x8 |
| Build | Vite, esbuild |

---

## Integrations

| Integration | Purpose |
|---|---|
| **Suprema Biostar 2** | Access control sync, live entry events, staff attendance |
| **Paxton Net2** | Access control sync, door management |
| **Suprema CLUe** | QR-code dynamic visitor access passes |
| **Stripe** | Subscription billing, 14-day free trials |
| **SendGrid** | Transactional email delivery |
| **OpenAI** | AI-generated site induction videos |
| **Google Gemini** | CO₂ and sustainability calculations |
| **8x8** | Voice announcements on staff/visitor arrival |
| **Toshiba TEC / Zebra** | Network thermal badge and pass printing |
| **Google Cloud Storage** | Document and photo storage |

---

## Getting Started

### Prerequisites

- Node.js 18 or later
- PostgreSQL database (we recommend [Neon](https://neon.tech) for serverless PostgreSQL)
- A Stripe account (test mode is fine for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/AndyHalse/TPR-Max.git
cd TPR-Max

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
| `STRIPE_SECRET_KEY` | Stripe secret key (use `sk_test_...` for development) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SENDGRID_API_KEY` | SendGrid API key for email delivery |
| `OPENAI_API_KEY` | OpenAI key for AI induction video generation |
| `GEMINI_API_KEY` | Google Gemini key for CO₂ reporting |
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
TPR-Max/
├── client/               # React frontend
│   └── src/
│       ├── pages/        # Application pages
│       ├── components/   # Shared UI components
│       └── hooks/        # Custom React hooks
├── server/               # Express backend
│   ├── routes/           # Feature-based route modules
│   │   ├── auth.ts
│   │   ├── visitors.ts
│   │   ├── contractors.ts
│   │   ├── staff.ts
│   │   ├── emergency.ts
│   │   ├── induction.ts
│   │   ├── loneWorker.ts
│   │   ├── ppm.ts
│   │   ├── rams.ts
│   │   ├── meetingRooms.ts
│   │   ├── reports.ts
│   │   ├── settings.ts
│   │   ├── billing.ts
│   │   ├── platformAdmin.ts
│   │   └── index.ts
│   ├── services/         # Business logic services
│   ├── utils/            # Shared utilities
│   └── index.ts          # Server entry point
├── shared/               # Types and schema shared between client and server
├── migrations/           # Database migrations
└── docs/                 # Deployment and architecture documentation
```

---

## Deployment

Documentation for production deployment is available in the `docs/` directory:

- `docs/AWS_DEPLOYMENT.md` — Full AWS deployment guide
- `ARCHITECTURE.md` — Multi-tenant architecture detail
- `PRODUCTION_READINESS.md` — Pre-launch checklist

---

## Platform Administration

TPR Max includes a platform administration portal at `/platform-admin` for ACS staff to manage all customer accounts, provision new customers, monitor usage, and manage feature access.

---

## Licence

MIT

---

## About ACS Safety & Security Ltd

TPR Max is developed and maintained by **ACS Safety & Security Ltd**, specialists in access control, CCTV, and site safety compliance systems.
