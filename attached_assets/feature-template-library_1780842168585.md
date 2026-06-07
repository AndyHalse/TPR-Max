# Replit Prompt — Template Library (Inductions, RAMS, Risk Assessments)

## What This Does

Adds a library of pre-built, UK-regulation-referenced templates that customers can import into their account with one click. Templates cover site inductions, RAMS, and risk assessments for common industries and work types.

Right now every customer starts from scratch. SMEs without a dedicated H&S person don't know what a compliant manual handling RAMS should contain. This closes that gap — and it makes onboarding dramatically faster because customers see immediate value before they've typed a word.

Templates are seeded at the platform level (shared across all customers). When a customer imports one, a copy is created in their account which they can then customise freely.

Feature flag: `featureTemplateLibrary` (default: `true` — available on all plans).

---

## Files to Create

- `server/routes/templateLibrary.ts`
- `server/data/templateLibrarySeeds.ts` — the actual template content
- `client/src/pages/TemplateLibrary.tsx`

## Files to Change

- `server/isolatedSchema.ts` — NOT needed (templates are platform-level, not per-customer)
- `server/db.ts` (or main database file) — add `libraryTemplates` table to the **platform** (non-isolated) schema
- `client/src/App.tsx` — route
- `client/src/components/Sidebar.tsx` — nav link (under a "Resources" section)

---

## 1. Platform-Level Database Table

Templates live in the **platform** database (the shared one, not per-customer schemas). This is the same database that stores customer accounts.

