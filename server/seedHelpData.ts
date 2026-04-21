import { db } from "./db";
import { helpCategories, helpArticles, insertHelpArticleSchema } from "@shared/schema";
import { eq, like } from "drizzle-orm";

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
      console.log(`📚 Added missing help category: ${cat.name}`);
    }
  }

  // Build new articles with resolved category IDs
  const newArticles = buildNewArticles(categoryMap);

  // Insert any articles whose slugs don't yet exist
  let added = 0;
  for (const article of newArticles) {
    if (!existingSlugs.has(article.slug) && article.categoryId) {
      await db.insert(helpArticles).values(article as any);
      console.log(`📄 Added missing help article: ${article.title}`);
      added++;
    }
  }
  if (added > 0) {
    console.log(`✅ Upserted ${added} new help article(s)`);
  } else {
    console.log('✅ Help content is up to date');
  }
}

export async function seedHelpData() {
  try {
    console.log('🌱 Seeding help system data...');
    
    // Check if help data already exists
    const existingCategories = await db.select().from(helpCategories);
    const existingArticles = await db.select().from(helpArticles);
    
    // Migrate any existing records that still reference "VisiGate Pro" -> "TPR-Max"
    const staleArticles = await db.select().from(helpArticles).where(like(helpArticles.content, '%VisiGate Pro%'));
    if (staleArticles.length > 0) {
      console.log(`🔄 Migrating ${staleArticles.length} help article(s) from VisiGate Pro → TPR-Max...`);
      for (const article of staleArticles) {
        await db.update(helpArticles)
          .set({
            title: article.title.replace(/VisiGate Pro/g, 'TPR-Max'),
            summary: article.summary ? article.summary.replace(/VisiGate Pro/g, 'TPR-Max') : article.summary,
            content: article.content.replace(/VisiGate Pro/g, 'TPR-Max'),
          })
          .where(eq(helpArticles.id, article.id));
      }
      console.log('✅ Migration complete');
    }

    const staleTitleArticles = await db.select().from(helpArticles).where(like(helpArticles.title, '%VisiGate Pro%'));
    if (staleTitleArticles.length > 0) {
      for (const article of staleTitleArticles) {
        await db.update(helpArticles)
          .set({ title: article.title.replace(/VisiGate Pro/g, 'TPR-Max') })
          .where(eq(helpArticles.id, article.id));
      }
    }

    // If data already exists, only upsert new articles/categories that are missing
    if (existingCategories.length > 0 && existingArticles.length > 0) {
      await upsertMissingHelpContent(existingCategories, existingArticles);
      return;
    }

    // Seed Help Categories
    console.log('📚 Seeding help categories...');
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
    console.log(`✅ Seeded ${insertedCategories.length} help categories`);

    // Seed Help Articles
    console.log('📄 Seeding help articles...');
    
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
    console.log(`✅ Seeded ${insertedArticles.length} help articles`);

    console.log('🎉 Help system data seeding completed successfully!');
    console.log(`Total categories: ${insertedCategories.length}`);
    console.log(`Total articles: ${insertedArticles.length}`);

  } catch (error) {
    console.error('❌ Error seeding help data:', error);
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
      console.log('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
