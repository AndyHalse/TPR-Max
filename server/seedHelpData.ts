import { db } from "./db";
import { helpCategories, helpArticles, insertHelpArticleSchema } from "@shared/schema";
import { eq, like } from "drizzle-orm";
import { logger } from './utils/logger';

// ─── New categories and articles added after initial seeding ─────────────────
const NEW_CATEGORIES = [
  {
    name: "Planned Preventative Maintenance",
    description: "Managing PPM assets, templates, schedules, and maintenance task records",
    icon: "wrench",
    color: "#0d9488",
    sortOrder: 12,
    isActive: true
  },
  {
    name: "Lone Worker Monitoring",
    description: "Setting up lone worker sessions, check-in alerts, and emergency escalation",
    icon: "user",
    color: "#f97316",
    sortOrder: 13,
    isActive: true
  },
  {
    name: "Members & Community",
    description: "Managing members, memberships, and community group check-in",
    icon: "users",
    color: "#8b5cf6",
    sortOrder: 14,
    isActive: true
  },
  {
    name: "Human Resources",
    description: "Staff records, org chart, leave, training matrix, absence, onboarding, leavers, appraisals, payroll export, Right to Work, DBS, and confidential document management",
    icon: "users",
    color: "#6366f1",
    sortOrder: 15,
    isActive: true
  },
  {
    name: "Pre-bookings & Invitations",
    description: "Pre-booking visitors, sending invitations, recurring visits and QR check-in",
    icon: "mail",
    color: "#0ea5e9",
    sortOrder: 16,
    isActive: true
  }
];