```sql
CREATE TABLE IF NOT EXISTS library_templates (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,           -- 'induction' | 'rams' | 'risk_assessment'
  industry TEXT NOT NULL,           -- 'construction' | 'manufacturing' | 'general' | 'healthcare' | 'education' | 'logistics'
  title TEXT NOT NULL,
  description TEXT NOT NULL,        -- 1-2 sentences on what this template covers
  content JSONB NOT NULL,           -- the actual template content (structure varies by category — see below)
  regulatoryBasis TEXT[],           -- e.g. ['CDM 2015', 'MHSWR 1999', 'PUWER 1998']
  tags TEXT[],                      -- e.g. ['hot works', 'working at height']
  difficulty TEXT DEFAULT 'beginner', -- 'beginner' | 'intermediate' | 'advanced'
  estimatedTime TEXT,               -- e.g. '10 minutes to customise'
  active BOOLEAN DEFAULT true,
  createdAt TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. Template Content Structure (JSONB)

### Induction template content:
```json
{
  "welcomeMessage": "Welcome to [Site Name]...",
  "sections": [
    {
      "title": "Site Rules",
      "body": "The following rules apply to all visitors and contractors...",
      "requiresAcknowledgement": true
    }
  ],
  "documents": [
    {
      "name": "Health & Safety Policy",
      "description": "Please read our site H&S policy before proceeding.",
      "required": true
    }
  ],
  "quiz": [
    {
      "question": "What should you do if you see a hazard?",
      "options": ["Report it immediately", "Ignore it", "Deal with it yourself"],
      "correctAnswer": 0
    }
  ]
}
```

### RAMS template content:
```json
{
  "scope": "This method statement covers...",
  "hazards": [
    {
      "description": "Manual handling injuries",
      "controls": "Use mechanical handling aids where possible. Train operatives in correct lifting technique.",
      "likelihood": 2,
      "severity": 3,
      "residualRisk": "low"
    }
  ],
  "ppe": ["Hard hat", "Hi-vis vest", "Safety boots", "Gloves"],
  "emergencyProcedure": "In the event of an emergency...",
  "supervisorResponsibilities": "The site supervisor must ensure...",
  "workerSignOff": true
}
```

### Risk assessment template content:
```json
{
  "assessmentType": "general",
  "location": "",
  "hazards": [
    {
      "hazard": "Slips, trips and falls",
      "whoMightBeHarmed": "All personnel",
      "existingControls": "Good housekeeping maintained. Spillages cleared immediately.",
      "likelihood": 2,
      "severity": 3,
      "additionalControls": "",
      "responsiblePerson": "",
      "targetDate": ""
    }
  ]
}
```

---

## 3. Seed Data — `server/data/templateLibrarySeeds.ts`

Seed the platform database with the following templates on startup (use `INSERT ... ON CONFLICT DO NOTHING` so it's idempotent):

**Inductions (minimum 5 to seed):**
1. General Site Induction — General — covers site rules, emergency procedures, PPE, reporting
2. Construction Site Induction — Construction — CDM 2015 framing, permit to work intro, exclusion zones
3. Manufacturing / Warehouse Induction — Manufacturing — machinery, pedestrian routes, forklift awareness, COSHH
4. Healthcare Facility Induction (Non-Clinical) — Healthcare — infection control basics, patient confidentiality, fire procedures
5. Office / Commercial Site Induction — General — visitor rules, fire exits, lone working policy

**RAMS (minimum 5 to seed):**
1. Manual Handling — General — MHSWR 1999, Manual Handling Operations Regulations 1992
2. Working at Height — Construction — Work at Height Regulations 2005
3. Hot Works (Welding/Cutting) — Construction / Manufacturing — Fire precautions, permit to work trigger
4. Electrical Isolation — Manufacturing — Electricity at Work Regulations 1989, lockout/tagout
5. Excavation and Ground Works — Construction — CDM 2015, underground services, ground stability

**Risk Assessments (minimum 5 to seed):**
1. General Office Risk Assessment — General — MHSWR 1999, DSE, fire, ergonomics
2. Construction Site General RA — Construction — CDM 2015, MHSWR 1999
3. Manual Handling RA — General — Manual Handling Operations Regulations 1992
4. COSHH RA — Manufacturing — Control of Substances Hazardous to Health Regulations 2002
5. Lone Working RA — General — MHSWR 1999, employer duty of care

Each seed entry must include: accurate `regulatoryBasis` arrays, sensible `tags`, and `estimatedTime` ("10–15 minutes to customise" for most).

---

## 4. Backend Routes — `server/routes/templateLibrary.ts`

Register on `/api/template-library`.

### GET /api/template-library
Returns all active templates. Supports query params:
- `?category=rams` — filter by category
- `?industry=construction` — filter by industry
- `?q=working+at+height` — simple text search on title/description/tags

No auth required to browse (public read). Auth required to import.

### POST /api/template-library/:id/import
Authenticated. Imports a template into the customer's account.

**Import logic by category:**

- **induction** → create a new record in the customer's `inductions` table using the template content. Set `name` to the template title, `content` to the template's `welcomeMessage` + sections formatted as rich text, mark as `draft` so the customer must review before activating.

- **rams** → create a new record in the customer's `rams_documents` table (or equivalent). Set title, content, mark as draft.

- **risk_assessment** → create a new record in the customer's `risk_assessments` table via the RA Builder route. Map hazards, controls, and risk ratings from the template.

Return the newly created record's ID and URL so the frontend can redirect the customer straight to it for customisation.

---

## 5. Frontend — `client/src/pages/TemplateLibrary.tsx`

Page at `/template-library`. Available to all authenticated users (view). Import requires admin.

**Layout:**
- Tabs across the top: All / Inductions / RAMS / Risk Assessments
- Industry filter chips below tabs: All / General / Construction / Manufacturing / Healthcare / Education / Logistics
- Search bar
- Grid of template cards. Each card shows:
  - Category badge (colour-coded)
  - Title
  - Description (2 lines max)
  - Industry tag
  - Regulatory basis pills (e.g. "CDM 2015", "MHSWR 1999")
  - Estimated customisation time
  - "Import" button

**Import flow:**
- Click Import → confirmation modal: "This will create a draft [induction/RAMS/RA] in your account based on this template. You can customise it before publishing."
- On confirm → call import endpoint → on success, show toast: "Imported. [Open to customise →]" with link to the new draft record.

---

## 6. Feature Flag

```typescript
featureTemplateLibrary: boolean('feature_template_library').default(true),
```

Migration:
```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_template_library BOOLEAN DEFAULT true`);
```

---

## Done When

- [ ] `library_templates` table exists in platform database
- [ ] Seed data: minimum 5 inductions, 5 RAMS, 5 risk assessments seeded on startup (idempotent)
- [ ] All seed entries have accurate UK regulatory basis references
- [ ] Browse/filter/search endpoints return correct results
- [ ] Import creates the correct record type in the customer's schema and returns redirect URL
- [ ] Imported records are marked as draft so customer must review before activating
- [ ] Template library page shows all three categories with filter and search
- [ ] Import confirmation modal and success toast with direct link to the new draft
- [ ] `featureTemplateLibrary` flag defaults to `true`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
