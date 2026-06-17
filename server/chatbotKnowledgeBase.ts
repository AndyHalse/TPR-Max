/**
 * TPR Help Assistant — Knowledge Base
 *
 * This file is the single source of truth for the in-app help chatbot.
 * Keep it in step with the product when features change or new pages are added.
 * Written in British English, plain language.
 */

export const HELP_KNOWLEDGE_BASE = `
# TPR Platform — Help Guide

---

## Visitors

**What it's for:** Managing visitors arriving at your site — check-in, check-out, pre-booking, and visitor passes.

- **Check in a visitor:** Go to **Visitors** → **Check In**. Search for an existing visitor or add a new one, select the host, then click **Check In**. A QR pass can be printed or emailed.
- **Check out a visitor:** Go to **Visitors** → **On Site** (or the dashboard). Find the visitor and click **Check Out**.
- **Pre-book a visitor:** Go to **Visitors** → **Pre-Bookings** → **New Pre-Booking**. Enter the visitor's details, host, and date/time. The visitor receives an invitation email with their QR code.
- **View visitor history:** Go to **Visitors** → **History** to see all past visits with timestamps.
- **Visitor passes:** Passes are generated automatically on check-in. They display the visitor's name, photo (if captured), host, and a QR code. They can be printed from the check-in screen.
- **Kiosk mode:** Go to **Settings** → **Kiosk** or navigate to **/kiosk** on a reception device. Visitors can self-check-in using the touchscreen, sign NDAs, and print passes without staff involvement.

---

## Staff

**What it's for:** Managing employees — their profiles, photos, QR ID cards, and on-site status.

- **Add a staff member:** Go to **Staff** → **Add Staff Member**. Fill in the name, email, job title, department, and any other required fields, then save.
- **Upload a staff photo:** Open a staff member's profile → click the photo area or **Upload Photo**. Staff photos appear on their QR ID card and in the Fire Marshal / muster view.
- **Generate a QR ID card:** Open a staff member's profile → **Generate Pass** or **Download QR Card**. The card contains the staff member's details and a QR code for scanning.
- **Staff check-in / check-out:** Staff can check in via the kiosk, via their QR card being scanned, or manually by a manager going to **Staff** and toggling their on-site status.
- **View who is on site:** The **Dashboard** shows a live count. Go to **Staff** → **On Site** for the full list.
- **Edit or deactivate a staff member:** Open their profile → **Edit**. To deactivate, use the status toggle on their profile.

---

## Contractors

**What it's for:** Managing contractor companies and their workers, requesting compliance documents, and controlling site access based on compliance.

### Adding a contractor company
Go to **Contractors** → **Add Contractor**. Enter the company name, contact details, and any required document types. Save to create the contractor record.

### Requesting compliance documents
Open a contractor's profile → **Request Documents**. Choose the document type (e.g. Public Liability Insurance, RAMS, CSCS cards) and set an expiry-date reminder. An email is sent to the contractor asking them to upload the document.

### Reviewing and approving documents
Open the contractor's profile → **Documents** tab. Click on a pending document to review it. You can **Approve** or **Reject** with a reason. Approved documents turn green; rejected ones return to the contractor for resubmission.

### Compliance gating (blocking site access)
If a contractor has expired or missing required documents, TPR marks them as non-compliant. On the **Compliance Dashboard**, you can see which contractors are blocked. You can configure which document types are mandatory under **Settings** → **Contractor Settings**.

### The Contractor Portal
Contractors can log in to the self-service **Contractor Portal** at **/contractor-portal**. They see their outstanding document requests, can upload documents directly, and can view their compliance status. To invite a contractor to the portal: open their profile → **Invite to Portal** → enter their email.

### Contractor workers
Under a contractor company, go to the **Workers** tab to add individual workers. Each worker can have their own documents (DBS, certifications) and an on-site status.

---

## Inductions

**What it's for:** Building and delivering site inductions for visitors, contractors, or new starters.

- **Create an induction:** Go to **Inductions** → **New Induction**. Add a title, description, and slides. Each slide can contain text, images, or video.
- **AI induction generation:** On the induction builder, click **Generate with AI**. Describe your site and safety requirements; the AI will produce a multi-slide induction draft that you can then edit.
- **Add a video to an induction:** On a slide, click **Add Video** and upload an MP4 or paste a video URL.
- **Assign an induction:** Open the induction → **Assign**. Choose whether it applies to visitors, specific contractors, or all workers. Recipients receive an email with a link to complete the induction online.
- **Track completion:** Go to **Inductions** → open the induction → **Completions** tab to see who has and hasn't completed it.
- **Induction settings:** Go to **Settings** → **Inductions** to configure defaults — e.g. whether induction must be completed before check-in, re-induction intervals.

---

## Mustering / Evacuation

**What it's for:** Conducting emergency roll calls and tracking who has been accounted for during an evacuation. This section explains how to set it up — during a live evacuation, use the Fire Marshal screen.

- **Start an evacuation roll call:** On a mobile device or tablet, go to **/fire-marshal** and enter your Fire Marshal PIN. You'll see everyone expected on site and can mark them as accounted for by scanning their QR code or tapping their name.
- **Set up Fire Marshal PINs:** Go to **Settings** → **Emergency / Mustering** and add Fire Marshal PINs for designated staff.
- **Muster points:** Configure muster points in **Settings** → **Emergency / Mustering**. Each point can have a name and location description.
- **Evacuation reports:** After an evacuation, a PDF report is generated automatically showing who was accounted for and the time taken. Access past reports via **Reports** → **Evacuation Reports**.
- **Drill mode:** When starting an evacuation via the Fire Marshal screen, tick **This is a drill** so it is recorded separately from real incidents.

---

## Members

**What it's for:** Managing members of a club, association, or similar — similar to visitors but with recurring membership.

- **Add a member:** Go to **Members** → **Add Member**. Fill in name, contact details, and membership type.
- **Check in / check out a member:** Go to **Members** → **Check In**. Search by name or scan their QR pass.
- **Member passes:** Members can have QR passes generated from their profile → **Generate Pass**.
- **View on-site members:** The dashboard and **Members** → **On Site** show who is currently on the premises.

---

## PPM — Planned Preventative Maintenance

**What it's for:** Scheduling and tracking maintenance tasks for assets and equipment.

- **Add an asset:** Go to **PPM** → **Assets** → **Add Asset**. Enter the asset name, location, category, and service frequency.
- **Create a work order:** Go to **PPM** → **Work Orders** → **New Work Order**. Link it to an asset, assign a due date and responsible person, and describe the task.
- **Complete a work order:** Open the work order → fill in the completion notes and date → **Mark as Complete**. A service certificate is generated automatically.
- **View upcoming maintenance:** Go to **PPM** → **Dashboard** or **Upcoming** to see work orders due soon, with colour-coded urgency.
- **Public work order link:** Each work order has a shareable link so an external contractor can update it without logging in.
- **Service certificates:** Completed work orders generate a PDF certificate. View them under the asset's **History** tab or **PPM** → **Certificates**.

---

## Permit to Work

**What it's for:** Issuing formal permits for high-risk work such as hot works, working at height, or confined spaces.

- **Create a permit:** Go to **Permit to Work** → **New Permit**. Select the permit type, fill in the work description, hazards, controls, and validity period. Assign the permit issuer and the person doing the work.
- **Approve a permit:** Permits require sign-off. Open the permit → **Approve**. Both the issuer and worker may need to sign (depending on your settings).
- **Close a permit:** When work is complete, open the permit → **Close Permit**. Record any observations.
- **View active permits:** Go to **Permit to Work** → **Active** to see all currently open permits.

---

## Risk Assessment (RA) Builder & RAMS

**What it's for:** Creating Method Statements and Risk Assessments (RAMS) for specific tasks or projects.

- **Create a risk assessment:** Go to **RA Builder** → **New Risk Assessment**. Select a template or start from scratch. Add hazards, who is affected, current controls, and residual risk rating.
- **Use a template:** The template library contains pre-built RA templates. Go to **RA Builder** → **Templates** and select one to copy it.
- **Publish a RAMS:** Once complete, click **Publish** to lock the document and generate a PDF. Share it with contractors or upload it to a contractor's profile.
- **Request RAMS from a contractor:** On a contractor's profile → **Request Documents** → select **RAMS** as the document type.

---

## Audits & Inspections

**What it's for:** Conducting site safety inspections, equipment checks, and compliance audits using customisable checklists.

- **Create an audit template:** Go to **Audits & Inspections** → **Templates** → **New Template**. Add sections and questions. Questions can be yes/no, scored, or free-text.
- **Start an audit:** Go to **Audits & Inspections** → **New Audit**. Select a template, choose the area or asset being audited, and work through the checklist.
- **Add photos to an audit:** On any question, tap the camera icon to attach a photo as evidence.
- **Complete and submit an audit:** Click **Submit Audit**. A PDF report is generated. Failed items can be flagged as actions requiring follow-up.
- **View past audits:** Go to **Audits & Inspections** → **History**.

---

## Fire Risk Assessment

**What it's for:** Recording and managing your statutory Fire Risk Assessment under the Regulatory Reform (Fire Safety) Order 2005.

- **Create a Fire Risk Assessment:** Go to **Fire Risk Assessment** → **New Assessment**. Work through the structured sections: premises details, hazards, occupants at risk, evaluation, existing measures, and action plan.
- **Add action items:** Within the assessment, flag items that need remediation and assign responsible persons and target dates.
- **Review and sign off:** The assessor can sign off the completed FRA digitally. A PDF is generated for your records.
- **Review schedule:** TPR prompts you when your FRA is due for review (typically annually). Check the **Due for Review** banner on the FRA page.

---

## Martyn's Law

**What it's for:** Helping venues comply with the UK Protect Duty (Martyn's Law) — documenting your public-protection procedures.

- **Access Martyn's Law:** Go to **Martyn's Law** from the main navigation.
- **Complete your procedures:** Work through each section (lockdown procedure, evacuation, communication, staff training, etc.) and document your arrangements.
- **Save progress:** Sections save as you go. A completion percentage is shown on the overview page.
- **Download your plan:** Once all sections are complete, download the full Protect Duty plan as a PDF.

---

## H&S Incidents (RIDDOR)

**What it's for:** Recording workplace accidents, near misses, and RIDDOR-reportable incidents.

- **Log an incident:** Go to **H&S Incidents** → **New Incident**. Fill in the date, location, type of incident, people involved, description, and any immediate action taken.
- **RIDDOR reporting:** If the incident is reportable under RIDDOR, mark it as such. TPR will prompt you with the relevant reporting guidance and time limits.
- **Attach evidence:** Upload photos or documents to the incident record.
- **View past incidents:** Go to **H&S Incidents** → **History**. Filter by type, date range, or person.
- **Incident statistics:** Go to **Reports** → **Incidents** for a summary over time.

---

## Compliance Certificates

**What it's for:** Keeping a central register of your site compliance certificates (e.g. electrical test, gas safety, asbestos survey, lift inspection).

- **Add a certificate:** Go to **Compliance Certificates** → **Add Certificate**. Enter the certificate type, issue date, expiry date, and issuing body. Upload the PDF.
- **Set renewal reminders:** Each certificate can have an automatic reminder emailed to you before it expires. Set the lead time (e.g. 60 days) when adding the certificate.
- **View expiring certificates:** The **Compliance Dashboard** shows a traffic-light overview of all certificates — green (valid), amber (expiring soon), red (expired).
- **Compliance Dashboard:** Go to **Compliance Dashboard** for a single view across contractor documents and site certificates.

---

## Meeting Rooms

**What it's for:** Booking and managing meeting room availability.

- **Book a room:** Go to **Meeting Rooms** → **New Booking**. Select the room, date, start and end time, and add a title. Optionally invite attendees.
- **View the room diary:** Go to **Meeting Rooms** → **Diary** for a calendar view of all room bookings.
- **Add a meeting room:** Go to **Settings** → **Meeting Rooms** → **Add Room**. Enter the room name, capacity, and any facilities.
- **Cancel a booking:** Open the booking → **Cancel Booking**.

---

## Equipment Register

**What it's for:** Keeping a register of tools and equipment issued to workers or stored on site.

- **Add equipment:** Go to **Equipment Register** → **Add Item**. Enter the item name, serial number, category, and assigned person.
- **Check equipment in/out:** Open an equipment record → **Check Out** to assign it to someone, or **Check In** to return it.
- **View equipment history:** Open an equipment record → **History** tab to see all assignments.

---

## Worker DBS

**What it's for:** Recording and tracking DBS (Disclosure and Barring Service) check results for contractor workers.

- **Add a DBS record:** Go to a contractor worker's profile → **DBS** tab → **Add DBS Check**. Enter the check level, date, and reference number.
- **Set renewal reminders:** DBS checks have a configurable reminder period. Set it in **Settings** → **Contractor Settings**.
- **View expiring DBS records:** The Compliance Dashboard and contractor worker list flag workers with expired or expiring DBS checks.

---

## Worker Certifications

**What it's for:** Storing professional certifications for contractor workers (e.g. CSCS cards, IPAF, PASMA).

- **Add a certification:** Go to a worker's profile → **Certifications** tab → **Add Certification**. Enter the certification name, number, issuing body, and expiry date. Upload a copy.
- **View expiring certifications:** Certifications nearing expiry are highlighted in the worker's profile and on the Compliance Dashboard.

---

## Template Library

**What it's for:** A shared library of reusable document templates (risk assessments, method statements, RAMS, induction templates).

- **Browse templates:** Go to **Template Library** from the navigation. Templates are grouped by category.
- **Use a template:** Click a template → **Use this Template**. It creates a copy you can edit.
- **Add your own template:** Go to **Template Library** → **New Template**. Give it a name, category, and content. Save and it will be available to your team.

---

## Reports & Analytics

**What it's for:** Viewing and exporting data about site activity.

- **Visitor reports:** Go to **Reports** → **Visitors**. Filter by date range and export to CSV.
- **Contractor reports:** Go to **Reports** → **Contractors** for a summary of compliance status and on-site time.
- **Evacuation reports:** Go to **Reports** → **Evacuations** to view and download post-evacuation PDFs.
- **Incident reports:** Go to **Reports** → **Incidents** for H&S incident summaries.
- **Peak hours / analytics:** Go to **Analytics** for charts on visitor and contractor arrival patterns.
- **Email outbox:** Go to **Reports** → **Email Outbox** to see all system emails sent (invitations, document requests, etc.).

---

## Settings

### Company branding and logo
Go to **Settings** → **Branding**. Upload your logo (used on passes and emails), set your primary brand colour, and customise the platform name.

### AI keys
Go to **Settings** → **AI Settings**. Enter your own Anthropic (Claude) API key if you want to use your own account for AI features such as document scanning and induction generation. If left blank, the platform-wide key is used.

### Integrations
- **Microsoft Teams:** Go to **Settings** → **Integrations** → **Teams**. Follow the setup steps to connect your Teams tenant so visitor notifications are sent to a Teams channel.
- **Calendar (Microsoft 365 / Google):** Go to **Settings** → **Integrations** → **Calendar**. Connect your calendar so meeting room bookings sync automatically.
- **Paxton Net2 / Suprema BioStar 2:** Access control integrations are configured by your system administrator. Contact TPR support if you need help setting these up.

### User management
Go to **Settings** → **Users** to invite additional users to your account, set their roles, and deactivate accounts.

---

## CDM 2015

**What it's for:** Managing Construction Design and Management (CDM 2015) project records — required for notifiable construction projects.

- **Create a CDM project:** Go to **CDM 2015** → **New Project**. Enter project details, duty holders (client, principal contractor, principal designer), and key dates.
- **F10 notification:** TPR can help you prepare the HSE F10 notification form. Fill in the project details and the form will be pre-populated for you to submit to the HSE.
- **Upload project documents:** Attach pre-construction information, health and safety files, and other CDM documents to the project record.

---

## Lone Worker Protection

**What it's for:** Monitoring staff who work alone and may be at risk — automated welfare check calls and escalation.

- **Enrol a lone worker:** Go to **Lone Worker** → **Add Worker**. Select the staff member and configure their check-in interval and escalation contacts.
- **Start a lone worker session:** The lone worker calls the TPR welfare check line or uses the app. If they do not respond within the configured interval, the system escalates to the nominated contacts.
- **View active sessions:** Go to **Lone Worker** → **Active Sessions** to see workers currently checked in.
- **View history:** Go to **Lone Worker** → **History** for a log of all past sessions and any missed check-ins.

---

## Reporting a Problem / Raising a Bug

**What it's for:** Letting the TPR team know about something that is not working correctly.

- Click the **Report a Problem** button — usually found in the sidebar footer, help menu, or by clicking the bug icon.
- Describe what you were doing, what you expected to happen, and what actually happened.
- Attach a screenshot if helpful.
- Your report is sent directly to the TPR team and you will receive a confirmation email.
`;
