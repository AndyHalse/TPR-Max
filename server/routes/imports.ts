import type { Express } from 'express';
import { requireAuth } from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

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


// Load sample data for demos
app.post("/api/import/sample-data", requireAuth, async (req, res) => {
  try {
    if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
    const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
    const now = new Date();
    const batchId = Date.now(); // unique per call so repeated loads always add fresh records

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
    for (let i = 0; i < 10; i++) {
      try {
        await customerDb.insert(isolatedSchema.staff).values({
          firstName:   firstNames[i],
          lastName:    lastNames[i],
          email:       `demo.staff.${batchId}.${i}@example.com`,
          department:  departments[i],
          jobTitle:    staffJobTitles[i],
          employeeId:  `EMP-${batchId}-${String(i + 1).padStart(3, '0')}`,
          accessLevel: accessLevels[i],
          isActive:    true,
        });
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

    res.json({
      success: true,
      message: `Sample data loaded: ${staffAdded} staff, ${visitorsAdded} visitors, ${contractorsAdded} contractor companies (${workersAdded} workers), ${membersAdded} members`,
      results: { staffAdded, visitorsAdded, contractorsAdded, workersAdded, membersAdded },
    });
  } catch (error) {
    logger.error('Error loading sample data:', error);
    res.status(500).json({ error: 'Failed to load sample data', details: (error as any).message });
  }
});




}