function buildNewArticles(categoryMap: Record<string, string>) {
  const createSlug = (title: string): string =>
    title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

  return [
    // ─── CDM 2015 COMPLIANCE ───────────────────────────────────────────────────
    {
      categoryId: categoryMap["Safety & Compliance"] ?? categoryMap["Contractor Management"],
      title: "CDM 2015 Compliance",
      slug: createSlug("CDM 2015 Compliance"),
      summary: "Managing CDM 2015 obligations, project registers, contractor notifiability, and F10 notifications",
      content: `# CDM 2015 Compliance

TPR-Max provides a dedicated CDM 2015 (Construction Design and Management) compliance module to help Principal Contractors, Principal Designers, and Clients meet their legal obligations.

## What Is CDM 2015?
The Construction (Design and Management) Regulations 2015 place duties on Clients, Principal Designers, and Principal Contractors for notifiable construction projects. Key obligations include:

- Appointing a Principal Designer and Principal Contractor in writing
- Notifying the HSE (Health & Safety Executive) via an F10 form for notifiable projects
- Maintaining a Construction Phase Plan and Health & Safety file
- Ensuring contractor competence before work begins

## CDM Project Register
Manage all your notifiable projects in one place:

1. Navigate to **Contractors** > **CDM 2015** tab
2. Click **"Add CDM Project"**
3. Fill in the project wizard:
   - **Project details**: Name, description, address, expected start and end dates
   - **Duty holders**: Client, Principal Designer, and Principal Contractor names/companies
   - **Notifiability check**: Answer the two questions (>30 working days with >20 simultaneous workers, or >500 person-days) — TPR-Max automatically determines if F10 notification is required
4. The project is added to your CDM compliance register

## F10 Notification
For notifiable projects, the HSE must be informed before the construction phase begins:

- TPR-Max flags projects as **"F10 Required"** based on your answers to the notifiability questions
- A status banner on each project shows whether F10 has been submitted
- Mark a project as F10 submitted using the project detail controls
- Future versions will support automated F10 email alerts when submission is due

## Contractor CDM Fields
Each contractor company has CDM-specific fields:

- **CHAS Accredited**: Toggle to record CHAS, Constructionline, or SafeContractor status
- **CDM Duty Role**: Client / Principal Designer / Principal Contractor / Contractor
- **CDM Notes**: Free-text field for compliance notes, accreditation numbers, or expiry dates

Update these in the contractor profile under **Edit Contractor**.

## CDM Compliance Register
The register provides an at-a-glance view of:
- All active and completed CDM projects
- Notifiability status (notifiable / not notifiable)
- F10 submission status
- Project dates and duty holders

## Export
The CDM project register can be exported as a PDF for client reporting or HSE audit evidence.`,
      targetPages: ["contractors", "/contractors", "cdm"],
      searchKeywords: ["CDM", "CDM 2015", "F10", "notifiable", "HSE", "construction", "principal contractor", "duty holder", "CHAS", "compliance"],
      estimatedReadTime: 6,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 5,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── PLANNED PREVENTATIVE MAINTENANCE ────────────────────────────────────
    {
      categoryId: categoryMap["Planned Preventative Maintenance"],
      title: "Planned Preventative Maintenance (PPM)",
      slug: createSlug("Planned Preventative Maintenance PPM"),
      summary: "Setting up PPM assets, maintenance templates, schedules, and recording completed tasks",
      content: `# Planned Preventative Maintenance (PPM)

TPR-Max includes a full PPM module to schedule, track, and record maintenance activities across your assets and facilities.

## What Is PPM?
Planned Preventative Maintenance is the regular, scheduled maintenance of equipment and facilities to prevent breakdowns and ensure compliance. In UK workplaces, PPM supports obligations under:
- The Workplace (Health, Safety and Welfare) Regulations 1992
- The Lifting Operations and Lifting Equipment Regulations (LOLER)
- The Provision and Use of Work Equipment Regulations (PUWER)
- NHS Estates and facilities management standards

## PPM Assets
Assets are the items you maintain — equipment, plant, systems, or areas:

1. Navigate to **PPM** in the main menu
2. Click **"Add Asset"**
3. Enter asset details:
   - Asset name and reference number
   - Location and description
   - Asset type / category
4. Save — the asset is now ready for maintenance schedules

## Maintenance Templates
Templates define what maintenance work needs to be done and how often:

1. Click **"Templates"** in the PPM section
2. Click **"Add Template"**
3. Configure the template:
   - **Template name**: e.g., "Annual Fire Extinguisher Inspection"
   - **Frequency**: Daily / Weekly / Monthly / Quarterly / Annual / Custom
   - **Description**: Detailed instructions for the maintenance task
   - **Estimated duration**: Expected time to complete
4. Save the template

## PPM Schedules
Link an asset to a maintenance template to create a schedule:

1. Click **"Schedules"** in the PPM section
2. Click **"Add Schedule"**
3. Select the asset and template
4. Set the first due date
5. TPR-Max automatically calculates the next due date based on the template frequency
6. Overdue tasks are highlighted in red

## Recording Completed Maintenance
When maintenance is carried out:

1. Find the due schedule in the PPM dashboard
2. Click **"Mark Complete"**
3. Enter completion details:
   - Completed by (staff member or contractor)
   - Date completed
   - Notes and findings
   - Evidence (photo upload if required)
4. Save — the next occurrence is automatically scheduled

## PPM Dashboard
The PPM overview shows:
- **Due Today**: Tasks scheduled for today
- **Overdue**: Tasks past their due date (highlighted in red)
- **Upcoming**: Tasks due in the next 30 days
- **Completed**: Recent maintenance history

## Best Practices
- Set up all recurring maintenance tasks at system setup
- Assign clear responsibility for each schedule
- Upload evidence photos for auditable records
- Review overdue tasks weekly in the PPM dashboard`,
      targetPages: ["ppm", "/ppm"],
      searchKeywords: ["PPM", "planned preventative maintenance", "maintenance", "assets", "schedules", "LOLER", "PUWER", "facilities"],
      estimatedReadTime: 6,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 1,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── LONE WORKER MONITORING ───────────────────────────────────────────────
    {
      categoryId: categoryMap["Lone Worker Monitoring"] ?? categoryMap["Safety & Compliance"],
      title: "Lone Worker Monitoring",
      slug: createSlug("Lone Worker Monitoring"),
      summary: "How to start lone worker sessions, configure check-in alerts, and manage escalations",
      content: `# Lone Worker Monitoring

TPR-Max includes lone worker monitoring to protect staff and contractors who work alone or in isolated areas, in line with the HSE's guidance on lone working.

## What Is Lone Working?
The HSE defines a lone worker as someone who works by themselves without close or direct supervision. UK employers have a legal duty of care to assess and manage the risks to lone workers.

## Starting a Lone Worker Session
For a staff member:
1. Go to the **Staff** section and open the staff member's profile
2. Click **"Start Lone Worker Session"**
3. Set the check-in interval (e.g., every 30 minutes, every hour)
4. Optionally set an end time for the session
5. Confirm — the session begins and a unique check-in link is sent to the worker

For a contractor worker:
1. Open the contractor worker's profile
2. Click **"Start Lone Worker Session"**
3. Configure check-in interval and end time
4. Confirm

## Worker Check-ins
The lone worker receives a unique URL or SMS/email link:
- They click the link at each check-in interval to confirm they are safe
- The check-in is recorded with a timestamp
- No login is required — the link works from any device

## Missed Check-in Alerts
If a worker misses their check-in window:
- The system flags the session as overdue
- An alert is raised in the TPR-Max admin interface
- Depending on configuration, escalation notifications can be sent

## Monitoring Active Sessions
Administrators can monitor all active lone worker sessions:
1. Navigate to **Lone Worker** in the main menu
2. The dashboard shows all active sessions with:
   - Worker name and role
   - Session start time
   - Last check-in time
   - Next check-in due
   - Status (checked in / overdue)

## Ending a Session
A lone worker session ends when:
- The scheduled end time is reached
- An admin clicks **"End Session"** in the dashboard
- The worker uses the end-session link

## Compliance and Records
All lone worker session data is retained for:
- Incident investigation
- Insurance and HSE compliance evidence
- Risk assessment reviews

## Best Practices
- Conduct a lone working risk assessment before deploying this feature
- Ensure workers understand how to use the check-in system
- Define escalation procedures clearly (who to contact if a check-in is missed)
- Review session records regularly`,
      targetPages: ["lone-worker", "/lone-worker"],
      searchKeywords: ["lone worker", "lone working", "check-in", "safety", "HSE", "isolated", "monitoring", "escalation"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 1,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── MEMBERS & COMMUNITY ─────────────────────────────────────────────────
    {
      categoryId: categoryMap["Members & Community"] ?? categoryMap["Staff Management"],
      title: "Members & Community Management",
      slug: createSlug("Members and Community Management"),
      summary: "Managing members, memberships types, check-in, and including members in emergency mustering",
      content: `# Members & Community Management

TPR-Max supports a Members module for organisations such as clubs, associations, leisure centres, or any venue where people have ongoing membership relationships rather than one-off visits.

## What Are Members?
Members are distinct from visitors and staff — they are people with a recurring relationship with your organisation, such as:
- Sports club or gym members
- Community centre users
- Professional association members
- Volunteer groups

## Adding Members
1. Navigate to **Members** in the main menu
2. Click **"Add Member"**
3. Enter member details:
   - First name and last name
   - Email address and phone number
   - Membership type (e.g., Full Member, Junior, Associate, Volunteer)
   - Membership start date and expiry
4. Upload a photo for ID badge printing
5. Save the member profile

## Member Check-in / Check-out
Members can check in when they arrive on site:
1. Find the member in the Members list
2. Click **"Check In"**
3. Select a zone if applicable
4. The member appears on the dashboard as "On Site"

Check-out follows the same process.

## Including Members in Emergency Mustering
Members who are checked in are fully included in emergency evacuations:
- They appear on the Fire Marshal panel and muster page
- They receive evacuation email alerts during an active evacuation
- They can mark themselves safe using their personal safe link
- They are counted in zone-based personnel totals

## Membership Types
Configure membership categories to organise your members:
- Create types in Settings
- Types are used for filtering, reporting, and check-in categorisation

## Member Reports
The Reports section includes member activity data:
- Daily and monthly check-in counts
- Membership utilisation by type
- On-site time records

## ID Badges for Members
Members support the same ID card printing features as visitors and contractors:
- Print membership cards with photo, name, and membership type
- QR code for fast check-in at reception`,
      targetPages: ["members", "/members"],
      searchKeywords: ["members", "membership", "community", "club", "association", "check-in", "volunteer"],
      estimatedReadTime: 4,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 1,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── BIOSTAR 2 INTEGRATION ────────────────────────────────────────────────
    {
      categoryId: categoryMap["Settings & Configuration"],
      title: "BioStar 2 Access Control Integration",
      slug: createSlug("BioStar 2 Access Control Integration"),
      summary: "Connecting TPR-Max to Suprema BioStar 2 for access control synchronisation and live event monitoring",
      content: `# BioStar 2 Access Control Integration

TPR-Max integrates natively with Suprema BioStar 2, the leading access control and time-attendance platform, to synchronise personnel data and bring door reader events into your site management dashboard.

## What Is BioStar 2?
BioStar 2 is an access control and time-attendance management platform by Suprema. It manages door readers, turnstiles, biometric devices, and access permissions. The TPR-Max integration bridges your physical access control system with your personnel management and emergency mustering capabilities.

## Setting Up the Integration
Configuration is done in **Settings** > **BioStar 2 Integration**:

1. Enter your BioStar 2 server details:
   - **Server URL**: Your BioStar 2 server address (e.g., https://192.168.1.100:8443)
   - **Username**: BioStar 2 admin username
   - **Password**: BioStar 2 admin password
2. Click **"Test Connection"** to verify connectivity
3. Click **"Save"** to enable the integration
4. The integration begins receiving live door events

## Live Door Event Log
Once connected, TPR-Max receives real-time door access events:
- Door open / close events
- Access granted / denied events
- Device status updates
- Personnel identification from BioStar 2 enrolled users

View the live log in **Settings** > **BioStar 2** > **Live Event Log**.

## Personnel Synchronisation
The integration can synchronise personnel between BioStar 2 and TPR-Max:
- Enrolled BioStar 2 users can be matched to TPR-Max staff records
- Access grant events can trigger automatic check-in in TPR-Max
- This eliminates manual check-in for staff using door readers

## Security Considerations
- Communication with BioStar 2 uses HTTPS with TLS
- Credentials are stored securely and never exposed in client-side code
- The connection runs server-side — BioStar 2 is not accessible directly from browsers
- Each TPR-Max customer has their own isolated BioStar 2 connection

## Troubleshooting the BioStar 2 Connection
**Connection refused**:
1. Verify the server URL includes the port (default: 8443)
2. Check the BioStar 2 server is running and accessible from TPR-Max's server
3. Ensure the BioStar 2 account has API access permissions
4. Check that SSL certificate issues are not blocking the connection

**No events appearing**:
1. Confirm the integration is enabled and shows as Connected
2. Trigger a door event manually in BioStar 2 and refresh the live log
3. Check BioStar 2 server logs for API errors`,
      targetPages: ["settings", "/settings", "biostar"],
      searchKeywords: ["BioStar 2", "BioStar", "Suprema", "access control", "door reader", "biometric", "integration", "RFID"],
      estimatedReadTime: 5,
      difficulty: "advanced",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 4,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── PPM ANNUAL PLANNER ───────────────────────────────────────────────────
    {
      categoryId: categoryMap["Planned Preventative Maintenance"],
      title: "Using the PPM Annual Planner",
      slug: createSlug("Using the PPM Annual Planner"),
      summary: "How to read and use the 12-month maintenance grid, filters, colour codes, Qty and Location columns, and demo data",
      content: `# Using the PPM Annual Planner

The PPM Annual Planner gives you a bird's-eye view of all your assets' maintenance across an entire calendar year — one row per asset, one column per month.

## Opening the Planner
1. Navigate to **PPM** in the main menu
2. Click the **Annual Planner** tab
3. Use the year selector (top-right) to switch between 2024 (history), 2025, 2026 (current), and 2027 (forward plan)

## The Grid Columns

Each row in the grid has the following columns, in order:

| Column | What it shows |
|--------|--------------|
| **Asset** | Asset name and reference / category sub-text |
| **Qty** | Number of maintenance schedules attached to this asset (a proxy count until a dedicated quantity field is added) |
| **Location** | The asset's physical location (e.g. "Basement Plant Room"). Hover for the full text if it is truncated. Hidden on small screens. |
| **Freq** | Coloured badge showing the maintenance frequency: **12M** annual, **6M** six-monthly, **3M** quarterly, **M** monthly, **W** weekly |
| **Jan – Dec** | One cell per month. Cell colour indicates the work order status for that month (see legend below). |

## Colour Legend

- **Red** — Overdue: past due date, not completed
- **Amber** — Due soon: due within 14 days
- **Blue** — In Progress: work order has been started
- **Green** — Completed: maintenance was carried out
- **Light blue** — Scheduled: planned but not yet due
- **Empty / grey** — No work order for this month (asset is not due, e.g. an annual asset in a non-due month)

Click any coloured cell to open the full work order details.

## Category Group Headers

Assets are automatically grouped by maintenance category in this order:
**Fire Safety → Water Hygiene → HVAC → Mechanical → Electrical → Security → Lifts & Hoists → Grounds → Cleaning → Other**

Each group header shows the category name. Assets without a category appear at the bottom under **Other**.

## Filtering Assets

Use the filter bar above the grid to narrow the view:

- **Search assets** — type any part of an asset name for an instant real-time match
- **Category** — show only one maintenance category at a time
- **Frequency** — filter by service interval (Annual, 6-Monthly, Quarterly, Monthly, Weekly)
- **Status** — show only assets that have at least one Overdue / Scheduled / Completed work order in the selected year
- **Clear filters** — resets all four filters at once

When filters are active, the **Total Assets** stat card shows the filtered count vs the full total (e.g. "12 / 57").

## Summary Cards

Five cards at the top of the planner show counts for the selected year:

- **Total Assets** — number of assets in view (filtered / total)
- **Completed** — work orders with status "completed"
- **Upcoming** — scheduled work orders not yet due
- **Overdue** — work orders past their due date
- **No Dates Recorded** — assets with no work orders in the selected year

## Exporting the Planner

- **Export CSV** — downloads a spreadsheet with asset name, reference, category, location, a cell status per month, plus totals
- **Print / Export PDF** — opens the browser print dialog. The planner is formatted for A3 landscape for best results.
- **Email Report** — sends the annual planner as a formatted HTML email to any address

## Loading Demo Data

If you are setting up TPR-Max for the first time, or want to see example data, click **"Load Demo Data"** in the PPM section (available to Administrators only).

**Important: Loading demo data wipes all existing PPM assets, schedules, templates, and work orders before inserting fresh examples.** Do not use this on a live account with real data.

The demo dataset includes:
- 30 realistic UK facility assets across 7 categories (HVAC, Fire Safety, Mechanical, Electrical, Water Hygiene, Security, Lifts & Hoists)
- Maintenance schedules with the correct statutory frequencies (monthly, quarterly, 6-monthly LOLER, annual, and 5-yearly EICR)
- Work orders spread across 2024–2027 with realistic statuses:
  - **2024**: Historical year — mostly completed, a small number of overdue entries for realism
  - **2025**: Recent year — completed throughout, with a few late-year overdue entries
  - **2026**: Current year — January–February completed; March split completed/overdue; April mix of completed/overdue/in-progress; May onwards all scheduled
  - **2027**: Forward planning — all scheduled
- Each work order is correctly linked to its schedule, so the Freq badge and month cells are accurate for each asset's maintenance interval

After loading, use the year picker to navigate between years and explore the full four-year dataset.`,
      targetPages: ["ppm", "/ppm", "annual-planner"],
      searchKeywords: ["PPM", "annual planner", "maintenance grid", "12-month", "qty", "quantity", "location", "frequency", "LOLER", "EICR", "demo data", "colour legend", "filter", "category group"],
      estimatedReadTime: 7,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: true,
      isQuickStart: true,
      sortOrder: 2,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR MODULE OVERVIEW ───────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "HR Module Overview",
      slug: createSlug("HR Module Overview"),
      summary: "Tour of the HR landing dashboard and the sub-modules: leave, training, absence, onboarding, leavers, appraisals and payroll export",
      content: `# HR Module Overview

The HR module brings staff record management, people operations and UK employment compliance into one place. It sits at **/hr** and is currently in Beta — verify critical data (right-to-work, payroll, appraisals) independently until full release.

## The HR Landing Dashboard
The /hr page opens with a live summary dashboard above the module tiles. Each card is click-through to the relevant area:

- **Active staff** — currently employed (excludes leavers / archived)
- **On leave today** — names of staff on any approved leave today
- **Starting this month** — new starters with a contract start date in the current month
- **Leavers this month** — staff whose contract end date falls this month
- **Onboarding in progress** — checklists with outstanding tasks
- **Training expiring (30 days)** — mandatory training expiring within 30 days
- **Appraisals due (30 days)** — performance reviews scheduled in the next 30 days
- **Pending leave approvals** — leave requests awaiting line manager decision

A "Today" panel underneath shows birthdays, work anniversaries and people returning from leave today.

## Sub-modules
Each tile below the dashboard opens a dedicated area:

- **Org Chart** — visual reporting structure
- **Leave Calendar & Requests** — annual leave, sickness, parental leave
- **Training Matrix** — mandatory training, certifications, expiry tracking
- **Absence Overview** — absence records, Bradford Factor scores and trends
- **Onboarding** — new-starter checklists and progress
- **Leavers** — exit process, return of equipment, final pay
- **Appraisals** — performance reviews and next-review dates
- **Payroll Export** — month-end export to your payroll provider

## Feature Toggles
The HR module is gated by the **featureHrModule** customer setting. Administrators can enable/disable the whole module under **Settings** > **Features**. When disabled, the HR tile and dashboard are hidden from navigation.`,
      targetPages: ["hr", "/hr"],
      searchKeywords: ["HR", "human resources", "people", "staff records", "dashboard", "onboarding", "leave", "training", "appraisal", "payroll"],
      estimatedReadTime: 4,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: true,
      isQuickStart: true,
      sortOrder: 1,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR LEAVE MANAGEMENT ──────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Leave Management & Calendar",
      slug: createSlug("HR Leave Management and Calendar"),
      summary: "Requesting, approving and viewing annual leave, sickness, parental and compassionate leave on the company calendar",
      content: `# Leave Management & Calendar

The HR Leave module covers all forms of staff time off — annual leave, sickness, parental, compassionate, unpaid, and TOIL — with a shared company calendar and approval workflow.

## Requesting Leave
1. Navigate to **HR** > **Leave**
2. Click **"Request Leave"**
3. Select the leave type, start date and end date (half-days supported)
4. Add an optional reason / notes
5. Submit — the request is sent to the staff member's line manager

## Approving Leave
Line managers see pending requests in the HR dashboard card "Pending leave approvals":
1. Click into the request to see overlap with team members
2. Click **Approve** or **Decline** with an optional note
3. The requester is notified by email

## The Leave Calendar
The calendar view (default) shows every approved and pending request across the company:
- Each leave type has its own colour
- Filter by department, leave type or status
- Today's column is highlighted
- Click **"Today"** to jump to the current date
- Use the **/hr/leave?view=today** deep-link from the HR dashboard's "On leave today" card

## Entitlements & Balances
Each staff member has:
- **Annual leave entitlement** (set on their profile)
- **Carried-over days** from the previous holiday year
- **Days taken** (auto-calculated from approved annual leave)
- **Days remaining** (entitlement + carry + accrual − taken)

Balances appear on the staff profile and in the Leave dashboard.

## Bank Holidays
UK bank holidays are auto-populated for England & Wales. Adjust the calendar in **Settings** > **HR** > **Bank Holidays** if you operate in Scotland or Northern Ireland.

## Pending Approvals Tab
The **/hr/leave?tab=pending** view groups requests awaiting decision by line manager, useful for HR teams chasing overdue approvals.`,
      targetPages: ["hr-leave", "/hr/leave"],
      searchKeywords: ["leave", "holiday", "annual leave", "sickness", "parental", "TOIL", "calendar", "approval", "entitlement"],
      estimatedReadTime: 5,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 2,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR TRAINING MATRIX ───────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Training Matrix & Certifications",
      slug: createSlug("HR Training Matrix and Certifications"),
      summary: "Recording mandatory training, certifications and renewals with expiry tracking and reminders",
      content: `# Training Matrix & Certifications

The Training Matrix is a grid view of every staff member against every mandatory and optional training course, with at-a-glance status colours.

## Adding a Training Course
1. Navigate to **HR** > **Training**
2. Click **"Add Course"**
3. Enter:
   - Course name (e.g., "First Aid at Work", "Manual Handling")
   - Validity period in months (3, 12, 24, 36)
   - Whether it is **Mandatory**
   - Provider / awarding body (optional)
4. Save — the course appears as a column in the matrix

## Recording a Training Record
For each staff member who has completed the course:
1. Click the cell where their row meets the course column
2. Enter the **Completion date**
3. Upload the certificate (PDF / image)
4. The expiry date is auto-calculated from validity period
5. Save

## Status Colours
- **Green** — Valid, expires more than 90 days from now
- **Amber** — Expiring within 90 days
- **Red** — Expired or expires within 30 days
- **Grey** — Not yet completed

## Expiry Alerts
The HR dashboard card "Training expiring (30 days)" surfaces every mandatory course expiring soon. Click through to **/hr/training** and the matrix filters to those records.

## Bulk Operations
- **Filter** by department, course or status
- **Export to CSV** for audit evidence
- **Send reminders** — selects expiring records and emails the staff and line manager

## Auditable History
Every training record retains its history of renewals. Click a cell and choose **"View History"** to see all past completions, certificates and who recorded them.`,
      targetPages: ["hr-training", "/hr/training"],
      searchKeywords: ["training", "matrix", "certification", "competency", "first aid", "mandatory", "expiry", "renewal", "CPD"],
      estimatedReadTime: 4,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 3,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR ABSENCE & BRADFORD FACTOR ─────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Absence Overview & Bradford Factor",
      slug: createSlug("HR Absence Overview Bradford Factor"),
      summary: "Recording absences, calculating Bradford Factor scores and identifying patterns",
      content: `# Absence Overview & Bradford Factor

Absence Overview tracks every period of unplanned time off and gives line managers a Bradford Factor score for each staff member to flag persistent short-term absence.

## What Is Bradford Factor?
Bradford Factor is a UK-standard formula: **B = S² × D**, where:
- **S** = number of separate absence spells in the rolling 12 months
- **D** = total days absent in the rolling 12 months

A worker absent for 1 day on 5 occasions (S=5, D=5) scores 125 — much higher than a single 10-day spell (S=1, D=10 → score 10), reflecting the disruption of frequent short absences.

## Typical Triggers
Many UK employers act on Bradford scores:
- **125+** — Verbal informal review
- **250+** — Formal absence review meeting
- **400+** — Written warning stage
- **800+** — Final review / capability process

Configure your trigger thresholds in **Settings** > **HR** > **Absence Triggers**.

## Recording an Absence
1. Navigate to **HR** > **Absence**
2. Click **"Record Absence"**
3. Select the staff member, dates and reason
4. Indicate whether a fit note (doctor's certificate) is held
5. Save — the Bradford Factor recalculates

Sickness leave requests submitted through the Leave module automatically flow into Absence Overview.

## Bradford Factor Trend Chart
The chart shows rolling-12-month scores per staff member. Spikes indicate patterns that may need a return-to-work interview.

## Return-to-Work Interviews
After each absence:
1. Click the absence record
2. Click **"Record Return to Work"**
3. Capture the conversation, agreed actions and signatures
4. The record is stored against the staff member for HR audit evidence`,
      targetPages: ["hr-absence", "/hr/absence"],
      searchKeywords: ["absence", "Bradford Factor", "sickness", "return to work", "fit note", "trigger"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 4,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR ONBOARDING ────────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Onboarding Checklists",
      slug: createSlug("HR Onboarding Checklists"),
      summary: "Creating onboarding checklists, assigning task owners and tracking new-starter progress",
      content: `# Onboarding Checklists

The Onboarding module gives every new starter a structured first-day, first-week and first-month checklist with task owners and deadlines.

## Onboarding Templates
Build reusable templates so every joiner of a given role gets the right tasks:
1. Navigate to **HR** > **Onboarding** > **Templates**
2. Click **"New Template"** (e.g., "Office Staff Standard")
3. Add tasks — each has:
   - A title (e.g., "Issue laptop")
   - A category (IT, HR, Facilities, Compliance, Manager)
   - A due-by offset (e.g., "Day 1", "Week 1", "Month 1")
   - A default owner role
4. Save the template

## Creating a New-Starter Checklist
When a new staff member is added:
1. Open their profile and click **"Start Onboarding"**
2. Pick a template — tasks are copied to their personal checklist
3. Assign owners to each task (line manager, IT, HR)
4. Add a target completion date

## Tracking Progress
The HR dashboard card "Onboarding in progress" shows starters with outstanding tasks. Click through to **/hr/onboarding** to see:
- Percent complete per starter
- Tasks overdue (red)
- Tasks due today (amber)
- Recently completed (green)

## Marking Tasks Complete
Task owners receive an email reminder before each due date. They tick the task off in the staff profile — completion is timestamped and attributed.

## Probation Reviews
Most onboarding templates include 3- and 6-month probation review tasks that surface in the **Appraisals** module when due.`,
      targetPages: ["hr-onboarding", "/hr/onboarding"],
      searchKeywords: ["onboarding", "new starter", "checklist", "induction", "probation", "first day"],
      estimatedReadTime: 4,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 5,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR LEAVERS ───────────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Leavers Process",
      slug: createSlug("HR Leavers Process"),
      summary: "Recording resignations, running the exit checklist and archiving leavers cleanly",
      content: `# Leavers Process

The Leavers module manages the full exit process from resignation through to final pay and equipment return.

## Recording a Resignation
1. Navigate to **HR** > **Leavers**
2. Click **"New Leaver"**
3. Pick the staff member and enter:
   - Resignation date (date received)
   - Last working day
   - Reason for leaving (resignation, redundancy, retirement, dismissal)
   - Notice period
4. Save — the staff member's status changes to **"Notice"**

## Exit Checklist
A standard exit checklist is auto-created:
- Return of company laptop, phone, keys, pass
- Final timesheet submitted
- Outstanding annual leave taken or paid out
- Access removed from systems (TPR-Max, email, BioStar 2, Paxton, payroll)
- Exit interview booked and completed

Track progress on the leaver record. The HR dashboard card "Leavers this month" surfaces anyone with a last working day in the current month.

## Exit Interview
Capture leaver feedback against a configurable questionnaire. The aggregate report shows trends — useful for retention planning.

## Final Pay & P45
After the last working day:
1. Mark the leaver as **"Final pay processed"**
2. The leaver appears in the next payroll export with their P45 indicator
3. Their status changes to **"Leaver"** and they are excluded from active personnel reports

## Auditable Archive
Leaver records are retained with their full history — leave taken, training records, absence history — for GDPR retention periods (typically 6 years for payroll, 1 year for general HR records).`,
      targetPages: ["hr-leavers", "/hr/leavers"],
      searchKeywords: ["leaver", "resignation", "exit", "P45", "termination", "redundancy", "off-boarding"],
      estimatedReadTime: 4,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 6,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR APPRAISALS ────────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Appraisals & Performance Reviews",
      slug: createSlug("HR Appraisals Performance Reviews"),
      summary: "Scheduling and recording performance reviews, objectives and next-review dates",
      content: `# Appraisals & Performance Reviews

The Appraisals module schedules and records performance reviews — annual, mid-year, probation and ad-hoc.

## Scheduling an Appraisal
1. Navigate to **HR** > **Appraisals**
2. Click **"New Appraisal"**
3. Select the staff member, review type and review date
4. Set the **Next review date** — this drives the HR dashboard card "Appraisals due (30 days)"
5. Save — the line manager is notified

## Conducting the Review
On the appraisal record, capture:
- **Performance against objectives** — RAG-rated per objective from the previous review
- **Strengths & development areas**
- **New objectives for the next period** — SMART format with target dates
- **Training needs** — these feed into the Training Matrix
- **Overall rating** — Exceeds / Meets / Below / New starter
- **Manager comments** and **employee comments**

## Sign-off
Both the employee and the line manager confirm the record via a digital signature. The signed PDF is stored against the staff record.

## Tracking Due Appraisals
The HR dashboard card "Appraisals due (30 days)" shows distinct staff whose latest appraisal has a next-review-date within 30 days. Click through to **/hr/appraisals** for the full list.

## Reports
- **Rating distribution** — count of staff at each overall rating
- **Overdue appraisals** — next-review-date has passed
- **Training needs** — aggregate of needs raised across all reviews`,
      targetPages: ["hr-appraisals", "/hr/appraisals"],
      searchKeywords: ["appraisal", "performance review", "objectives", "SMART", "probation", "rating", "next review"],
      estimatedReadTime: 4,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 7,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR PAYROLL EXPORT ────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Payroll Export",
      slug: createSlug("HR Payroll Export"),
      summary: "Exporting month-end pay data to Sage, Xero, BrightPay or generic CSV",
      content: `# Payroll Export

The Payroll Export turns the month's time, leave, absence and pay-affecting events into a single file you can import into your payroll system.

## Supported Targets
- **Sage Payroll** — Sage 50 / Business Cloud CSV
- **Xero Payroll** — Xero timesheet & employee CSV
- **BrightPay** — BrightPay weekly / monthly import CSV
- **Generic CSV** — wide CSV with all columns for custom import

## Running an Export
1. Navigate to **HR** > **Payroll Export**
2. Pick the pay period (e.g., 1–30 November 2026)
3. Select the export target format
4. Click **"Preview"** — the table shows every line that will be exported with totals
5. Resolve any flagged warnings:
   - Missing tax code
   - Unpaid leave overlapping with pay period
   - Outstanding leave approvals
6. Click **"Download CSV"** to save the file

## What Gets Exported
- Staff ID and name
- Tax code and NI number
- Pay period dates
- Basic hours from Time & Attendance
- Overtime hours
- Holiday paid
- SSP (Statutory Sick Pay) — driven by absence records and fit notes
- Bonuses / one-off payments recorded in the period
- Leavers — flagged with the P45 indicator and final pay marker

## Audit Log
Every export creates an immutable record in the **Payroll Export History** table:
- Run at / Run by user
- Period from-to
- Number of staff included
- A copy of the file is retained for 6 years
- Re-download the file from the history at any time

## Important — Beta Module
The HR module is currently in Beta. Always reconcile a payroll export against your previous run before importing to your payroll provider until full release.`,
      targetPages: ["hr-payroll", "/hr/payroll"],
      searchKeywords: ["payroll", "export", "Sage", "Xero", "BrightPay", "SSP", "tax code", "P45", "pay period"],
      estimatedReadTime: 4,
      difficulty: "advanced",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 8,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR ORG CHART ─────────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Org Chart & Reporting Lines",
      slug: createSlug("HR Org Chart Reporting Lines"),
      summary: "Viewing and managing the company reporting structure, assigning line managers and drag-and-drop rearrangement",
      content: `# Org Chart & Reporting Lines

The Org Chart gives a live visual tree of your organisation's reporting structure, built automatically from the line manager assignments held against each staff profile.

## Viewing the Org Chart
Navigate to **HR** > **Org Chart**. The chart renders as a tree with:
- The most senior person (no line manager assigned) at the top
- Direct reports branching below each manager
- Staff name, job title and department visible on each node
- Profile photos where uploaded

Use the **zoom controls** (+ / − / fit-to-screen) to navigate large organisations.

## Assigning a Line Manager
### Via the staff profile
1. Open a staff member's profile
2. Click **Edit**
3. Find the **Line Manager** field
4. Search and select the manager from the dropdown
5. Save — the chart updates immediately

### Via drag-and-drop on the Org Chart
1. Navigate to **HR** > **Org Chart**
2. Drag a staff node and drop it onto the intended manager's node
3. Confirm the reassignment in the dialog that appears
4. The reporting line is saved and the chart re-renders

## Departments
Staff are colour-coded by department. The legend appears at the bottom of the chart. Use **Settings** > **Departments** to add, rename or recolour departments.

## Exporting the Org Chart
Click **"Export PNG"** to download a snapshot of the chart — useful for board packs, HR audits and job descriptions.

## Multiple Reporting Lines
Each staff member has one formal line manager. For matrix-management structures, use the **Notes** field on the staff profile to record secondary reporting relationships.`,
      targetPages: ["hr-org-chart", "/hr/org-chart", "hr", "/hr"],
      searchKeywords: ["org chart", "organisation chart", "reporting lines", "line manager", "hierarchy", "structure", "drag and drop"],
      estimatedReadTime: 4,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 9,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR RIGHT TO WORK ─────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Right to Work (RTW) — Recording & Kiosk Enforcement",
      slug: createSlug("HR Right to Work RTW Recording Kiosk Enforcement"),
      summary: "Recording Right to Work documents, tracking expiry dates and understanding automatic kiosk sign-in blocking for expired RTW",
      content: `# Right to Work (RTW) — Recording & Kiosk Enforcement

UK employers have a legal duty under the Immigration, Asylum and Nationality Act 2006 to check that every employee has the right to work in the UK before employment begins, and to repeat checks when time-limited leave expires.

## Recording an RTW Check
1. Open the staff member's profile
2. Go to the **Right to Work** tab
3. Click **"Add RTW Record"**
4. Enter:
   - **Document type** (e.g., British/Irish passport, BRP, share code verification)
   - **Document reference** number
   - **Check date** — when you verified the document
   - **Expiry date** — leave blank for indefinite RTW (e.g., British citizens)
   - Upload a scanned copy of the document (stored securely)
5. Save — the record is timestamped and attributed to the user who recorded it

## RTW Status Flags
Each staff member shows one of four statuses:
- **✅ Valid** — document on file, not expiring within 90 days
- **⚠️ Expiring soon** — expires within 90 days, repeat check should be scheduled
- **🚨 Expired** — expiry date has passed; access is automatically blocked at kiosk sign-in
- **❓ Not recorded** — no RTW check on file; staff cannot use kiosk self-service until a record is added

## Kiosk Sign-In Enforcement
When a staff member scans their QR code at the TPR-Max kiosk:
- The system checks their RTW status in real time
- If their RTW document has **expired**, the kiosk displays a block screen:
  *"Entry denied: Right to Work documentation has expired. Contact HR."*
- The check-in is rejected — they are **not** added to the on-site register
- HR receives an automatic email alert

This enforcement is automatic and cannot be bypassed at the kiosk.

## Expiry Alerts
The HR dashboard card **"RTW expiring (30 days)"** lists every staff member whose RTW expires in the next 30 days. Click through to schedule repeat checks before access is lost.

## Audit Trail
All RTW records — including who recorded them, when, and any document uploads — are retained with timestamps. This constitutes your statutory excuse under the Act if a record is audited by the Home Office.

## GDPR Considerations
RTW document scans are stored as confidential HR documents. Access is restricted to HR admins and the nominated line manager. Staff cannot view their own document images through the self-service portal.`,
      targetPages: ["hr-right-to-work", "/hr/right-to-work", "staff", "/staff"],
      searchKeywords: ["right to work", "RTW", "immigration", "BRP", "share code", "visa", "passport", "kiosk block", "expiry", "Home Office"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 10,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR DBS ───────────────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "DBS Certificate Management",
      slug: createSlug("HR DBS Certificate Management"),
      summary: "Recording DBS check levels, certificate numbers, issue dates and tracking renewals with automated alerts",
      content: `# DBS Certificate Management

A Disclosure and Barring Service (DBS) check reveals relevant criminal history and, at Enhanced level, information held by local police. Many UK roles — particularly in education, healthcare and social care — require a DBS check before employment begins.

## DBS Check Levels
- **Basic** — unspent convictions only; suitable for most roles
- **Standard** — spent and unspent convictions, cautions, reprimands and warnings
- **Enhanced** — Standard + relevant information held by police; required for regulated activity with children or vulnerable adults
- **Enhanced + barred list check** — includes check against the Children's Barred List and/or Adults' Barred List

## Recording a DBS Check
1. Open the staff member's profile
2. Go to the **DBS** tab
3. Click **"Add DBS Record"**
4. Enter:
   - **DBS level** (Basic / Standard / Enhanced / Enhanced + barred list)
   - **Certificate number** (12-digit reference from the certificate)
   - **Issue date** — date printed on the DBS certificate
   - **Renewal due date** — your organisation's renewal policy (commonly every 3 years for regulated activity)
   - **Workforce type** — Adult, Child, or Both (for Enhanced checks)
5. Upload a scan of the certificate (stored securely)
6. Save — the record is timestamped and attributed

## DBS Status Flags
- **✅ Valid** — on file and not expiring within 90 days
- **⚠️ Renewal due** — expires within 90 days; schedule re-check
- **🚨 Overdue** — past renewal date; review whether the role can continue
- **❓ Not recorded** — no DBS on file for a role that requires one

## Renewal Alerts
The HR dashboard card **"DBS due for renewal"** lists every staff member whose DBS renewal date falls within the next 30 days. Click through to **/hr/dbs** to manage the queue.

## Update Service
Staff with an Enhanced DBS may subscribe to the **DBS Update Service** — their certificate is kept current automatically. Record this in the notes field and set the renewal date far ahead (e.g., 10 years) to prevent unnecessary alerts.

## Audit & Safeguarding
Every DBS record, upload and access event is logged. For Ofsted, CQC and other regulated inspections, DBS records can be exported as a compliance report from **/hr/dbs**.`,
      targetPages: ["hr-dbs", "/hr/dbs", "staff", "/staff"],
      searchKeywords: ["DBS", "Disclosure and Barring Service", "CRB", "enhanced DBS", "barred list", "safeguarding", "certificate", "renewal", "Ofsted", "CQC"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 11,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR CONFIDENTIAL DOCUMENTS ────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "Confidential HR Document Vault",
      slug: createSlug("HR Confidential Document Vault"),
      summary: "Storing, accessing and managing confidential staff documents — contracts, disciplinaries and sensitive records — with GDPR-gated access control",
      content: `# Confidential HR Document Vault

The Confidential Document Vault stores sensitive staff documents — employment contracts, disciplinary records, grievance outcomes, NDAs, fit notes, and other documents that must not be visible to the general user base.

## What Belongs in the Vault
- Employment contracts and contract amendments
- Disciplinary hearing records and outcome letters
- Grievance investigation reports
- NDA / non-disclosure agreements
- Medical fit notes and occupational health reports
- Right to Work document scans
- DBS certificate scans
- Any document classified as "Confidential" at upload

## Uploading a Confidential Document
1. Open the staff member's profile
2. Go to the **Documents** tab
3. Click **"Upload Document"**
4. Select the file (PDF, Word, or image — max 10 MB)
5. Set the **Document type** from the dropdown
6. Tick **"Confidential"** — this restricts who can download it
7. Add an optional expiry date (e.g., for time-limited NDAs)
8. Click **Upload**

## Access Control — Who Can Download
Confidential documents are protected at the server level. Only the following roles can download a confidential document:
- **HR Admin** — full access to all confidential documents
- **The named line manager** of the staff member
- **Platform Admin**

Standard users — even if they have admin access to other modules — receive a **"You do not have permission to download this document"** error if they attempt to access a confidential file.

**Staff cannot access their own confidential documents** through the self-service portal. Documents that staff need to see (e.g., their own employment contract) should be shared via email and uploaded separately as a non-confidential copy.

## GDPR Compliance
- All confidential documents are encrypted at rest
- Access attempts are logged with username, timestamp and IP address
- Retention periods should be set at upload: payroll-related documents 6 years; general HR 1–3 years (per your data retention policy)
- Use the **"Delete"** action (HR Admin only) to remove documents once the retention period has elapsed

## Document List & Audit Log
HR Admins can view the full document list and download log for any staff member in **/hr/documents**. The audit log shows who downloaded what and when — useful for data subject access requests (DSARs) under GDPR Article 15.`,
      targetPages: ["hr-documents", "/hr/documents", "staff", "/staff"],
      searchKeywords: ["confidential", "documents", "contracts", "disciplinary", "GDPR", "NDA", "vault", "access control", "download", "DSAR", "data retention"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 12,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── HR NDA TRACKING ──────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Human Resources"] ?? categoryMap["Staff Management"],
      title: "NDA & Policy Acceptance Tracking",
      slug: createSlug("HR NDA Policy Acceptance Tracking"),
      summary: "Issuing NDAs and company policies for digital acceptance, tracking who has signed and when",
      content: `# NDA & Policy Acceptance Tracking

TPR-Max allows you to issue Non-Disclosure Agreements, company policies, and compliance declarations to staff for digital acknowledgement — creating a timestamped audit trail of who accepted each document and when.

## How It Works
1. A confidential document (NDA, acceptable use policy, data handling declaration) is uploaded to the staff member's **Documents** tab
2. HR marks it as **"Requires acceptance"**
3. The staff member is notified by email to log in and review the document
4. They read the document in the viewer and click **"I accept"**
5. Their acceptance is recorded with timestamp, IP address and user ID
6. The document status updates to **"Accepted — [date]"**

## Tracking Acceptance Status
In **HR** > **Documents** > **Acceptance Log**, you can see:
- Every document marked as requiring acceptance
- Which staff members have accepted and when
- Which staff members have **not yet accepted** (shown in red)
- Days since the document was issued

## Chasing Outstanding Acceptances
Click **"Send Reminder"** next to any unaccepted document to send an email nudge to the staff member. Bulk reminders can be sent for any document with outstanding acceptances.

## Audit Use
The acceptance log is admissible evidence that a staff member was made aware of a policy and agreed to its terms. Download the log as a PDF for legal or HR audit purposes.

## Expiring NDAs
Set an **expiry date** on any NDA. HR will be alerted 30 days before expiry to reissue and obtain a fresh signature. Expired NDAs are flagged in the HR dashboard.`,
      targetPages: ["hr-documents", "/hr/documents", "staff", "/staff", "hr", "/hr"],
      searchKeywords: ["NDA", "non-disclosure", "policy acceptance", "digital signature", "acknowledgement", "compliance declaration", "signed", "acceptance log"],
      estimatedReadTime: 4,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 13,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── MARTYN'S LAW ─────────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Safety & Compliance"],
      title: "Martyn's Law (Protect Duty) Compliance",
      slug: createSlug("Martyns Law Protect Duty Compliance"),
      summary: "Meeting the Terrorism (Protection of Premises) Act / Protect Duty using TPR-Max occupancy, plans and drills",
      content: `# Martyn's Law (Protect Duty) Compliance

Martyn's Law — the Terrorism (Protection of Premises) Act 2025 — places duties on operators of public-facing premises to reduce the risk of and harm from terrorist attacks.

## Who It Applies To
Premises and events where **200 or more people** could reasonably be expected to be present at the same time fall in scope:
- **Standard tier** (200–799 capacity) — public protection procedures
- **Enhanced tier** (800+ capacity) — additional documented public protection measures, monitoring, security plan

## How TPR-Max Helps
TPR-Max provides the evidence and tools the new law requires:

### Real-time Occupancy Awareness
The dashboard shows total people on site (visitors + staff + contractors + members) live. Zone-based counts are available in the muster module.

### Capacity Thresholds
Set **maximum capacity** in **Settings** > **Premises** > **Capacity**. When occupancy approaches threshold the dashboard surfaces an amber → red banner.

### Public Protection Plan
Upload your written public protection plan in **Settings** > **Compliance** > **Public Protection**. Document who is responsible for each duty (Senior Lead, evacuation lead, lockdown lead, comms lead).

### Drills & Exercises
Use the Evacuation module to run drills and capture timings as evidence of plan testing. A drill is logged the same way as a real evacuation but marked **"Drill"**.

### Lockdown / Invacuation
The Emergency module supports **Lockdown** alongside Evacuate — useful for terror, intruder or external hazard incidents where staying inside is safer. Lockdown sends a different alert template and instructs people to shelter in place.

### Incident Record
Every drill, lockdown and real incident is logged with timestamps, headcounts and a downloadable PDF — useful as audit evidence to the regulator (the Security Industry Authority).

## Training Records
Public protection training for staff (e.g., ACT Awareness e-learning, See, Check & Notify SCaN) can be recorded in the **HR Training Matrix** with expiry dates and certificates.

## Further Reading
- Home Office guidance: protectukcampaign.com / Home Office Protect Duty guidance
- ACT Awareness: National Counter Terrorism Security Office (NaCTSO)`,
      targetPages: ["compliance", "/compliance", "/muster", "settings"],
      searchKeywords: ["Martyn's Law", "Protect Duty", "terrorism", "TPPA", "public protection", "lockdown", "invacuation", "ACT Awareness", "SCaN", "NaCTSO", "SIA"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 6,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── RIDDOR / H&S INCIDENTS ───────────────────────────────────────────────
    {
      categoryId: categoryMap["Safety & Compliance"],
      title: "H&S Incident Reporting (RIDDOR)",
      slug: createSlug("HS Incident Reporting RIDDOR"),
      summary: "Recording accidents, near-misses and reportable RIDDOR incidents under the 2013 regulations",
      content: `# H&S Incident Reporting (RIDDOR)

The Incident module records every accident, dangerous occurrence and near-miss, and flags those that must be reported to the HSE under RIDDOR 2013.

## What Is RIDDOR?
The Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013 require employers to report:
- Work-related deaths
- Specified injuries (fractures, amputations, loss of sight, etc.)
- Injuries causing >7 days incapacitation
- Occupational diseases (e.g., carpal tunnel, occupational dermatitis)
- Dangerous occurrences (e.g., scaffold collapse, electrical short)
- Gas incidents

## Recording an Incident
1. Navigate to **H&S** > **Incidents**
2. Click **"New Incident"**
3. Capture:
   - **What, where, when** — date, time, location (which zone)
   - **Who** — injured person(s), witnesses, first aider
   - **Severity** — first aid only, lost-time, hospitalised, serious, fatal
   - **Type** — slip/trip, manual handling, struck-by, fall from height, contact with machinery, etc.
   - **Cause analysis** — root cause findings
4. Upload evidence — photos, statements, medical notes
5. Save — the system flags whether RIDDOR is likely required

## RIDDOR Flag
TPR-Max auto-flags incidents as **"RIDDOR-reportable likely"** based on the severity and type fields. The flag is advisory — you must always make the final judgement and submit through the HSE F2508 online form within the legal timescale (10 days for over-7-day injuries, "without delay" for fatalities and specified injuries).

## Investigations
Each incident has an investigation record:
- Investigation lead
- Witness statements
- Root cause (5 Whys, fishbone)
- Corrective actions with owners and due dates
- Sign-off

## Reports
- **Incidents by month** — trend chart
- **Incidents by type / zone / severity**
- **Open corrective actions** — outstanding fixes from previous incidents
- **RIDDOR register** — list of all RIDDOR-flagged incidents with submission dates

## Near-Miss Reporting
Encourage a near-miss culture: any worker can log a near-miss through the kiosk **"Report a near-miss"** quick action. Pattern detection across multiple near-misses often precedes a serious incident.`,
      targetPages: ["hs-incidents", "/hs-incidents", "/incidents"],
      searchKeywords: ["RIDDOR", "incident", "accident", "near miss", "F2508", "HSE", "investigation", "lost time", "specified injury", "dangerous occurrence"],
      estimatedReadTime: 6,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 7,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── FIRE RISK ASSESSMENT ─────────────────────────────────────────────────
    {
      categoryId: categoryMap["Safety & Compliance"],
      title: "Fire Risk Assessment (RRO 2005)",
      slug: createSlug("Fire Risk Assessment RRO 2005"),
      summary: "Conducting and recording Fire Risk Assessments under the Regulatory Reform (Fire Safety) Order 2005",
      content: `# Fire Risk Assessment (RRO 2005)

The Regulatory Reform (Fire Safety) Order 2005 requires the Responsible Person of every workplace (and most non-domestic premises) to carry out a written Fire Risk Assessment and keep it up to date.

## The Five Steps
TPR-Max follows the Government's five-step FRA structure:
1. **Identify fire hazards** — sources of ignition, fuel, oxygen
2. **Identify people at risk** — staff, visitors, vulnerable people
3. **Evaluate, remove or reduce risks** — controls in place / required
4. **Record, plan, inform, instruct and train** — written FRA, evacuation plan, training records
5. **Review** — at least annually, or after any significant change

## Starting an FRA
1. Navigate to **H&S** > **Fire Risk Assessment**
2. Click **"New FRA"**
3. Pick the premises / zone, the Responsible Person and the assessor's name
4. Work through the five-step wizard — each section has guided questions
5. Record findings against each hazard with a residual risk rating (Low / Medium / High)

## Action Plan
Any finding rated Medium or High generates an entry on the FRA action plan:
- Required action
- Owner
- Target completion date
- Status (open / in progress / closed)

Open actions appear on the H&S dashboard until closed with evidence.

## Annual Review
The system reminds you 30 days before your annual review date and surfaces the alert on the Compliance dashboard. Marking the FRA reviewed creates a new version — earlier versions are retained as audit history.

## Evidence & Audit
A completed FRA can be exported as a signed PDF including:
- The five-step record
- Site plan with hazard markers
- Action plan with status
- Reviewer signatures and dates

This is the document a Fire Officer will ask to see during an inspection.

## Linked Modules
- **PPM** — fire extinguisher / emergency lighting / fire door / alarm servicing
- **Evacuations** — drill timings used as evidence
- **HR Training Matrix** — Fire Marshal and Fire Awareness training records`,
      targetPages: ["fire-risk", "/fire-risk", "/fra"],
      searchKeywords: ["fire risk assessment", "FRA", "RRO 2005", "Regulatory Reform Order", "responsible person", "fire safety", "fire marshal", "evacuation"],
      estimatedReadTime: 6,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 8,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── COMPLIANCE CERTIFICATE REGISTER ──────────────────────────────────────
    {
      categoryId: categoryMap["Safety & Compliance"],
      title: "Compliance Certificate Register",
      slug: createSlug("Compliance Certificate Register"),
      summary: "Storing and tracking statutory inspection certificates: EICR, gas safety, PAT, lift LOLER, fire alarms and more",
      content: `# Compliance Certificate Register

The Compliance Certificate Register is the single place to store every statutory and regulatory certificate your premises requires, with automated expiry tracking.

## Certificate Types Tracked Out-of-the-Box
- **EICR** — Electrical Installation Condition Report (5-yearly)
- **Gas Safety** — annual CP12 / commercial gas certificate
- **PAT** — Portable Appliance Testing (annual / risk-based)
- **LOLER** — lift and lifting equipment (6-monthly for passenger lifts)
- **Fire Alarm** — BS 5839 service certificate (6-monthly)
- **Emergency Lighting** — annual full-discharge test
- **Fire Extinguishers** — BS 5306 service certificate (annual)
- **Asbestos** — management survey, re-inspection
- **Water Hygiene** — Legionella risk assessment, monthly temperatures
- **Air Conditioning** — F-Gas register and TM44 inspection
- **Insurance** — Employers Liability, Public Liability certificates

You can add custom certificate types in **Settings** > **Compliance** > **Certificate Types**.

## Adding a Certificate
1. Navigate to **Compliance** > **Certificates**
2. Click **"Upload Certificate"**
3. Pick the type, premises / zone, certificate number, issuer
4. Enter the issue and expiry dates
5. Upload the PDF / scan
6. Save — the certificate appears on the register

## Expiry Dashboard
The Compliance Register dashboard shows:
- **Valid** (green) — more than 90 days to expiry
- **Renew soon** (amber) — within 90 days
- **Expired / Renew now** (red) — expired or within 30 days

## Email Reminders
30, 14 and 1 days before expiry, the certificate owner and the Compliance Lead receive automatic email reminders.

## Audit Pack
The **"Export Audit Pack"** button produces a ZIP containing every current certificate plus a cover index — useful for insurance renewals or pre-acquisition due diligence.

## Linked Modules
- **PPM** — schedules that produce a new certificate auto-link the certificate to the work order
- **Contractors** — the contractor who serviced the asset is tagged for traceability`,
      targetPages: ["compliance", "/compliance", "/compliance/certificates"],
      searchKeywords: ["compliance", "certificate", "EICR", "gas safety", "CP12", "PAT", "LOLER", "fire alarm", "BS 5839", "BS 5306", "legionella", "asbestos", "F-Gas", "insurance"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 9,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── PERMIT-TO-WORK ───────────────────────────────────────────────────────
    {
      categoryId: categoryMap["Safety & Compliance"],
      title: "Permit-to-Work System",
      slug: createSlug("Permit to Work System"),
      summary: "Issuing, tracking and closing Hot Work, Confined Space, Working at Height, Electrical and Excavation permits",
      content: `# Permit-to-Work System

The Permit-to-Work module controls high-risk activities on site, ensuring the right authorisations, isolations and safety controls are in place before work starts and confirming reinstatement after work ends.

## Permit Types
- **Hot Work** — welding, cutting, grinding, hot bitumen
- **Confined Space** — tanks, ducts, voids
- **Working at Height** — roof work, MEWPs, fragile surfaces
- **Electrical** — live work, isolations, lock-out-tag-out (LOTO)
- **Excavation** — service strikes, ground disturbance
- **General** — any other risk-controlled task

Customise the list in **Settings** > **Compliance** > **Permit Types**.

## Issuing a Permit
1. Navigate to **Compliance** > **Permits-to-Work**
2. Click **"Issue Permit"**
3. Pick the type — a tailored checklist appears
4. Capture:
   - Contractor / worker(s) on the permit
   - Scope of work, location, start time, end time
   - Hazards identified
   - Controls in place (e.g., fire watch, gas tests, isolations)
   - Required PPE
   - Emergency arrangements
5. The Permit Issuer signs digitally — the workers sign on acceptance
6. The permit is active for the stated window

## Live Permit Board
The Permits page shows every active permit with:
- Time remaining
- Workers on the permit (with their RTW / induction status)
- Location on a site plan
- A countdown that turns amber 30 min before expiry

## Closing / Reinstatement
At the end of the work:
1. The permit holder ticks off the reinstatement checklist (cooling check after hot work, gas re-test, isolations restored, area clean)
2. The Permit Issuer signs the permit closed
3. The closed permit is archived for audit

## Suspension
If conditions change (alarm activation, weather change, scope drift) the permit can be **suspended** — work stops until re-authorised.

## Audit
Every permit, suspension and closure is timestamped and attributed. Export the permit register to PDF or CSV for insurer or HSE inspection evidence.`,
      targetPages: ["permits", "/permits", "/permit-to-work"],
      searchKeywords: ["permit", "permit to work", "PTW", "hot work", "confined space", "working at height", "MEWP", "LOTO", "isolation", "excavation"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 10,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── RAMS DOCUMENT MANAGEMENT ─────────────────────────────────────────────
    {
      categoryId: categoryMap["Contractor Management"] ?? categoryMap["Safety & Compliance"],
      title: "RAMS Document Management",
      slug: createSlug("RAMS Document Management"),
      summary: "Uploading, reviewing and approving contractor Risk Assessments and Method Statements",
      content: `# RAMS Document Management

The RAMS module manages Risk Assessment and Method Statement submissions from contractors before they are allowed to start work on site.

## What Are RAMS?
- **Risk Assessment** — identifies hazards, who could be harmed, evaluates risk and lists controls
- **Method Statement** — describes step-by-step how a task will be carried out safely

Most UK clients require RAMS for non-trivial contractor work — and your insurer or principal contractor almost certainly does.

## Uploading RAMS
A contractor can upload RAMS through their contractor portal, or your team can upload on their behalf:
1. Navigate to **Contractors** > pick the contractor > **RAMS** tab
2. Click **"Upload RAMS"**
3. Pick the work activity (e.g., "Annual fire alarm service")
4. Upload the RAMS PDF and any supporting documents
5. Set the validity period (typically per project or annual)

## Review Workflow
Uploaded RAMS enter the **Pending Review** queue:
1. The H&S reviewer opens the document, reads it and either:
   - **Approves** — set approved-until date and sign digitally
   - **Returns** — write comments / requested changes; the contractor is notified
   - **Rejects** — sign-off withheld with reason
2. Approved RAMS are stamped onto the contractor's record with the reviewer's name and date

## RAMS Gate for PPM
When **Contractor compliance gate** is enabled, contractors and workers with an expired or missing RAMS for the activity are blocked from being assigned to a PPM work order until valid RAMS are uploaded and approved. See "PPM Contractor Compliance Gate" for the full list of checks.

## Activity Library
Build a library of common work activities in **Settings** > **Compliance** > **Work Activities**. Each activity can have its own RAMS template the contractor downloads, fills in and re-uploads — much faster than starting from scratch each time.

## Expiry & Renewal
RAMS approved as "annual" auto-expire on the renewal date. The contractor and the compliance reviewer receive 30-day notice. Expired RAMS appear in red on the contractor's record.`,
      targetPages: ["rams", "/rams", "/contractors"],
      searchKeywords: ["RAMS", "risk assessment", "method statement", "contractor", "approval", "review", "compliance"],
      estimatedReadTime: 5,
      difficulty: "intermediate",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 11,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── PAXTON NET2 INTEGRATION ──────────────────────────────────────────────
    {
      categoryId: categoryMap["Settings & Configuration"],
      title: "Paxton Net2 Access Control Integration",
      slug: createSlug("Paxton Net2 Access Control Integration"),
      summary: "Connecting TPR-Max to Paxton Net2 for personnel sync, door event logging and access control",
      content: `# Paxton Net2 Access Control Integration

TPR-Max integrates with Paxton Net2, one of the UK's most widely deployed access control systems, to synchronise people records and bring door events into the personnel dashboard.

## What Is Paxton Net2?
Net2 is a PC-based access control system from Paxton Access. It manages door readers, intercoms, tokens, fobs and biometric devices for everything from a single-door office to a large multi-site estate.

## Connecting TPR-Max to Net2
The integration uses Net2's local API. You will need:
- A Net2 server (Net2 software v6 or later) on your network
- An Operator account with API access
- Network connectivity from the TPR-Max server to the Net2 server (typically a VPN or a dedicated IP allow-list)

Configure in **Settings** > **Paxton Net2 Integration**:
1. **Net2 server URL** — including port (default: 8080)
2. **Operator username** and **password**
3. **Department mapping** — match Net2 departments to TPR-Max staff departments
4. Click **"Test Connection"**
5. Click **"Save"** to enable the integration

## What the Integration Does
**Personnel sync** — TPR-Max staff records can be pushed to Net2 as Net2 users, with their access token reference linked. When you add or terminate a staff member in TPR-Max, the change is reflected in Net2 automatically.

**Live door events** — Door grant / deny events flow into TPR-Max in real time. View them in **Settings** > **Paxton** > **Event Log**.

**Auto check-in** — Optionally, an access-grant event at the main entrance triggers check-in for the staff member in TPR-Max — removing the need for them to also use the kiosk.

**Leaver de-provisioning** — When a staff member is moved to **Leaver** status in HR, their Net2 token is automatically blocked on their last working day.

## Security
- Net2 credentials are stored encrypted; never exposed to the browser
- Communication runs server-side over your private network
- Each TPR-Max customer has their own isolated Net2 connection

## Troubleshooting
**Connection refused / timeout**:
- Confirm the Net2 server is reachable from the TPR-Max server (ping / curl)
- Check Windows Firewall rules on the Net2 PC
- Verify the API user has been granted access in Net2 itself

**Events not arriving**:
- Confirm the integration is **Connected** (green status)
- Trigger a door event and refresh — events appear within ~5 seconds
- Check the Net2 server time matches your TPR-Max time zone`,
      targetPages: ["settings", "/settings", "paxton"],
      searchKeywords: ["Paxton", "Net2", "access control", "door reader", "token", "fob", "integration", "RFID"],
      estimatedReadTime: 5,
      difficulty: "advanced",
      isPublished: true,
      isFeatured: false,
      isQuickStart: false,
      sortOrder: 12,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── PRE-BOOKING & VISITOR INVITATIONS ────────────────────────────────────
    {
      categoryId: categoryMap["Pre-bookings & Invitations"] ?? categoryMap["Visitor Management"],
      title: "Pre-bookings & Visitor Invitations",
      slug: createSlug("Pre-bookings and Visitor Invitations"),
      summary: "Pre-booking visitors, sending email invitations with QR codes, recurring visits and bulk arrivals",
      content: `# Pre-bookings & Visitor Invitations

Pre-booking lets hosts register expected visitors before they arrive — speeding up reception, capturing accurate data and giving visitors a polished pre-visit experience.

## Creating a Pre-booking
1. Navigate to **Visitors** > **Pre-bookings**
2. Click **"New Pre-booking"**
3. Enter:
   - Visitor first name, last name, email, company
   - Expected arrival date and time
   - Host (staff member)
   - Visit reason
   - Any required induction or document acceptance
4. Save

## Email Invitation
On save, TPR-Max can email the visitor an invitation containing:
- Site address with map link
- Date and arrival time
- Host's name and contact
- Pre-visit health & safety information
- Any documents to read before arrival (e.g., site rules, PPE requirements)
- A unique **QR check-in code** for fast kiosk arrival
- A calendar (.ics) attachment

## Fast Kiosk Check-in
On the day:
- The visitor walks to the kiosk
- Scans the QR code from their phone
- Their record loads with pre-filled details
- They complete induction acceptance (if required) and take their photo
- A badge is printed
- The host receives an arrival notification

## Recurring Pre-bookings
For regular visitors (e.g., weekly cleaner, monthly auditor):
1. Tick **"Recurring"** when creating the booking
2. Pick the cadence (daily, weekly, monthly) and an end date
3. Each occurrence is created automatically
4. The visitor uses the same QR code for every visit

## Bulk Arrivals
For groups arriving together (e.g., training day, board meeting):
1. Create one pre-booking and click **"Add Attendees"**
2. Paste or upload a CSV of attendees
3. Each attendee receives their own invitation email and QR code
4. At reception, all attendees show up under one expected-visit group

## Cancelling or Reschedule
Open the pre-booking and click **"Cancel"** or **"Reschedule"** — the visitor is notified by email. Cancelled bookings remain visible in the history.

## Reports
- **Expected today** — today's arrivals at a glance for reception
- **Pre-booking lead time** — average days between booking and visit
- **No-shows** — pre-booked visitors who didn't arrive
- **Conversion rate** — pre-booked vs walk-in over time`,
      targetPages: ["pre-bookings", "/pre-bookings", "/visitors"],
      searchKeywords: ["pre-booking", "prebooking", "invitation", "QR code", "expected visitor", "recurring", "bulk", "invite"],
      estimatedReadTime: 5,
      difficulty: "beginner",
      isPublished: true,
      isFeatured: true,
      isQuickStart: true,
      sortOrder: 1,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    },

    // ─── PPM CONTRACTOR COMPLIANCE GATE ───────────────────────────────────────
    {
      categoryId: categoryMap["Planned Preventative Maintenance"] ?? categoryMap["Contractor Management"],
      title: "PPM Contractor Compliance Gate",
      slug: createSlug("PPM Contractor Compliance Gate"),
      summary: "How TPR-Max blocks non-compliant contractors and workers from being assigned to PPM work orders",
      content: `# PPM Contractor Compliance Gate

When the Contractor Compliance Gate is enabled, TPR-Max prevents non-compliant contractors and workers from being assigned to PPM work orders. This protects you from liability and ensures every job is done by someone properly vetted.

## What Gets Checked
For each contractor company and each worker being assigned, TPR-Max checks:

### Company-level checks
- **Public liability insurance** present, not expired
- **Employers liability insurance** present, not expired (where applicable)
- **CHAS / Constructionline / SafeContractor** accreditation, not expired
- **Approved RAMS** for the work activity
- **Health & Safety policy** uploaded (companies with 5+ employees)

### Worker-level checks
- **Right to Work** confirmed and recorded
- **Site induction** completed within the validity period
- **DBS check** if the role requires one (e.g., schools, healthcare)
- **Required training** valid (e.g., IPAF for MEWPs, CSCS for construction)
- **Required PPE** declared

## What the Gate Does
On the PPM work order assignment screen:
- **Compliant** contractors/workers appear normally and can be assigned
- **Non-compliant** contractors/workers are **greyed out** with a tooltip listing the failing checks (e.g., "Public liability expired 12 days ago; RAMS for hot work not approved")
- An administrator with **override permission** can still assign with a written justification, which is logged

## Server-side Enforcement
The gate is enforced server-side as well as in the UI — even with the API directly, you cannot create or update a PPM work order assigning a non-compliant contractor or worker without an override. This is by design: it prevents accidental bypass and gives you robust audit evidence.

## Resolving Non-compliance
1. Open the contractor or worker profile
2. The compliance panel shows every failing check in red
3. Upload / refresh the missing or expired document
4. The reviewer approves (where review is required)
5. Once all checks pass, the contractor / worker is automatically un-greyed in PPM

## Enabling the Gate
The gate is enabled per customer in **Settings** > **PPM** > **Compliance Gate**. New customers have it **enabled by default**. Existing customers can switch it on once their contractor base is in order.

## Reports
- **Non-compliant contractors** — list of companies with one or more failing checks
- **Override log** — audit trail of every gate override with user, date and justification
- **About to expire** — documents within 30 days of expiry across all contractors`,
      targetPages: ["ppm", "/ppm", "contractors"],
      searchKeywords: ["compliance gate", "PPM", "contractor compliance", "insurance", "RAMS", "RTW", "induction", "DBS", "CHAS", "block", "override"],
      estimatedReadTime: 5,
      difficulty: "advanced",
      isPublished: true,
      isFeatured: true,
      isQuickStart: false,
      sortOrder: 3,
      helpfulCount: 0,
      notHelpfulCount: 0,
      viewCount: 0
    }
  ];
}

async function upsertMissingHelpContent(
  existingCategories: { id: string; name: string }[],
  existingArticles: { slug: string }[]
) {
  const existingSlugs = new Set(existingArticles.map(a => a.slug));
  const categoryMap: Record<string, string> = {};
  existingCategories.forEach(c => { categoryMap[c.name] = c.id; });

  // Insert any missing categories
  for (const cat of NEW_CATEGORIES) {
    if (!categoryMap[cat.name]) {
      const [inserted] = await db.insert(helpCategories).values(cat).returning();
      categoryMap[inserted.name] = inserted.id;
      logger.info(`📚 Added missing help category: ${cat.name}`);
    }
  }

  // Build new articles with resolved category IDs
  const newArticles = buildNewArticles(categoryMap);

  // Insert any articles whose slugs don't yet exist
  let added = 0;
  for (const article of newArticles) {
    if (!existingSlugs.has(article.slug) && article.categoryId) {
      await db.insert(helpArticles).values(article as any);
      logger.info(`📄 Added missing help article: ${article.title}`);
      added++;
    }
  }
  if (added > 0) {
    logger.info(`✅ Upserted ${added} new help article(s)`);
  } else {
    logger.info('✅ Help content is up to date');
  }
}

export async function seedHelpData() {
  try {
    logger.info('🌱 Seeding help system data...');
    
    // Check if help data already exists
    const existingCategories = await db.select().from(helpCategories);
    const existingArticles = await db.select().from(helpArticles);
    
    // Migrate any existing records that still reference "VisiGate Pro" -> "TPR-Max"
    const staleArticles = await db.select().from(helpArticles).where(like(helpArticles.content, '%VisiGate Pro%'));
    if (staleArticles.length > 0) {
      logger.info(`🔄 Migrating ${staleArticles.length} help article(s) from VisiGate Pro → TPR-Max...`);
      for (const article of staleArticles) {
        await db.update(helpArticles)
          .set({
            title: article.title.replace(/VisiGate Pro/g, 'TPR-Max'),
            summary: article.summary ? article.summary.replace(/VisiGate Pro/g, 'TPR-Max') : article.summary,
            content: article.content.replace(/VisiGate Pro/g, 'TPR-Max'),
          })
          .where(eq(helpArticles.id, article.id));
      }
      logger.info('✅ Migration complete');
    }

    const staleTitleArticles = await db.select().from(helpArticles).where(like(helpArticles.title, '%VisiGate Pro%'));
    if (staleTitleArticles.length > 0) {
      for (const article of staleTitleArticles) {
        await db.update(helpArticles)
          .set({ title: article.title.replace(/VisiGate Pro/g, 'TPR-Max') })
          .where(eq(helpArticles.id, article.id));
      }
    }

    // ── Migrate HR Module Overview: remove Beta, add RTW/DBS/Documents/Org Chart sub-modules ──
    const hrOverviewArticles = await db.select().from(helpArticles)
      .where(like(helpArticles.slug, 'hr-module-overview'));
    for (const article of hrOverviewArticles) {
      if (article.content.includes('currently in Beta') || !article.content.includes('Right to Work')) {
        await db.update(helpArticles)
          .set({
            summary: "Tour of the HR landing dashboard and the 12 sub-modules: org chart, leave, training, absence, onboarding, leavers, appraisals, payroll export, Right to Work, DBS, confidential documents and NDA tracking",
            content: article.content
              .replace(
                'It sits at **/hr** and is currently in Beta — verify critical data (right-to-work, payroll, appraisals) independently until full release.',
                'It sits at **/hr** and covers the full staff lifecycle, including compliance-critical areas such as Right to Work enforcement, DBS management, and GDPR-gated confidential document storage.'
              )
              .replace(
                '- **Appraisals due (30 days)** — performance reviews scheduled in the next 30 days\n- **Pending leave approvals** — leave requests awaiting line manager decision',
                '- **Appraisals due (30 days)** — performance reviews scheduled in the next 30 days\n- **Pending leave approvals** — leave requests awaiting line manager decision\n- **RTW expiring (30 days)** — staff whose Right to Work document expires within 30 days\n- **DBS due for renewal** — staff whose DBS certificate renewal date falls within 30 days'
              )
              .replace(
                '- **Payroll Export** — month-end export to your payroll provider\n\n## Feature Toggles',
                '- **Payroll Export** — month-end export to your payroll provider\n- **Right to Work** — document recording, expiry tracking and kiosk enforcement\n- **DBS** — Disclosure and Barring Service certificate management\n- **Documents** — GDPR-gated confidential document vault\n- **NDA / Policy Acceptance** — digital acknowledgement tracking\n\n## Feature Toggles'
              ),
          })
          .where(eq(helpArticles.id, article.id));
        logger.info('🔄 Migrated HR Module Overview article (removed Beta, added sub-modules)');
      }
    }

    // ── Migrate Payroll Export: remove Beta warning, add sick-days filter note ──
    const payrollArticles = await db.select().from(helpArticles)
      .where(like(helpArticles.slug, 'hr-payroll-export'));
    for (const article of payrollArticles) {
      if (article.content.includes('Beta Module')) {
        await db.update(helpArticles)
          .set({
            content: article.content
              .replace(
                '## Important — Beta Module\nThe HR module is currently in Beta. Always reconcile a payroll export against your previous run before importing to your payroll provider until full release.',
                '## Sick Day Filtering\nThe payroll export automatically filters absence records to **sickness-type absences only** when calculating SSP and sick day totals. Non-sickness leave (annual leave, TOIL, compassionate) is never included in the sick day count, preventing over-reporting to your payroll provider.\n\n## Reconciliation\nAlways reconcile a payroll export against your previous run before importing to your payroll provider. The Payroll Export History table lets you re-download any past export for comparison.'
              ),
          })
          .where(eq(helpArticles.id, article.id));
        logger.info('🔄 Migrated Payroll Export article (removed Beta warning, added sick-day filter note)');
      }
    }

    // If data already exists, only upsert new articles/categories that are missing
    if (existingCategories.length > 0 && existingArticles.length > 0) {
      await upsertMissingHelpContent(existingCategories, existingArticles);
      return;
    }

    // Seed Help Categories
    logger.info('📚 Seeding help categories...');
    const categoriesData = [
      {
        name: "Getting Started",
        description: "Essential guides to help you get started with TPR Max",
        icon: "rocket",
        color: "#3b82f6",
        sortOrder: 1,
        isActive: true
      },
      {
        name: "Visitor Management",
        description: "Everything about managing visitors, check-ins, pre-bookings, and visitor badges",
        icon: "users",
        color: "#10b981",
        sortOrder: 2,
        isActive: true
      },
      {
        name: "Staff Management",
        description: "Managing staff profiles, departments, time & attendance, and Fire Marshal assignments",
        icon: "user-check",
        color: "#8b5cf6",
        sortOrder: 3,
        isActive: true
      },
      {
        name: "Contractor Management",
        description: "Managing contractors, workers, compliance documents, red/yellow cards, and safety requirements",
        icon: "hard-hat",
        color: "#f59e0b",
        sortOrder: 4,
        isActive: true
      },
      {
        name: "Emergency Muster & Evacuations",
        description: "Emergency evacuation activation, Fire Marshal access, zone-based mustering, and personnel accountability",
        icon: "alert-triangle",
        color: "#ef4444",
        sortOrder: 5,
        isActive: true
      },
      {
        name: "Safety & Compliance",
        description: "Safety inductions, AI-generated training videos, H&S document management, and compliance tracking",
        icon: "shield-check",
        color: "#dc2626",
        sortOrder: 6,
        isActive: true
      },
      {
        name: "Meeting Rooms & Bookings",
        description: "Room booking, availability management, and meeting room configuration",
        icon: "calendar",
        color: "#0ea5e9",
        sortOrder: 7,
        isActive: true
      },
      {
        name: "Reports & Analytics",
        description: "Generating reports, viewing analytics, CO2 sustainability reports, and exporting data",
        icon: "chart-bar",
        color: "#06b6d4",
        sortOrder: 8,
        isActive: true
      },
      {
        name: "ID Card & Pass Printing",
        description: "Thermal printer setup, pass template design, and network printing for visitor and contractor badges",
        icon: "printer",
        color: "#7c3aed",
        sortOrder: 9,
        isActive: true
      },
      {
        name: "Settings & Configuration",
        description: "System settings, company branding, user management, zone configuration, and email setup",
        icon: "settings",
        color: "#6b7280",
        sortOrder: 10,
        isActive: true
      },
      {
        name: "Troubleshooting",
        description: "Common issues and their solutions",
        icon: "tool",
        color: "#dc2626",
        sortOrder: 11,
        isActive: true
      }
    ];

    const insertedCategories = await db.insert(helpCategories).values(categoriesData).returning();
    logger.info(`✅ Seeded ${insertedCategories.length} help categories`);

    // Seed Help Articles
    logger.info('📄 Seeding help articles...');
    
    const gettingStartedCategory = insertedCategories.find(cat => cat.name === "Getting Started");
    const visitorMgmtCategory = insertedCategories.find(cat => cat.name === "Visitor Management");
    const staffMgmtCategory = insertedCategories.find(cat => cat.name === "Staff Management");
    const contractorMgmtCategory = insertedCategories.find(cat => cat.name === "Contractor Management");
    const emergencyCategory = insertedCategories.find(cat => cat.name === "Emergency Muster & Evacuations");
    const safetyCategory = insertedCategories.find(cat => cat.name === "Safety & Compliance");
    const meetingRoomCategory = insertedCategories.find(cat => cat.name === "Meeting Rooms & Bookings");
    const reportsCategory = insertedCategories.find(cat => cat.name === "Reports & Analytics");
    const printingCategory = insertedCategories.find(cat => cat.name === "ID Card & Pass Printing");
    const settingsCategory = insertedCategories.find(cat => cat.name === "Settings & Configuration");
    const troubleshootingCategory = insertedCategories.find(cat => cat.name === "Troubleshooting");

    // Helper function to create URL-friendly slugs
    const createSlug = (title: string): string => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    };

    const articlesData = [
      // ===== GETTING STARTED =====
      {
        categoryId: gettingStartedCategory?.id,
        title: "Welcome to TPR Max",
        slug: createSlug("Welcome to TPR Max"),
        summary: "Learn the basics of TPR Max and how to navigate the system",
        content: `# Welcome to TPR Max

TPR Max (Total Personnel Register) is a comprehensive personnel management and emergency mustering system designed for any type of organisation. It manages visitors, staff, and contractors while providing life-safety emergency evacuation capabilities.

## Key Features
- **Visitor Management**: Pre-booking, walk-in check-in, host notifications, QR code badges
- **Staff Management**: Staff directory, departments, time & attendance, Fire Marshal assignments
- **Contractor Management**: Company profiles, worker tracking, compliance documents, red/yellow card system
- **Emergency Muster**: One-click evacuation, real-time accountability, Fire Marshal mobile access, zone-based alerts
- **Meeting Room Booking**: Room availability, booking calendar, staff attendees
- **Safety Inductions**: Customisable inductions, AI-generated training videos, H&S document acceptance
- **ID Card Printing**: Network thermal printing (Toshiba Tec & Zebra), professional template designer
- **Reports & Analytics**: Real-time dashboards, PDF/CSV exports, CO2 sustainability reports
- **Zone-Based Evacuations**: Configurable evacuation zones with interactive floor plan mapping

## Getting Around
The main navigation is in the sidebar. Key sections include:
- **Dashboard**: Overview of current site activity and key metrics
- **Visitors**: Manage visitor check-ins, pre-bookings, and history
- **Staff**: Staff directory, check-in/out, and time & attendance
- **Contractors**: Contractor companies, workers, and compliance
- **Emergency Muster**: Evacuation controls and personnel accountability
- **Meeting Rooms**: Room booking and availability
- **Reports**: Analytics, exports, and sustainability reports
- **Settings**: Company branding, user management, zones, and system configuration

## Quick Start
1. Set up your company details in **Settings** (logo, name, address)
2. Add your staff members in the **Staff** section
3. Configure departments and assign hosts
4. Set up contractor companies if applicable
5. Configure evacuation zones in **Settings > Zone Management**
6. Start checking in visitors from the **Visitors** page

Need help? Use this help panel anytime by clicking the help button.`,
        targetPages: ["dashboard", "home", "/"],
        searchKeywords: ["welcome", "getting started", "basics", "navigation", "overview", "TPR Max"],
        estimatedReadTime: 4,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: true,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: gettingStartedCategory?.id,
        title: "First Time Setup Guide",
        slug: createSlug("First Time Setup Guide"),
        summary: "Complete setup guide for new TPR Max installations",
        content: `# First Time Setup Guide

Follow these steps to get TPR Max configured for your organisation.

## Step 1: Company Information
1. Navigate to **Settings**
2. Enter your company name and address
3. Upload your company logo (appears on passes, emails, and the login page)
4. Set your accent colour for branding
5. Configure notification preferences

## Step 2: User Accounts
1. Go to **Settings** > **User Management**
2. Create user accounts for your reception and admin staff
3. Assign roles: **Admin** (full access) or **User** (standard operations)
4. Send invitations via email or copy the invitation link directly

## Step 3: Staff Directory
1. Visit the **Staff** section
2. Add staff members with name, email, department, and job title
3. Upload photos for ID badge printing
4. Designate Fire Marshals (these staff receive special emergency alerts)
5. Assign departments for visitor host selection

## Step 4: Departments
1. In **Settings**, configure your departments
2. Staff are grouped by department for organisation
3. Visitors select a host from the staff directory when checking in

## Step 5: Contractor Companies (if applicable)
1. Go to **Contractors** and add contractor companies
2. Set up contact details and compliance requirements
3. Add workers to each contractor company
4. Configure H&S document requirements

## Step 6: Evacuation Zones
1. Navigate to **Settings** > **Zone Management**
2. Create evacuation zones with names, colours, and descriptions
3. Optionally upload a floor plan and position zone markers
4. Zones are used during emergency evacuations for targeted alerts

## Step 7: Meeting Rooms (if applicable)
1. Go to **Meeting Rooms** and add your rooms
2. Set capacity, equipment, and availability
3. Staff can then book rooms through the system

## Step 8: Testing
1. Create a test visitor check-in
2. Verify badge/pass printing if using thermal printers
3. Test the check-out process
4. Run a test evacuation to verify muster functionality

You're now ready to start using TPR Max!`,
        targetPages: ["settings", "/settings"],
        searchKeywords: ["setup", "configuration", "first time", "installation", "getting started"],
        estimatedReadTime: 5,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: true,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== VISITOR MANAGEMENT =====
      {
        categoryId: visitorMgmtCategory?.id,
        title: "Checking In Visitors",
        slug: createSlug("Checking In Visitors"),
        summary: "Step-by-step guide to checking in visitors including walk-ins and pre-booked",
        content: `# Checking In Visitors

TPR Max supports multiple ways to check in visitors quickly and efficiently.

## Walk-in Visitors
For visitors arriving without a booking:
1. Click **"Check In Visitor"** on the Visitors page
2. Enter the visitor's name, company, and email
3. **Select a host** (the staff member they are visiting) - this is mandatory
4. Take a photo (optional but recommended for ID passes)
5. Add any notes or vehicle registration if required
6. Click **"Check In"**

The selected host will automatically receive an arrival notification email.

## Pre-booked Visitors
For visitors with an existing pre-booking:
1. Find the pre-booking in the **Pre-bookings** list
2. Click **"Check In"** next to the booking
3. Verify the visitor's details
4. The host and other details are pre-filled from the booking
5. Complete the check-in

## Pre-booking Visitors
To create a future booking:
1. Click **"Pre-book Visitor"**
2. Enter visitor details and expected arrival date/time
3. Select the host they will be visiting
4. An invitation email is sent to the visitor
5. The booking appears in the pre-bookings list ready for check-in on arrival

## Host Selection
Every visitor check-in and pre-booking requires a host:
- Hosts are selected from your staff directory
- The host receives an email notification when their visitor arrives
- The notification includes the visitor's name, company, and a professional branded email

## Visitor Badges & QR Codes
- Each visitor receives a unique QR code for tracking
- QR codes can be printed on thermal ID badges
- Visitors can check out by scanning their QR code
- Badges show visitor name, company, host, date, and photo

## Checking Out Visitors
1. Find the visitor in the current visitors list
2. Click **"Check Out"**
3. The visit duration is automatically calculated
4. The visitor record moves to the history log

## Visitor History
- View all past visits with dates, times, and durations
- Search by visitor name, company, or host
- Export visitor logs for compliance and reporting`,
        targetPages: ["visitors", "/visitors"],
        searchKeywords: ["check in", "visitor", "badge", "walk-in", "registration", "pre-book", "host", "QR code"],
        estimatedReadTime: 5,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== STAFF MANAGEMENT =====
      {
        categoryId: staffMgmtCategory?.id,
        title: "Managing Staff",
        slug: createSlug("Managing Staff"),
        summary: "How to add, edit, and manage staff members including Fire Marshal assignments",
        content: `# Managing Staff

Keep your staff directory up to date for visitor hosting, emergency mustering, and time & attendance.

## Adding New Staff
1. Go to the **Staff** section
2. Click **"Add Staff Member"**
3. Fill in required information:
   - First name and last name
   - Email address (for notifications and evacuation alerts)
   - Department
   - Job title
   - Employee ID (optional)
4. Upload a photo for ID badge printing
5. Set as Fire Marshal if applicable
6. Save the profile

## Fire Marshal Designation
Staff can be designated as Fire Marshals:
- Fire Marshals receive a **permanent static URL** for emergency access
- During evacuations, they receive specialised Fire Marshal alerts
- Their Fire Marshal URL provides a dedicated personnel accountability view
- URLs are auto-generated and never expire
- Fire Marshal status is set when the staff member's department contains "safety" or "security", or manually via the Fire Marshal toggle

## Staff Check-in / Check-out
Track staff attendance:
1. Staff can check in when they arrive on site
2. Check out when they leave
3. Session duration is automatically calculated
4. Time & attendance reports available for payroll

## Staff Status
- **Active**: Currently employed, can host visitors, appears in muster lists
- **Checked In**: Currently on site (shown on dashboard and in evacuations)
- **Checked Out**: Off site

## Departments
Staff are grouped by department:
- Departments help organise the staff directory
- Visitors select a host by browsing departments
- Reports can be filtered by department
- Configure departments in Settings

## Evacuation Zone Assignment
Staff can be assigned to evacuation zones:
- Zones determine which alerts they receive during targeted evacuations
- Zone assignments are made during check-in or in staff settings
- Fire Marshals receive alerts regardless of zone assignment`,
        targetPages: ["staff", "/staff"],
        searchKeywords: ["staff", "employees", "profiles", "directory", "fire marshal", "departments", "attendance"],
        estimatedReadTime: 4,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== CONTRACTOR MANAGEMENT =====
      {
        categoryId: contractorMgmtCategory?.id,
        title: "Contractor & Worker Management",
        slug: createSlug("Contractor and Worker Management"),
        summary: "Managing contractor companies, workers, compliance, and the red/yellow card system",
        content: `# Contractor & Worker Management

Manage contractor companies, their workers, compliance documents, and safety enforcement.

## Contractor Companies
1. Go to **Contractors**
2. Click **"Add Contractor"** to create a company profile
3. Enter company name, contact details, and email
4. Set up compliance requirements

## Managing Workers
Each contractor company can have multiple workers:
1. Open a contractor company profile
2. Click **"Add Worker"**
3. Enter worker details: name, email, phone, trade/role
4. Upload certifications (CIBT, CPCS, NVQ, etc.)
5. Workers can check in/out independently

## Worker Check-in / Check-out
- Workers check in when arriving on site
- A host (staff member) must be selected during check-in
- The host receives an arrival notification
- Check-out records the duration on site

## Compliance & H&S Documents
Track contractor compliance:
- Upload and manage H&S documents per contractor
- Set document expiry dates
- System alerts when documents are expiring
- Contractors can accept H&S documents via public links (no login required)

## Red & Yellow Card System
Enforce safety standards with the card system:

### Yellow Cards
- Issued for minor safety infractions
- Worker and their contractor company receive email notifications
- Cards are recorded on the worker's profile
- Two yellow cards trigger an escalation warning

### Red Cards
- Issued for serious safety violations
- Carries an automatic **3-year site ban**
- Worker and contractor company are notified immediately
- Worker's site access is revoked

### Issuing a Card
1. Open the contractor company profile
2. Navigate to the worker's details
3. Click **"Issue Card"**
4. Select the offence type from the pre-configured list
5. Choose Yellow or Red card
6. Add description, location, and witness details
7. Submit - email notifications are sent automatically

## Card Offences
Configure offence types in the contractor management area:
- Pre-defined safety violation categories
- Custom offences can be added
- Each offence links to the card system

## Contractor Kiosk Mode
For self-service check-in:
- Workers can check themselves in via a kiosk interface
- Simplified touch-friendly interface
- QR code scanning support`,
        targetPages: ["contractors", "/contractors"],
        searchKeywords: ["contractors", "workers", "compliance", "safety", "red card", "yellow card", "CIBT", "CPCS", "check in"],
        estimatedReadTime: 6,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== EMERGENCY MUSTER & EVACUATIONS =====
      {
        categoryId: emergencyCategory?.id,
        title: "Emergency Evacuations & Mustering",
        slug: createSlug("Emergency Evacuations and Mustering"),
        summary: "How to activate evacuations, use the muster system, and manage Fire Marshal access",
        content: `# Emergency Evacuations & Mustering

TPR Max provides life-safety critical emergency mustering capabilities for real-time personnel accountability.

## Activating an Evacuation
1. Navigate to **Emergency Muster**
2. Click the **"Activate Evacuation"** button
3. Optionally select specific zones to target (or activate site-wide)
4. Confirm activation
5. The system immediately:
   - Sends evacuation email alerts to all on-site staff, visitors, and contractors
   - Sends specialised alerts to Fire Marshals with their dedicated panel URLs
   - Each person receives a unique self-service **"Mark Safe"** link
   - The muster page shows real-time accountability status

## Zone-Based Evacuations
For targeted evacuations:
- Select specific zones when activating
- Only personnel in selected zones receive alerts
- Fire Marshals always receive alerts regardless of zone
- Zone markers on the floor plan show affected areas
- Personnel counts per zone are displayed in real-time

## Real-Time Accountability
During an active evacuation:
- **Personnel List**: Shows all on-site staff, visitors, and contractors
- **Safe/Unsafe Status**: Updates in real-time as people mark themselves safe
- **Progress Counter**: Shows X of Y people accounted for
- **Zone Filtering**: Filter by zone to focus on specific areas
- **Search**: Find specific people by name
- **Auto-refresh**: Updates every 5 seconds

## Fire Marshal Access
Fire Marshals have dedicated access:
- Each Fire Marshal has a **permanent static URL** (never expires)
- URLs are in the format: /fire-marshal/[unique-id]
- No login required - accessible from any device
- Shows real-time on-site personnel and accountability status
- **"Peace Time" mode**: Even when no evacuation is active, Fire Marshal URLs always show current on-site personnel

## Self-Service Mark Safe
People can mark themselves safe:
- Each evacuation email contains a unique mark-safe link
- Clicking the link marks the person as safe
- Status updates instantly across all Fire Marshal views and the admin muster page
- Safety tokens are customer-isolated and expire after 24 hours

## Ending an Evacuation
1. Once all personnel are accounted for
2. Click **"End Evacuation"**
3. The evacuation record is archived
4. A summary of the evacuation is saved for records

## Interactive Zone Map
The muster page includes an interactive floor plan:
- Clickable zone markers for quick zone selection
- Zone markers display the zone number and personnel count
- Markers are colour-coded to match zone settings
- Synchronised with zone selector buttons above the map`,
        targetPages: ["emergency-muster", "/emergency-muster"],
        searchKeywords: ["evacuation", "emergency", "muster", "fire marshal", "zone", "safe", "accountability", "alert"],
        estimatedReadTime: 6,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: emergencyCategory?.id,
        title: "Fire Marshal Static URLs",
        slug: createSlug("Fire Marshal Static URLs"),
        summary: "Understanding the permanent Fire Marshal URL system for emergency access",
        content: `# Fire Marshal Static URLs

Fire Marshals have permanent, non-expiring URLs that provide instant access to emergency information without needing to log in.

## How It Works
- When a staff member is designated as a Fire Marshal, a unique static URL is automatically generated
- The URL format is: /fire-marshal/[12-character-unique-id]
- These URLs never expire and work from any device with a web browser
- No login or authentication is required

## Peace Time Mode
Even when no evacuation is active:
- The Fire Marshal URL always shows **current on-site personnel**
- Staff, visitors, and contractors who are currently checked in are displayed
- This provides real-time visibility of who is on site at any moment
- The page auto-refreshes every 5 seconds
- Search and filter capabilities are available

## During an Evacuation
When an evacuation is active:
- The view switches to emergency accountability mode
- Shows who has been marked safe and who is still unaccounted for
- Real-time updates as people use their mark-safe links
- Zone filtering available for zone-based evacuations
- Personnel counts and progress tracking

## Managing Fire Marshal URLs
- View Fire Marshal URL status in **Staff Management**
- Copy the URL to share with the Fire Marshal
- URLs are auto-generated for staff in safety/security departments
- URLs can be manually assigned via the Fire Marshal toggle on staff profiles

## Cross-Database Search
The Fire Marshal system searches across all customer databases to locate the correct Fire Marshal, ensuring the URL works regardless of which customer context the Fire Marshal belongs to.`,
        targetPages: ["staff", "/staff"],
        searchKeywords: ["fire marshal", "static URL", "emergency", "permanent link", "peace time", "on-site"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Zone Management for Evacuations
      {
        categoryId: emergencyCategory?.id,
        title: "Zone Management for Evacuations",
        slug: createSlug("Zone Management for Evacuations"),
        summary: "How to create, configure, and use evacuation zones for targeted emergency alerts and organised mustering",
        content: `# Zone Management for Evacuations

Configure evacuation zones so you can target emergency alerts to specific areas and organise mustering by zone.

## What Are Evacuation Zones?

Zones represent physical areas of your site (e.g. "Ground Floor East", "Building B - First Floor"). During an evacuation you can choose to alert only specific zones rather than the entire site, and Fire Marshals can filter the muster list by zone to quickly account for everyone.

## Creating Zones

1. Navigate to **Settings** > **Zone Management**
2. Click **"Add Zone"**
3. Enter zone details:
   - **Zone Name**: A clear, recognisable name (e.g. "Zone 1 - Ground Floor East")
   - **Colour**: Choose a colour for visual identification on maps and badges
   - **Description**: Describe the area this zone covers
4. Click **Save**

## Reordering Zones

- Drag and drop zones to change their order
- Sort options available: Manual Order, A-Z, Z-A
- The order you set here is how zones appear on the muster page during evacuations

## Interactive Floor Plan Mapping

You can visually position zones on a floor plan image:

1. Upload a floor plan image in **Settings** > **Company Settings** (the Zone Map URL field)
2. In **Zone Management**, each zone gets a draggable marker
3. Drag markers to their correct positions on the floor plan
4. Markers display the zone number and are colour-coded to match the zone colour
5. Positions are saved automatically

## Zone Colours

Each zone has its own colour which is used for:
- The zone marker on the floor plan
- The zone filter buttons on the muster page
- Visual identification throughout the system

## Assigning People to Zones

Personnel are assigned to zones when they check in:
- **Staff**: Zone can be selected during staff check-in
- **Visitors**: Zone selected during visitor check-in
- **Contractor Workers**: Zone selected during contractor check-in
- Zones can also be assigned via profile settings

## How Zones Work During Evacuations

When you activate an evacuation:

1. You can select **specific zones** to target, or activate site-wide
2. Only personnel assigned to the selected zones receive evacuation email alerts
3. **Fire Marshals always receive alerts** regardless of which zones are selected
4. The muster page shows zone-specific personnel counts
5. Zone filter buttons let you quickly view people in each zone
6. Clickable zone markers on the floor plan also filter by zone

## Zone Map on the Muster Page

During an active evacuation, the muster page shows:
- Your floor plan with colour-coded zone markers
- Each marker displays the zone number and how many people are in that zone
- Click a marker to filter the personnel list to just that zone
- Markers synchronise with the zone selector buttons above the map

## Tips for Setting Up Zones

- Use clear, descriptive names that everyone on site will recognise
- Match zones to your physical fire evacuation plan
- Keep zone names consistent with signage around your building
- Test your zone setup by running a practice evacuation
- Review and update zones whenever the building layout changes`,
        targetPages: ["emergency-muster", "/emergency-muster", "zone-management", "/zone-management"],
        searchKeywords: ["zone", "zones", "evacuation zone", "floor plan", "map", "markers", "zone management", "muster zone", "targeted evacuation"],
        estimatedReadTime: 5,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 3,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== SAFETY & COMPLIANCE =====
      {
        categoryId: safetyCategory?.id,
        title: "Safety Inductions & AI Training Videos",
        slug: createSlug("Safety Inductions and AI Training Videos"),
        summary: "Setting up safety inductions, AI-generated training videos, and H&S document management",
        content: `# Safety Inductions & AI Training Videos

Ensure all site users receive proper safety training with integrated induction tools and AI-powered content generation.

## Setting Up Inductions
1. Navigate to the induction management area
2. Create or edit induction content using the rich text editor
3. Add multiple sections covering different safety topics
4. Set requirements (mandatory before site access, expiry dates)
5. Configure which personnel types need to complete the induction

## Induction Content
Include essential safety information:
- Site emergency procedures and assembly points
- PPE requirements for different areas
- Hazard identification and reporting
- Safe work practices
- Emergency contact information
- Site-specific rules and restrictions

## AI-Generated Safety Videos
TPR Max can generate professional safety training videos using AI:
- **Script Generation**: AI creates context-aware safety scripts tailored to your company
- **Image Generation**: Photorealistic, scene-specific workplace safety images are generated for each section
- **Voice Narration**: Professional AI voice narration with different voice options
- **Fallback System**: Multiple image generation methods ensure reliability

## H&S Document Management
- Upload health & safety documents for contractor acceptance
- Documents can be assigned to specific contractor companies
- Contractors accept documents via public links (no login required)
- Track acceptance status and dates
- Set document expiry for re-acceptance requirements

## Compliance Tracking
Monitor induction and H&S compliance:
- View completion status per person
- Track expiry dates and renewal requirements
- Generate compliance reports
- Automatic alerts for expiring inductions

## Public Acceptance Links
H&S documents can be accepted without logging in:
- Generate shareable links for document acceptance
- Contractors and workers access via their browser
- Acceptance is recorded with timestamp and signature
- No system account required`,
        targetPages: ["safety", "inductions", "/inductions"],
        searchKeywords: ["safety", "induction", "training", "AI", "video", "H&S", "compliance", "documents"],
        estimatedReadTime: 5,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== MEETING ROOMS & BOOKINGS =====
      {
        categoryId: meetingRoomCategory?.id,
        title: "Meeting Room Booking",
        slug: createSlug("Meeting Room Booking"),
        summary: "How to book meeting rooms, manage availability, and view the booking calendar",
        content: `# Meeting Room Booking

Manage meeting room availability and bookings for your organisation.

## Adding Meeting Rooms
1. Navigate to **Meeting Rooms**
2. Click **"Add Room"**
3. Enter room details:
   - Room name and location
   - Capacity (number of people)
   - Available equipment (projector, whiteboard, video conferencing, etc.)
4. Set the room as active or inactive
5. Save the room

## Booking a Room
1. Go to the **Meeting Rooms** page
2. Select a room from the list
3. Click **"Book Room"**
4. Choose date and time
5. Add meeting title and description
6. Select staff attendees
7. Check for conflicts (the system prevents double-booking)
8. Confirm the booking

## Viewing Bookings
- **Calendar View**: See all bookings on a calendar
- **Today's Bookings**: Quick view of today's room usage
- **Room-specific View**: See all bookings for a particular room

## Managing Bookings
- Edit existing bookings to change time or attendees
- Cancel bookings that are no longer needed
- Recurring bookings are supported for regular meetings

## Conflict Detection
The system automatically:
- Checks for room availability before confirming bookings
- Prevents overlapping bookings for the same room
- Alerts you if your requested time slot is unavailable

## Room Status
- **Active**: Available for booking
- **Inactive**: Temporarily unavailable (under maintenance, etc.)`,
        targetPages: ["meeting-rooms", "/meeting-rooms"],
        searchKeywords: ["meeting room", "booking", "calendar", "availability", "room", "schedule"],
        estimatedReadTime: 3,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== REPORTS & ANALYTICS =====
      {
        categoryId: reportsCategory?.id,
        title: "Reports, Analytics & CO2 Sustainability",
        slug: createSlug("Reports Analytics and CO2 Sustainability"),
        summary: "Generating reports, viewing analytics dashboards, and CO2 sustainability tracking",
        content: `# Reports, Analytics & CO2 Sustainability

TPR Max provides comprehensive reporting and analytics for management, compliance, and environmental tracking.

## Dashboard Analytics
The main dashboard shows real-time metrics:
- Total visitors, staff, and contractors currently on site
- Today's check-in/check-out activity
- Department-based analytics
- Peak hours analysis
- Occupancy trends over time

## Report Types
- **Visitor Reports**: Daily, weekly, monthly visitor logs
- **Staff Reports**: Time & attendance, check-in history
- **Contractor Reports**: Worker activity, compliance status
- **Security Reports**: Access logs and safety incidents
- **Emergency Reports**: Evacuation history and response times

## Generating Reports
1. Navigate to the **Reports** section
2. Select the report type
3. Choose your date range
4. Apply filters (department, visitor type, company, etc.)
5. Generate the report
6. Export as PDF or CSV

## CO2 Sustainability Reports
Track the carbon footprint of contractor commutes:
- AI-powered distance calculations between UK postcodes
- Intelligent route type detection (motorway, A-roads, mixed routes)
- Detailed emissions breakdowns per worker
- Total carbon footprint analysis
- Actionable recommendations for reducing emissions
- Reports are stored per customer for historical tracking

## Export Options
- **PDF**: Professional formatted reports for management
- **CSV**: Raw data exports for spreadsheet analysis
- **Email**: Send reports directly to stakeholders

## Key Metrics Tracked
- Total visitor, staff, and contractor counts
- Average visit durations
- Peak visit times and patterns
- Department popularity
- Compliance rates
- Emergency response metrics`,
        targetPages: ["reports", "/reports"],
        searchKeywords: ["reports", "analytics", "export", "statistics", "CO2", "sustainability", "carbon", "dashboard"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== ID CARD & PASS PRINTING =====
      {
        categoryId: printingCategory?.id,
        title: "ID Card & Pass Printing",
        slug: createSlug("ID Card and Pass Printing"),
        summary: "Setting up thermal printers, designing pass templates, and printing visitor/contractor badges",
        content: `# ID Card & Pass Printing

TPR Max supports network thermal printing for professional visitor and contractor ID passes.

## Supported Printers
- **Toshiba Tec**: TCPL command language
- **Zebra**: ZPL command language
- Both connected via network TCP/IP (default port: 9100)

## Printer Setup
1. Go to **Settings** > **Printer Configuration**
2. Enter your printer's IP address and port
3. Select the printer type (Toshiba Tec or Zebra)
4. Click **"Test Connection"** to verify
5. Use **"Test Print"** to check output quality

## Pass Template Designer
Design professional ID passes:
1. Open the **Template Designer**
2. Drag and drop elements onto the pass layout
3. Available elements include:
   - Visitor/worker name and company
   - Host name
   - Photo
   - QR code
   - Date and time
   - Company logo
   - Custom text and shapes
4. Preview the design before printing
5. Save templates for reuse

## Printing Passes
Passes can be printed:
- Automatically during check-in
- Manually from the visitor or worker profile
- As a batch for pre-booked visitors

## Pass Information
Standard pass content includes:
- Person's name and photo
- Company/organisation
- Host (who they are visiting)
- Date and time of visit
- Unique QR code for check-out
- Your company logo and branding

## Print Quality Settings
- Adjust print darkness/density
- Configure label size
- Set orientation (portrait/landscape)
- Preview print code before sending to printer`,
        targetPages: ["settings", "/settings"],
        searchKeywords: ["printer", "badge", "pass", "ID card", "thermal", "Toshiba", "Zebra", "template", "QR code"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== SETTINGS & CONFIGURATION =====
      {
        categoryId: settingsCategory?.id,
        title: "System Settings & Company Branding",
        slug: createSlug("System Settings and Company Branding"),
        summary: "How to configure TPR Max settings, company branding, and system preferences",
        content: `# System Settings & Company Branding

Customise TPR Max to match your organisation's branding and requirements.

## Company Branding
1. Navigate to **Settings**
2. Configure your company identity:
   - **Company Name**: Appears on passes, emails, and reports
   - **Company Logo**: Upload your logo (shown on login page, passes, and email headers)
   - **Accent Colour**: Set your brand colour for the interface
   - **Address**: Your organisation's address

## Notification Preferences
Configure how notifications are sent:
- Host arrival notifications (email when a visitor arrives)
- Emergency evacuation alerts
- Compliance expiry reminders
- Pre-booking confirmations

## Email Configuration
Set up email delivery:
1. Configure SMTP settings or use SendGrid
2. Set sender name and email address
3. Test email delivery
4. Emails are automatically branded with your company logo and colours

## Feature Toggles
Enable or disable features per your needs:
- Visitor pre-booking
- Contractor management
- Meeting room booking
- ID card printing
- Voice notifications
- AI-powered features

## Auto-Save
Settings changes are saved automatically as you make them - no need to click a save button.`,
        targetPages: ["settings", "/settings"],
        searchKeywords: ["settings", "configuration", "branding", "logo", "company", "email", "notifications"],
        estimatedReadTime: 4,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: settingsCategory?.id,
        title: "Managing User Accounts and Invitations",
        slug: createSlug("Managing User Accounts and Invitations"),
        summary: "How to invite new users, manage accounts, and handle user permissions",
        content: `# Managing User Accounts and Invitations

Control who has access to your TPR Max system with user management features.

## Inviting New Users
1. Navigate to **Settings** > **User Management**
2. Click **"Invite User"**
3. Enter the user's email address
4. Select the appropriate role:
   - **Admin**: Full system access and user management
   - **User**: Standard access for daily operations
5. Click **"Send Invitation"**

## Sharing Invitation Links
If email delivery isn't working or you prefer direct sharing:
1. Find the pending invitation in the user list
2. Click the **"Copy Link"** button next to the invitation
3. Share the copied link directly with the invitee
4. They can use this link to complete their registration

## Invitation Status
Monitor invitation status in the user list:
- **Active Users**: Shown with blue avatar and username
- **Pending Invitations**: Shown with amber/yellow avatar and "Awaiting" badge

## Accepting an Invitation
When a user receives an invitation:
1. Click the invitation link (from email or shared link)
2. Enter desired username
3. Create a secure password (8+ characters)
4. Confirm password
5. Click **"Create Account"**
6. Log in with new credentials

## User Roles
- **Admin**: Can invite users, edit all accounts, change roles, delete users, access all settings
- **User**: Can use the system for daily operations but cannot manage other users

## Security Best Practices
- Only invite users who need system access
- Assign the minimum required permission level
- Regularly review user accounts and remove unused ones
- Use strong passwords with a mix of letters, numbers, and symbols`,
        targetPages: ["settings", "/settings"],
        searchKeywords: ["users", "invitations", "invite", "accounts", "permissions", "roles", "admin", "copy link"],
        estimatedReadTime: 4,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: settingsCategory?.id,
        title: "Zone Management",
        slug: createSlug("Zone Management"),
        summary: "How to create, configure, and manage evacuation zones with interactive floor plan mapping",
        content: `# Zone Management

Configure evacuation zones for targeted emergency alerts and organised mustering.

## Creating Zones
1. Navigate to **Settings** > **Zone Management**
2. Click **"Add Zone"**
3. Enter zone details:
   - **Zone Name**: e.g., "Zone 1 - Ground Floor East"
   - **Colour**: Choose a colour for visual identification
   - **Description**: Describe the area covered by this zone
4. Save the zone

## Zone Limits
- There is no limit to the number of zones you can create
- Zones can be reordered using drag-and-drop
- Sort options available: Order, A-Z, Z-A

## Interactive Floor Plan
Optionally add a floor plan image for visual zone mapping:
1. Upload a floor plan image in **Settings** > **Company Settings**
2. In Zone Management, position zone markers on the floor plan
3. Drag markers to their correct positions
4. Markers display the zone number and are colour-coded

## Zone Usage During Evacuations
When activating an evacuation:
- Select specific zones to target only those areas
- Only personnel assigned to selected zones receive alerts
- Fire Marshals always receive alerts regardless of zone
- The muster page shows zone-specific personnel counts
- Zone markers on the map are clickable for quick filtering

## Zone Assignment
Personnel are assigned to zones during:
- Staff check-in
- Visitor check-in
- Contractor worker check-in
- Or via staff/visitor/worker profile settings

## Zone Map on Muster Page
During evacuations, the muster page shows:
- Interactive floor plan with zone markers
- Each marker shows the zone number and personnel count
- Click markers to toggle zone filtering
- Synchronised with the zone selector buttons above`,
        targetPages: ["zone-management", "/zone-management", "settings", "/settings"],
        searchKeywords: ["zones", "evacuation zones", "floor plan", "map", "markers", "zone management"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 3,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // ===== TROUBLESHOOTING =====
      {
        categoryId: troubleshootingCategory?.id,
        title: "Common Issues and Solutions",
        slug: createSlug("Common Issues and Solutions"),
        summary: "Quick fixes for the most common TPR Max issues",
        content: `# Common Issues and Solutions

Quick solutions to frequently encountered problems.

## Badge Printer Not Working
**Symptoms**: Badges not printing or poor print quality

**Solutions**:
1. Check printer is powered on and connected to the network
2. Verify the IP address and port (default 9100) in Settings
3. Click "Test Connection" to verify network connectivity
4. Replace thermal paper or ribbon if print quality is poor
5. Clean printer heads
6. Try a test print from Settings to check output

## Visitor Photos Not Capturing
**Symptoms**: Camera not working or photos appear black

**Solutions**:
1. Check browser camera permissions (allow camera access)
2. Ensure adequate lighting
3. Try a different browser (Chrome recommended)
4. Check camera hardware connection
5. Update browser to latest version

## Evacuation Emails Not Sending
**Symptoms**: Staff/visitors not receiving evacuation alerts

**Solutions**:
1. Verify email settings are configured in Settings
2. Check that staff have valid email addresses
3. Look in spam/junk folders
4. Test email delivery from Settings
5. Ensure SendGrid API key is configured correctly

## Settings Not Saving
**Symptoms**: Changes to settings are not being saved

**Solutions**:
1. Settings auto-save - wait a moment for the save to complete
2. Refresh the page and check if changes persisted
3. Check your internet connection
4. Try logging out and back in

## Host Not Receiving Arrival Notifications
**Symptoms**: Staff host not getting emails when their visitor arrives

**Solutions**:
1. Verify the host has a valid email address in their staff profile
2. Check email configuration in Settings
3. Look in the host's spam/junk folder
4. Ensure host notifications are enabled in Settings

## Card Issue Not Working
**Symptoms**: Error when trying to issue a red or yellow card

**Solutions**:
1. Ensure you are logged in with an admin account
2. Check that card offences have been configured
3. Verify the worker exists in the contractor company
4. Try refreshing the page and attempting again

## Slow System Performance
**Symptoms**: Pages loading slowly or timeouts

**Solutions**:
1. Check internet connection speed
2. Clear browser cache and cookies
3. Close unnecessary browser tabs
4. Restart the browser
5. Contact your IT support if persistent

## Getting Additional Help
If these solutions don't resolve your issue:
1. Use this help panel for more specific topics
2. Contact your system administrator
3. Check all required settings are configured`,
        targetPages: ["dashboard", "visitors", "staff", "contractors", "/"],
        searchKeywords: ["troubleshooting", "problems", "issues", "help", "solutions", "printer", "camera", "email"],
        estimatedReadTime: 5,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: troubleshootingCategory?.id,
        title: "Invitation and User Account Issues",
        slug: createSlug("Invitation and User Account Issues"),
        summary: "Troubleshooting problems with user invitations and account access",
        content: `# Invitation and User Account Issues

Solutions for common problems with user invitations and account management.

## Invitation Emails Not Arriving
**Solutions**:
1. Check user's spam/junk folder
2. Verify email address is correct
3. Use the **"Copy Link"** button to share the invitation directly
4. Ask recipient to whitelist the sender email address
5. Check email configuration in Settings

## Can't Accept Invitation
**Solutions**:
1. Check that the invitation link is complete and not broken
2. Verify the invitation hasn't been deleted by an admin
3. Try clearing browser cache and cookies
4. Use a different browser
5. Request a new invitation from admin

## Password Requirements Not Met
**Solutions**:
1. Ensure password is at least 8 characters long
2. Include a mix of uppercase and lowercase letters
3. Add numbers to your password
4. Make sure password and confirmation match exactly

## Username Already Taken
**Solutions**:
1. Choose a different username
2. Add numbers or underscores to make it unique
3. Contact admin to check if an old account should be removed

## Cannot Edit User Account
**Solutions**:
1. Verify you have admin role permissions
2. Refresh the page and try again
3. Note: you cannot change your own role (another admin must do this)
4. Ensure all required fields are filled

## Account Access Issues After Creation
**Solutions**:
1. Verify username and password are correct (case-sensitive)
2. Check caps lock is off
3. Wait a few minutes and try again
4. Clear browser cache and cookies
5. Contact admin to verify your account is active

Most invitation issues can be resolved using the copy link feature or by creating a fresh invitation.`,
        targetPages: ["settings", "/settings"],
        searchKeywords: ["invitation", "invite", "email", "account", "password", "user", "troubleshooting", "copy link"],
        estimatedReadTime: 4,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      }
    ];

    // Filter out any articles with undefined categoryId and assert type
    const validArticles = articlesData.filter((article): article is typeof article & { categoryId: string } => 
      article.categoryId !== undefined
    );
    const insertedArticles = await db.insert(helpArticles).values(validArticles).returning();
    logger.info(`✅ Seeded ${insertedArticles.length} help articles`);

    logger.info('🎉 Help system data seeding completed successfully!');
    logger.info(`Total categories: ${insertedCategories.length}`);
    logger.info(`Total articles: ${insertedArticles.length}`);

  } catch (error) {
    logger.error('❌ Error seeding help data:', error);
    throw error;
  }
}

// Run seeding if called directly (CLI only - never in bundled production builds)
const isDirectRun = typeof process.argv[1] === 'string' && 
  import.meta.url === `file://${process.argv[1]}` &&
  !process.argv[1].includes('dist/');
if (isDirectRun) {
  seedHelpData()
    .then(() => {
      logger.info('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}
