import type { Express } from 'express';
import { requireAuth } from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { DEFAULT_ONBOARDING_ITEMS } from './hrOnboarding';

export async function registerImportRoutes(app: Express): Promise<void> {
// ============================================================================
// IMPORT/EXPORT FEATURE - Staff, Visitors, and Contractors CSV/XLS Import
// ============================================================================

// Import multer for file uploads
const multerModule = await import('multer');
const { stringify } = await import('csv-stringify/sync');
const { parse } = await import('csv-parse/sync');

// Configure multer for file uploads (in-memory storage)
const upload = multerModule.default({ storage: multerModule.default.memoryStorage() });

// Template download endpoints - Generate CSV templates with all required fields
app.get("/api/import/template/staff", requireAuth, async (req, res) => {
  try {
    // Define staff template columns
    const columns = [
      'firstName',
      'lastName',
      'email',
      'department',
      'jobTitle',
      'employeeId',
      'biostarUserId',
      'paxtonUserId',
      'phoneNumber',
      'accessLevel',
      'password',
      'isActive'
    ];
    
    // Create sample row for guidance
    const sampleData = [[
      'John',
      'Doe',
      'john.doe@company.com',
      'Engineering',
      'Site Manager',
      'EMP001',
      '',
      '',
      '+44 7700 900000',
      'staff',
      '',
      'true'
    ]];
    
    const csv = stringify([columns, ...sampleData]);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=staff_import_template.csv');
    res.send(csv);
  } catch (error) {
    logger.error('Error generating staff template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

app.get("/api/import/template/visitors", requireAuth, async (req, res) => {
  try {
    const columns = [
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'mobileNumber',
      'company',
      'jobTitle',
      'address',
      'purpose',
      'carRegistration',
      'hostEmployeeId',
      'expectedDateTime',
      'expectedDepartureTime',
      'notes'
    ];
    
    const sampleData = [[
      'Jane',
      'Smith',
      'jane.smith@company.com',
      '01234567890',
      '07123456789',
      'Acme Corp',
      'Sales Manager',
      '123 Main St, London',
      'Business Meeting',
      'AB12 CDE',
      'EMP001',
      '2025-10-25 10:00',
      '2025-10-25 16:00',
      'Important client meeting'
    ]];
    
    const csv = stringify([columns, ...sampleData]);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=visitors_import_template.csv');
    res.send(csv);
  } catch (error) {
    logger.error('Error generating visitors template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

app.get("/api/import/template/contractors", requireAuth, async (req, res) => {
  try {
    const columns = [
      'companyName',
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'mobileNumber',
      'homeAddress',
      'postcode',
      'jobTitle',
      'department',
      'emergencyContactName',
      'emergencyContactPhone'
    ];
    
    const sampleData = [[
      'ABC Contractors Ltd',
      'Bob',
      'Builder',
      'bob@abccontractors.com',
      '01234567890',
      '07123456789',
      '456 Oak Ave, Manchester',
      'M1 1AA',
      'Site Supervisor',
      'Construction',
      'Mary Builder',
      '07987654321'
    ]];
    
    const csv = stringify([columns, ...sampleData]);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contractors_import_template.csv');
    res.send(csv);
  } catch (error) {
    logger.error('Error generating contractors template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Import endpoints - Upload and process CSV files
app.post("/api/import/staff", requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Parse CSV file
    const fileContent = req.file.buffer.toString('utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>
    };

    // Process each record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Validate and prepare staff data
        const staffData = {
          firstName: record.firstName?.trim(),
          lastName: record.lastName?.trim(),
          email: record.email?.trim()?.toLowerCase(),
          department: record.department?.trim(),
          jobTitle: record.jobTitle?.trim() || null,
          employeeId: record.employeeId?.trim(),
          biostarUserId: record.biostarUserId?.trim() || null,
          paxtonUserId: record.paxtonUserId?.trim() || null,
          phoneNumber: record.phoneNumber?.trim() || null,
          accessLevel: record.accessLevel?.trim() || 'staff',
          password: record.password?.trim() || null,
          isActive: record.isActive?.toLowerCase() === 'true' || record.isActive === '1' || true
        };

        // Validate required fields
        if (!staffData.firstName || !staffData.lastName || !staffData.email || !staffData.department || !staffData.employeeId) {
          throw new Error('Missing required fields: firstName, lastName, email, department, or employeeId');
        }

        // Insert into database
        await customerDb.insert(isolatedSchema.staff).values(staffData);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 2, // +2 because CSV has header row and is 1-indexed
          error: error.message,
          data: record
        });
      }
    }

    res.json({
      success: true,
      message: `Import complete: ${results.successful} successful, ${results.failed} failed`,
      results
    });
  } catch (error) {
    logger.error('Error importing staff:', error);
    res.status(500).json({ error: 'Failed to import staff', details: error.message });
  }
});

app.post("/api/import/visitors", requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Find host staff by employee ID if provided
        let hostStaffId = null;
        if (record.hostEmployeeId?.trim()) {
          const hostStaff = await customerDb
            .select({ id: isolatedSchema.staff.id })
            .from(isolatedSchema.staff)
            .where(eq(isolatedSchema.staff.employeeId, record.hostEmployeeId.trim()))
            .limit(1);
          hostStaffId = hostStaff[0]?.id || null;
        }

        // Generate QR code
        const qrCode = `VISITOR-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const visitorData = {
          firstName: record.firstName?.trim(),
          lastName: record.lastName?.trim(),
          email: record.email?.trim()?.toLowerCase() || null,
          phoneNumber: record.phoneNumber?.trim() || null,
          mobileNumber: record.mobileNumber?.trim() || null,
          company: record.company?.trim() || null,
          jobTitle: record.jobTitle?.trim() || null,
          address: record.address?.trim() || null,
          purpose: record.purpose?.trim() || null,
          carRegistration: record.carRegistration?.trim() || null,
          hostStaffId,
          expectedDateTime: record.expectedDateTime ? new Date(record.expectedDateTime) : null,
          expectedDepartureTime: record.expectedDepartureTime ? new Date(record.expectedDepartureTime) : null,
          notes: record.notes?.trim() || null,
          qrCode,
          isPreBooked: true,
          isCheckedIn: false
        };

        if (!visitorData.firstName || !visitorData.lastName) {
          throw new Error('Missing required fields: firstName or lastName');
        }

        await customerDb.insert(isolatedSchema.visitors).values(visitorData);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          error: error.message,
          data: record
        });
      }
    }

    res.json({
      success: true,
      message: `Import complete: ${results.successful} successful, ${results.failed} failed`,
      results
    });
  } catch (error) {
    logger.error('Error importing visitors:', error);
    res.status(500).json({ error: 'Failed to import visitors', details: error.message });
  }
});

app.post("/api/import/contractors", requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Find or create contractor company
        let companyId = null;
        if (record.companyName?.trim()) {
          const existingCompany = await customerDb
            .select({ id: isolatedSchema.contractorCompanies.id })
            .from(isolatedSchema.contractorCompanies)
            .where(eq(isolatedSchema.contractorCompanies.name, record.companyName.trim()))
            .limit(1);
          
          if (existingCompany.length > 0) {
            companyId = existingCompany[0].id;
          } else {
            // Create new company
            const newCompany = await customerDb
              .insert(isolatedSchema.contractorCompanies)
              .values({
                name: record.companyName.trim(),
                contactPerson: `${record.firstName} ${record.lastName}`.trim(),
                email: record.email?.trim() || null,
                phone: record.phoneNumber?.trim() || null
              })
              .returning({ id: isolatedSchema.contractorCompanies.id });
            companyId = newCompany[0].id;
          }
        }

        if (!companyId) {
          throw new Error('Company name is required');
        }

        const workerData = {
          companyId,
          firstName: record.firstName?.trim(),
          lastName: record.lastName?.trim(),
          email: record.email?.trim()?.toLowerCase() || null,
          phoneNumber: record.phoneNumber?.trim() || null,
          mobileNumber: record.mobileNumber?.trim() || null,
          homeAddress: record.homeAddress?.trim() || null,
          postcode: record.postcode?.trim() || null,
          jobTitle: record.jobTitle?.trim() || null,
          department: record.department?.trim() || null,
          emergencyContactName: record.emergencyContactName?.trim() || null,
          emergencyContactPhone: record.emergencyContactPhone?.trim() || null
        };

        if (!workerData.firstName || !workerData.lastName) {
          throw new Error('Missing required fields: firstName or lastName');
        }

        await customerDb.insert(isolatedSchema.contractorWorkers).values(workerData);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          error: error.message,
          data: record
        });
      }
    }

    res.json({
      success: true,
      message: `Import complete: ${results.successful} successful, ${results.failed} failed`,
      results
    });
  } catch (error) {
    logger.error('Error importing contractors:', error);
    res.status(500).json({ error: 'Failed to import contractors', details: error.message });
  }
});

// Members import template
app.get("/api/import/template/members", requireAuth, async (req, res) => {
  try {
    const columns = [
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'membershipType',
      'membershipId',
      'membershipNumber',
      'joinDate',
      'expiryDate',
      'membershipStatus',
      'notes'
    ];
    const sampleData = [[
      'Sarah',
      'Connor',
      'sarah.connor@example.com',
      '07123456789',
      'full',
      'MEM001',
      'MBR-2025-001',
      '2025-01-01',
      '2025-12-31',
      'active',
      'VIP member'
    ]];
    const csv = stringify([columns, ...sampleData]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=members_import_template.csv');
    res.send(csv);
  } catch (error) {
    logger.error('Error generating members template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Members import - upload and process CSV
app.post("/api/import/members", requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });

    const fileContent = req.file.buffer.toString('utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
    const results = { total: records.length, successful: 0, failed: 0, errors: [] as Array<{ row: number; error: string; data: any }> };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        if (!record.firstName?.trim() || !record.lastName?.trim()) {
          throw new Error('Missing required fields: firstName or lastName');
        }
        const qrCode = `MEMBER-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await customerDb.insert(isolatedSchema.members).values({
          firstName: record.firstName.trim(),
          lastName: record.lastName.trim(),
          email: record.email?.trim()?.toLowerCase() || null,
          phoneNumber: record.phoneNumber?.trim() || null,
          membershipType: record.membershipType?.trim() || 'full',
          membershipId: record.membershipId?.trim() || null,
          membershipNumber: record.membershipNumber?.trim() || null,
          joinDate: record.joinDate?.trim() || null,
          expiryDate: record.expiryDate?.trim() || null,
          membershipStatus: record.membershipStatus?.trim() || 'active',
          notes: record.notes?.trim() || null,
          qrCode,
          isCheckedIn: false,
          isActive: true
        });
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({ row: i + 2, error: error.message, data: record });
      }
    }

    res.json({ success: true, message: `Import complete: ${results.successful} successful, ${results.failed} failed`, results });
  } catch (error) {
    logger.error('Error importing members:', error);
    res.status(500).json({ error: 'Failed to import members', details: error.message });
  }
});


// Check whether sample data already exists
app.get("/api/import/sample-data-status", requireAuth, async (req, res) => {
  try {
    if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
    const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(req.customerId);
    const pool = (customerDb as any).$client ?? (customerDb as any).session?.client;
    const result = await pool.query(
      `SELECT COUNT(*)::int as count FROM "${schemaName}".staff WHERE email LIKE '%@example.com'`
    );
    const count = result.rows[0].count as number;
    res.json({ exists: count > 0, staffCount: count });
  } catch (error) {
    logger.error('Error checking sample data status:', error);
    res.status(500).json({ error: 'Failed to check sample data status' });
  }
});

// Load sample data for demos
app.post("/api/import/sample-data", requireAuth, async (req, res) => {
  try {
    if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);

    // ── Idempotency guard: block duplicate loads ──────────────────────────────
    const schemaNameCheck = CustomerDatabaseService.getInstance().generateSchemaName(req.customerId);
    const poolCheck = (customerDb as any).$client ?? (customerDb as any).session?.client;
    const existingCheck = await poolCheck.query(
      `SELECT COUNT(*)::int as count FROM "${schemaNameCheck}".staff WHERE email LIKE '%@example.com'`
    );
    if ((existingCheck.rows[0].count as number) > 0) {
      return res.status(409).json({
        error: 'Sample data already loaded. Use "Remove Sample Data" first before loading again.',
        existingCount: existingCheck.rows[0].count,
      });
    }

    const now = new Date();
    const batchId = Date.now();

    const firstNames = ['James', 'Emma', 'Oliver', 'Sophia', 'Harry', 'Amelia', 'Jack', 'Isabella', 'George', 'Mia', 'Thomas', 'Charlotte', 'William', 'Grace', 'Daniel'];
    const lastNames  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson', 'Harris', 'Clark', 'Lewis', 'Walker'];
    const departments = ['Engineering', 'Administration', 'Sales', 'Operations', 'Finance', 'HR', 'IT', 'Marketing', 'Logistics', 'Security'];
    const visitorCompanies = ['Acme Corp', 'BuildRight Ltd', 'TechFix Solutions', 'Prime Facilities', 'SafeWork UK', 'Delta Contractors', 'Apex Services', 'Horizon Group', 'Nexus Build', 'Swift Maintenance'];
    const memberTypes  = ['full', 'associate', 'honorary', 'student', 'corporate', 'full', 'associate', 'full', 'honorary', 'full'];
    const accessLevels = ['staff', 'staff', 'staff', 'staff', 'staff', 'staff', 'manager', 'supervisor', 'staff', 'staff'];
    const ukPhones = ['07700 900123', '07700 900456', '07700 900789', '07700 900321', '07700 900654',
                      '07700 900987', '07700 900111', '07700 900222', '07700 900333', '07700 900444',
                      '07700 900555', '07700 900666', '07700 900777', '07700 900888', '07700 900999'];

    let staffAdded = 0, visitorsAdded = 0, contractorsAdded = 0, workersAdded = 0, membersAdded = 0;

    // ── 10 sample staff ──────────────────────────────────────────────────────
    // email must be unique per row, so generate per-person addresses
    const staffJobTitles = ['Site Manager', 'Administrator', 'Sales Executive', 'Operations Manager',
                            'Finance Officer', 'HR Manager', 'IT Support', 'Marketing Manager',
                            'Logistics Coordinator', 'Security Officer'];
    const staffIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        const inserted = await customerDb.insert(isolatedSchema.staff).values({
          firstName:   firstNames[i],
          lastName:    lastNames[i],
          email:       `demo.staff.${batchId}.${i}@example.com`,
          department:  departments[i],
          jobTitle:    staffJobTitles[i],
          employeeId:  `EMP-${batchId}-${String(i + 1).padStart(3, '0')}`,
          accessLevel: accessLevels[i],
          isActive:    true,
        }).returning({ id: isolatedSchema.staff.id });
        if (inserted[0]?.id) staffIds.push(inserted[0].id);
        staffAdded++;
      } catch (e) { logger.warn('Sample staff insert failed:', (e as any).message); }
    }

    // ── 10 sample visitors (past visits, not currently on-site) ──────────────
    for (let i = 0; i < 10; i++) {
      try {
        const pastDate    = new Date(now.getTime() - (7 + i) * 24 * 60 * 60 * 1000);
        const pastCheckout = new Date(pastDate.getTime() + 2 * 60 * 60 * 1000);
        await customerDb.insert(isolatedSchema.visitors).values({
          firstName:    firstNames[(i + 3) % firstNames.length],
          lastName:     lastNames[(i + 5) % lastNames.length],
          email:        `demo.visitor.${batchId}.${i}@example.com`,
          company:      visitorCompanies[i % visitorCompanies.length],
          jobTitle:     'Representative',
          purpose:      'Demo Visit',
          qrCode:       `VISITOR-DEMO-${batchId}-${i}`,
          isPreBooked:  false,
          isCheckedIn:  false,
          checkedInAt:  pastDate,
          checkedOutAt: pastCheckout,
          checkoutType: 'manual-reset',
        });
        visitorsAdded++;
      } catch (e) { logger.warn('Sample visitor insert failed:', (e as any).message); }
    }

    // ── 5 contractor companies, each with 3–6 workers ────────────────────────
    const contractorCompanyData = [
      { name: 'BuildRight Contractors Ltd',   firstName: 'Bob',   lastName: 'Builder',  phone: '01234 567890' },
      { name: 'SafeWork Facilities UK',        firstName: 'Sarah', lastName: 'Safe',     phone: '01234 567891' },
      { name: 'Delta Technical Services',      firstName: 'David', lastName: 'Delta',    phone: '01234 567892' },
      { name: 'Apex Maintenance Group',        firstName: 'Alice', lastName: 'Apex',     phone: '01234 567893' },
      { name: 'Horizon Build & Civil',         firstName: 'Henry', lastName: 'Horizon',  phone: '01234 567894' },
    ];
    const workerJobTitles = [
      'Site Engineer', 'Electrician', 'Plumber', 'HVAC Technician', 'Health & Safety Officer',
      'Project Manager', 'Scaffolder', 'Welder', 'Carpenter', 'Painter & Decorator',
      'Structural Engineer', 'Forklift Operator', 'Mechanical Fitter', 'Site Supervisor', 'Labourer',
    ];
    const rightToWorkStatuses = ['valid', 'valid', 'valid', 'pending', 'valid'];
    const cscsStatuses        = ['valid', 'valid', 'pending', 'valid', 'none'];
    let workerSeq = 0;

    for (let c = 0; c < contractorCompanyData.length; c++) {
      try {
        const co = contractorCompanyData[c];
        let companyId: string;

        const existing = await customerDb
          .select({ id: isolatedSchema.contractorCompanies.id })
          .from(isolatedSchema.contractorCompanies)
          .where(eq(isolatedSchema.contractorCompanies.companyName, co.name))
          .limit(1);

        if (existing.length > 0) {
          companyId = existing[0].id;
        } else {
          const newCo = await customerDb
            .insert(isolatedSchema.contractorCompanies)
            .values({
              companyName:      co.name,
              contactEmail:     `demo.company.${batchId}.${c}@example.com`,
              contactPhone:     co.phone,
              contactFirstName: co.firstName,
              contactLastName:  co.lastName,
            })
            .returning({ id: isolatedSchema.contractorCompanies.id });
          companyId = newCo[0].id;
        }
        contractorsAdded++;

        // Add 3–5 workers per company
        const workerCount = 3 + (c % 3);
        for (let w = 0; w < workerCount; w++) {
          try {
            const seq   = workerSeq++;
            const fnIdx = seq % firstNames.length;
            const lnIdx = (seq + 4) % lastNames.length;
            const jobIdx = seq % workerJobTitles.length;
            await customerDb.insert(isolatedSchema.contractorWorkers).values({
              companyId,
              firstName:   firstNames[fnIdx],
              lastName:    lastNames[lnIdx],
              email:       `demo.worker.${batchId}.${seq}@example.com`,
              phoneNumber: ukPhones[seq % ukPhones.length],
              jobTitle:    workerJobTitles[jobIdx],
              department:  departments[seq % departments.length],
              rightToWork: rightToWorkStatuses[c],
              cscsStatus:  cscsStatuses[c],
              postcode:    `EC${1 + (seq % 4)}V ${seq % 9}BB`,
              transportMethod: ['car_diesel', 'car_petrol', 'public_transport', 'bicycle', 'walking'][seq % 5],
              isActive:    true,
            });
            workersAdded++;
          } catch (e) { logger.warn('Sample worker insert failed:', (e as any).message); }
        }
      } catch (e) { logger.warn('Sample contractor company insert failed:', (e as any).message); }
    }

    // ── 10 sample members ────────────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
      try {
        await customerDb.insert(isolatedSchema.members).values({
          firstName:        firstNames[(i + 2) % firstNames.length],
          lastName:         lastNames[(i + 7) % lastNames.length],
          email:            `demo.member.${batchId}.${i}@example.com`,
          membershipType:   memberTypes[i],
          membershipId:     `MEM-${batchId}-${i}`,
          membershipNumber: `MBR-${batchId}-${i}`,
          joinDate:         `${now.getFullYear()}-01-01`,
          expiryDate:       `${now.getFullYear()}-12-31`,
          membershipStatus: 'active',
          qrCode:           `MEMBER-DEMO-${batchId}-${i}`,
          isCheckedIn:      false,
          isActive:         true,
        });
        membersAdded++;
      } catch (e) { logger.warn('Sample member insert failed:', (e as any).message); }
    }

    // ── HR data (all wrapped in individual try/catch — graceful if tables don't exist) ──
    if (staffIds.length > 0) {
      const hrDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(req.customerId);
      const pool = (hrDb as any).$client ?? (hrDb as any).session?.client;

      // 1. Right to Work
      try {
        // [docType, yearsValid | null, daysOffset | null] — negative daysOffset = expired
        const rtwScenarios: Array<[string, number | null, number | null]> = [
          ['passport', 2, null],
          ['passport', 3, null],
          ['passport', 4, null],
          ['passport', 5, null],
          ['passport', 3, null],
          ['passport', 4, null],
          ['passport', null, 45],
          ['passport', null, 20],
          ['passport', null, -30],
          ['british_passport', null, null],
        ];
        for (let i = 0; i < staffIds.length; i++) {
          const [docType, years, days] = rtwScenarios[i];
          const expirySQL = years !== null
            ? `NOW() + INTERVAL '${years} years'`
            : days === null ? 'NULL'
            : days >= 0 ? `NOW() + INTERVAL '${days} days'`
            : `NOW() - INTERVAL '${Math.abs(days)} days'`;
          await pool.query(
            `INSERT INTO "${schemaName}".right_to_work
               (staff_id, document_type, document_reference, issue_date, expiry_date, verified_date, verified_by, verification_method, is_current)
             VALUES ($1, $2, $3, NOW() - INTERVAL '6 months', ${expirySQL}, NOW() - INTERVAL '6 months', 'HR Manager', 'manual', TRUE)`,
            [staffIds[i], docType, `DEMO-RTW-${batchId}-${i}`]
          );
        }
      } catch (e) { logger.warn('Sample HR: right_to_work failed', (e as any).message); }

      // 2. DBS Certificates
      try {
        const dbsData: Array<[string, number | null, number | null]> = [
          ['enhanced_with_barred_lists', 3, null],
          ['enhanced', 2, null],
          ['standard', 1, null],
          ['enhanced', null, 60],
          ['enhanced_with_barred_lists', null, 15],
          ['basic', 1, null],
          ['enhanced', 2, null],
          ['basic', 3, null],
          ['enhanced', 4, null],
          ['enhanced', 2, null],
        ];
        for (let i = 0; i < staffIds.length; i++) {
          const [level, years, days] = dbsData[i];
          const expirySQL = years !== null
            ? `NOW() + INTERVAL '${years} years'`
            : `NOW() + INTERVAL '${days} days'`;
          await pool.query(
            `INSERT INTO "${schemaName}".staff_dbs
               (staff_id, dbs_level, certificate_number, issue_date, policy_expiry_date, verified_by, verified_date, is_current)
             VALUES ($1, $2, $3, NOW() - INTERVAL '1 year', ${expirySQL}, 'HR Manager', NOW() - INTERVAL '1 year', TRUE)`,
            [staffIds[i], level, `DEMO-DBS-${batchId}-${i}`]
          );
        }
      } catch (e) { logger.warn('Sample HR: staff_dbs failed', (e as any).message); }

      // 3. Leave Requests (15 entries across the 10 staff)
      try {
        const leaveData: Array<{ si: number; type: string; sOff: number; days: number; status: string }> = [
          { si: 0, type: 'annual',        sOff: -60,  days: 5,  status: 'approved' },
          { si: 1, type: 'annual',        sOff: -45,  days: 3,  status: 'approved' },
          { si: 2, type: 'annual',        sOff: -30,  days: 10, status: 'approved' },
          { si: 3, type: 'annual',        sOff: -20,  days: 2,  status: 'approved' },
          { si: 4, type: 'annual',        sOff: -14,  days: 5,  status: 'approved' },
          { si: 0, type: 'annual',        sOff: 14,   days: 5,  status: 'approved' },
          { si: 5, type: 'annual',        sOff: 28,   days: 3,  status: 'approved' },
          { si: 6, type: 'annual',        sOff: 56,   days: 5,  status: 'approved' },
          { si: 7, type: 'annual',        sOff: 21,   days: 3,  status: 'pending'  },
          { si: 8, type: 'annual',        sOff: 35,   days: 5,  status: 'pending'  },
          { si: 2, type: 'sick',          sOff: -10,  days: 2,  status: 'approved' },
          { si: 3, type: 'sick',          sOff: -25,  days: 1,  status: 'approved' },
          { si: 4, type: 'parental',      sOff: -90,  days: 10, status: 'approved' },
          { si: 5, type: 'parental',      sOff: -120, days: 5,  status: 'approved' },
          { si: 1, type: 'compassionate', sOff: -40,  days: 3,  status: 'approved' },
        ];
        for (const l of leaveData) {
          if (!staffIds[l.si]) continue;
          const ss = l.sOff >= 0 ? '+' : '-';
          const sa = Math.abs(l.sOff);
          const ea = Math.abs(l.sOff) + l.days - 1;
          await pool.query(
            `INSERT INTO "${schemaName}".leave_requests
               (staff_id, leave_type, start_date, end_date, days_taken, status, reason)
             VALUES ($1, $2, (NOW() ${ss} INTERVAL '${sa} days')::date, (NOW() ${ss} INTERVAL '${ea} days')::date, $3, $4, 'Sample leave request')`,
            [staffIds[l.si], l.type, l.days, l.status]
          );
        }
      } catch (e) { logger.warn('Sample HR: leave_requests failed', (e as any).message); }

      // 4. Absence Records (Bradford Factor scenarios)
      try {
        const absenceData: Array<{ si: number; offsets: number[]; days: number; reason: string }> = [
          { si: 0, offsets: [-120, -90, -45],                    days: 1, reason: 'Cold / Flu' },       // Bradford 27
          { si: 1, offsets: [-100, -60],                          days: 2, reason: 'Stomach complaint' },// Bradford 16
          { si: 2, offsets: [-180, -150, -120, -90, -45],         days: 1, reason: 'Cold / Flu' },       // Bradford 125
          { si: 3, offsets: [-50],                                days: 5, reason: 'Back injury' },       // Bradford 5
          { si: 4, offsets: [-330, -280, -240, -200, -160, -120], days: 1, reason: 'Cold / Flu' },       // Bradford 216
          { si: 5, offsets: [-30],                                days: 2, reason: 'Migraine' },
        ];
        for (const a of absenceData) {
          if (!staffIds[a.si]) continue;
          for (const offset of a.offsets) {
            const abs = Math.abs(offset);
            await pool.query(
              `INSERT INTO "${schemaName}".absence_records
                 (staff_id, absence_type, start_date, return_date, days_lost, reason)
               VALUES ($1, 'sickness', (NOW() - INTERVAL '${abs} days')::date, (NOW() - INTERVAL '${abs - a.days} days')::date, $2, $3)`,
              [staffIds[a.si], a.days, a.reason]
            );
          }
        }
      } catch (e) { logger.warn('Sample HR: absence_records failed', (e as any).message); }

      // 5. Training Requirements + Staff Training Records
      const trainingCourseNames: string[] = [];
      const trainingDefs = [
        { name: 'Fire Safety Awareness',     freq: 12 },
        { name: 'Manual Handling',           freq: 36 },
        { name: 'Health & Safety Induction', freq: 0  },
        { name: 'GDPR Data Protection',      freq: 24 },
        { name: 'First Aid Awareness',       freq: 36 },
      ];
      try {
        for (const tr of trainingDefs) {
          try {
            await pool.query(
              `INSERT INTO "${schemaName}".training_requirements (course_name, renewal_period_months)
               VALUES ($1, $2)`,
              [tr.name, tr.freq]
            );
          } catch { /* already exists — skip */ }
          trainingCourseNames.push(tr.name);
        }
      } catch (e) { logger.warn('Sample HR: training_requirements failed', (e as any).message); }

      if (trainingCourseNames.length === 5) {
        try {
          // Staff 0–3: all 5 courses completed
          for (let i = 0; i < 4 && i < staffIds.length; i++) {
            for (let t = 0; t < 5; t++) {
              await pool.query(
                `INSERT INTO "${schemaName}".staff_training_records
                   (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory)
                 VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '6 months')::date, (NOW() + INTERVAL '6 months')::date, TRUE)`,
                [staffIds[i], trainingCourseNames[t]]
              );
            }
          }
          // Staff 4: Fire Safety expired (completed 14 months ago), rest current
          if (staffIds[4]) {
            await pool.query(
              `INSERT INTO "${schemaName}".staff_training_records
                 (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory)
               VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '14 months')::date, (NOW() - INTERVAL '2 months')::date, TRUE)`,
              [staffIds[4], trainingCourseNames[0]]
            );
            for (let t = 1; t < 5; t++) {
              await pool.query(
                `INSERT INTO "${schemaName}".staff_training_records
                   (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory)
                 VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '6 months')::date, (NOW() + INTERVAL '6 months')::date, TRUE)`,
                [staffIds[4], trainingCourseNames[t]]
              );
            }
          }
          // Staff 5: Manual Handling + GDPR only
          if (staffIds[5]) {
            for (const t of [1, 3]) {
              await pool.query(
                `INSERT INTO "${schemaName}".staff_training_records
                   (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory)
                 VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '6 months')::date, (NOW() + INTERVAL '6 months')::date, TRUE)`,
                [staffIds[5], trainingCourseNames[t]]
              );
            }
          }
          // Staff 6–9: Health & Safety Induction only (no expiry)
          for (let i = 6; i < staffIds.length; i++) {
            await pool.query(
              `INSERT INTO "${schemaName}".staff_training_records
                 (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory)
               VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '3 months')::date, NULL, TRUE)`,
              [staffIds[i], trainingCourseNames[2]]
            );
          }
        } catch (e) { logger.warn('Sample HR: staff_training_records failed', (e as any).message); }
      }

      // 6. Appraisals
      try {
        const appraisalData = [
          { si: 0, dOff: -180, nOff: 180,  status: 'completed',  rating: 'good',         reviewer: 'HR Manager'   },
          { si: 1, dOff: -330, nOff: 30,   status: 'completed',  rating: 'excellent',     reviewer: 'Line Manager' },
          { si: 2, dOff: 14,   nOff: 14,   status: 'scheduled',  rating: null,            reviewer: 'HR Manager'   },
          { si: 3, dOff: -365, nOff: -30,  status: 'completed',  rating: 'good',          reviewer: 'Line Manager' },
          { si: 4, dOff: -365, nOff: -30,  status: 'completed',  rating: 'satisfactory',  reviewer: 'HR Manager'   },
        ];
        for (const a of appraisalData) {
          if (!staffIds[a.si]) continue;
          const ds = a.dOff >= 0 ? '+' : '-';
          const da = Math.abs(a.dOff);
          const ns = a.nOff >= 0 ? '+' : '-';
          const na = Math.abs(a.nOff);
          await pool.query(
            `INSERT INTO "${schemaName}".staff_appraisals
               (staff_id, appraisal_date, next_review_date, reviewer, status, overall_rating, notes)
             VALUES ($1, NOW() ${ds} INTERVAL '${da} days', NOW() ${ns} INTERVAL '${na} days', $2, $3, $4, 'Sample appraisal record')`,
            [staffIds[a.si], a.reviewer, a.status, a.rating]
          );
        }
      } catch (e) { logger.warn('Sample HR: staff_appraisals failed', (e as any).message); }

      // 7. Onboarding checklist for staff[9] (newest starter)
      if (staffIds[9]) {
        try {
          await pool.query(
            `INSERT INTO "${schemaName}".onboarding_checklists (staff_id) VALUES ($1)`,
            [staffIds[9]]
          );
        } catch (e) { logger.warn('Sample HR: onboarding failed', (e as any).message); }
      }

      // 8. Leaver process for staff[8]
      if (staffIds[8]) {
        try {
          await pool.query(
            `UPDATE "${schemaName}".staff
             SET employment_status = 'leaver', contract_end_date = NOW() - INTERVAL '30 days', is_active = FALSE
             WHERE id = $1`,
            [staffIds[8]]
          );
          await pool.query(
            `INSERT INTO "${schemaName}".leaver_checklists (staff_id, last_day, reason, is_voluntary, completed_at)
             VALUES ($1, (NOW() - INTERVAL '30 days')::date, 'resignation', TRUE, NOW() - INTERVAL '28 days')`,
            [staffIds[8]]
          );
        } catch (e) { logger.warn('Sample HR: leaver failed', (e as any).message); }
      }

      // 9. Staff Documents (2 per staff member)
      try {
        for (let i = 0; i < staffIds.length; i++) {
          await pool.query(
            `INSERT INTO "${schemaName}".staff_documents
               (staff_id, document_type, title, file_url, file_name, is_confidential, uploaded_by, notes)
             VALUES ($1, 'contract', 'Employment Contract', '#', 'employment_contract.pdf', TRUE, 'HR Manager', 'Sample document — uploaded for demonstration purposes')`,
            [staffIds[i]]
          );
          await pool.query(
            `INSERT INTO "${schemaName}".staff_documents
               (staff_id, document_type, title, file_url, file_name, is_confidential, uploaded_by, notes)
             VALUES ($1, 'right_to_work', 'Passport Copy', '#', 'passport_copy.pdf', TRUE, 'HR Manager', 'Sample document — uploaded for demonstration purposes')`,
            [staffIds[i]]
          );
        }
      } catch (e) { logger.warn('Sample HR: staff_documents failed', (e as any).message); }
    }

    res.json({
      success: true,
      message: `Sample data loaded: ${staffAdded} staff, ${visitorsAdded} visitors, ${contractorsAdded} contractor companies (${workersAdded} workers), ${membersAdded} members — plus HR records: RTW, DBS, leave, absence, training, appraisals, onboarding, leaver, and documents`,
      results: { staffAdded, visitorsAdded, contractorsAdded, workersAdded, membersAdded, hrDataAdded: staffIds.length > 0 },
    });
  } catch (error) {
    logger.error('Error loading sample data:', error);
    res.status(500).json({ error: 'Failed to load sample data', details: (error as any).message });
  }
});

  // ── Clear sample data ──────────────────────────────────────────────────────
  app.post("/api/import/clear-sample-data", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const customerDb2 = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(req.customerId);
      const pool = (customerDb2 as any).$client ?? (customerDb2 as any).session?.client;

      const sampleStaffResult = await pool.query(
        `SELECT id FROM "${schemaName}".staff WHERE email LIKE '%@example.com'`
      );
      const sampleStaffIds = sampleStaffResult.rows.map((r: any) => r.id);

      let deleted: Record<string, number> = {};

      if (sampleStaffIds.length > 0) {
        const idList = sampleStaffIds.map((_: any, i: number) => `$${i + 1}`).join(',');

        // HR tables — delete by staff_id
        const hrTables = [
          'right_to_work', 'staff_dbs', 'leave_requests', 'absence_records',
          'staff_training_records', 'staff_documents',
        ];
        for (const table of hrTables) {
          try {
            const r = await pool.query(`DELETE FROM "${schemaName}".${table} WHERE staff_id IN (${idList})`, sampleStaffIds);
            deleted[table] = r.rowCount;
          } catch (e) { logger.warn(`Clear sample data: could not delete from ${table}`, (e as any).message); }
        }

        // Onboarding checklists
        try {
          const r = await pool.query(`DELETE FROM "${schemaName}".onboarding_checklists WHERE staff_id IN (${idList})`, sampleStaffIds);
          deleted['onboarding'] = r.rowCount ?? 0;
        } catch (e) { logger.warn('Clear sample data: onboarding error', (e as any).message); }

        // Leaver checklists
        try {
          const r = await pool.query(`DELETE FROM "${schemaName}".leaver_checklists WHERE staff_id IN (${idList})`, sampleStaffIds);
          deleted['leavers'] = r.rowCount ?? 0;
        } catch (e) { logger.warn('Clear sample data: leaver error', (e as any).message); }

        // Restore any leavers to active before deleting staff row
        await pool.query(
          `UPDATE "${schemaName}".staff SET employment_status = 'active', is_active = TRUE, contract_end_date = NULL WHERE id IN (${idList})`,
          sampleStaffIds
        );
      }

      // Core tables by @example.com email
      for (const { table, col } of [
        { table: 'visitors', col: 'email' },
        { table: 'contractor_workers', col: 'email' },
        { table: 'members', col: 'email' },
      ]) {
        try {
          const r = await pool.query(`DELETE FROM "${schemaName}".${table} WHERE ${col} LIKE '%@example.com'`);
          deleted[table] = r.rowCount;
        } catch (e) { logger.warn(`Clear sample data: could not delete from ${table}`, (e as any).message); }
      }

      // Contractor companies by contact_email
      try {
        const companiesResult = await pool.query(
          `SELECT id FROM "${schemaName}".contractor_companies WHERE contact_email LIKE '%@example.com'`
        );
        const companyIds = companiesResult.rows.map((r: any) => r.id);
        if (companyIds.length > 0) {
          const cIdList = companyIds.map((_: any, i: number) => `$${i + 1}`).join(',');
          await pool.query(`DELETE FROM "${schemaName}".contractor_companies WHERE id IN (${cIdList})`, companyIds);
          deleted['contractor_companies'] = companyIds.length;
        }
      } catch (e) { logger.warn('Clear sample data: contractor companies error', (e as any).message); }

      // Finally delete sample staff
      if (sampleStaffIds.length > 0) {
        const idList = sampleStaffIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        const r = await pool.query(`DELETE FROM "${schemaName}".staff WHERE id IN (${idList})`, sampleStaffIds);
        deleted['staff'] = r.rowCount;
      }

      res.json({ success: true, message: 'Sample data cleared successfully', deleted });
    } catch (error) {
      logger.error('Error clearing sample data:', error);
      res.status(500).json({ error: 'Failed to clear sample data', details: (error as any).message });
    }
  });

}
