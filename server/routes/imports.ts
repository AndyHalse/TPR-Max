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
      `SELECT
        (SELECT COUNT(*)::int FROM "${schemaName}".staff               WHERE email         LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".visitors             WHERE email         LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".contractor_workers   WHERE email         LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".contractor_companies WHERE contact_email LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".members              WHERE email         LIKE '%@example.com')
       AS total`
    );
    const total = result.rows[0].total as number;
    res.json({ exists: total > 0, totalCount: total });
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
    const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(req.customerId);
    const pool = (customerDb as any).$client ?? (customerDb as any).session?.client;

    // ── Idempotency guard: block duplicate loads ──────────────────────────────
    const existingCheck = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM "${schemaName}".staff               WHERE email         LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".visitors             WHERE email         LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".contractor_workers   WHERE email         LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".contractor_companies WHERE contact_email LIKE '%@example.com') +
        (SELECT COUNT(*)::int FROM "${schemaName}".members              WHERE email         LIKE '%@example.com')
       AS total`
    );
    if ((existingCheck.rows[0].total as number) > 0) {
      return res.status(409).json({
        error: 'Sample data already loaded. Use "Remove Sample Data" first before loading again.',
        existingCount: existingCheck.rows[0].total,
      });
    }

    const now = new Date();
    const batchId = Date.now();

    const firstNames = ['James', 'Emma', 'Oliver', 'Sophia', 'Harry', 'Amelia', 'Jack', 'Isabella', 'George', 'Mia', 'Thomas', 'Charlotte', 'William', 'Grace', 'Daniel'];
    const lastNames  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson', 'Harris', 'Clark', 'Lewis', 'Walker'];
    const departments = ['Engineering', 'Administration', 'Sales', 'Operations', 'Finance', 'HR', 'IT', 'Marketing', 'Logistics', 'Security'];
    const visitorCompanies = ['Acme Corp', 'BuildRight Ltd', 'TechFix Solutions', 'Prime Facilities', 'SafeWork UK', 'Delta Contractors', 'Apex Services', 'Horizon Group', 'Nexus Build', 'Swift Maintenance', 'InsureCo Ltd', 'BakerConsulting', 'CityCouncil', 'HealthSafe UK', 'DataTrust Ltd'];
    const memberTypes  = ['full', 'associate', 'honorary', 'student', 'corporate', 'full', 'associate', 'full', 'honorary', 'full'];
    const ukPhones = ['07700 900123', '07700 900456', '07700 900789', '07700 900321', '07700 900654',
                      '07700 900987', '07700 900111', '07700 900222', '07700 900333', '07700 900444',
                      '07700 900555', '07700 900666', '07700 900777', '07700 900888', '07700 900999'];

    let staffAdded = 0, visitorsAdded = 0, contractorsAdded = 0, workersAdded = 0, membersAdded = 0;

    // ── 30 sample staff with full org hierarchy ──────────────────────────────
    // mgr = index into this array of the person's line manager (null = no manager)
    const sampleStaffDefs: Array<{ firstName: string; lastName: string; dept: string; title: string; lvl: string; mgr: number | null }> = [
      // Tier 1: C-Suite (index 0–1)
      { firstName: 'Richard',  lastName: 'Blackwood',  dept: 'Executive',        title: 'Chief Executive Officer',      lvl: 'admin',      mgr: null },
      { firstName: 'Sarah',    lastName: 'Pemberton',  dept: 'Executive',        title: 'Managing Director',            lvl: 'admin',      mgr: 0    },
      // Tier 2: Directors (index 2–7)
      { firstName: 'Caroline', lastName: 'Hughes',     dept: 'Finance',          title: 'Finance Director',             lvl: 'manager',    mgr: 0    },
      { firstName: 'Ben',      lastName: 'Ashworth',   dept: 'IT',               title: 'IT Director',                  lvl: 'manager',    mgr: 0    },
      { firstName: 'Marcus',   lastName: 'Webb',       dept: 'Operations',       title: 'Operations Director',          lvl: 'manager',    mgr: 1    },
      { firstName: 'David',    lastName: 'Thornton',   dept: 'HR',               title: 'HR Director',                  lvl: 'manager',    mgr: 1    },
      { firstName: 'Rachel',   lastName: 'Forsythe',   dept: 'Sales',            title: 'Sales Director',               lvl: 'manager',    mgr: 1    },
      { firstName: 'Olivia',   lastName: 'Marsh',      dept: 'Legal',            title: 'Legal Counsel',                lvl: 'manager',    mgr: 0    },
      // Tier 3: Managers (index 8–19)
      { firstName: 'James',    lastName: 'Fletcher',   dept: 'Operations',       title: 'Operations Manager',           lvl: 'manager',    mgr: 4    },
      { firstName: 'Louise',   lastName: 'Grant',      dept: 'Facilities',       title: 'Facilities Manager',           lvl: 'manager',    mgr: 4    },
      { firstName: 'Natalie',  lastName: 'Simmons',    dept: 'HR',               title: 'HR Manager',                   lvl: 'manager',    mgr: 5    },
      { firstName: 'Paul',     lastName: 'Hennessey',  dept: 'Sales',            title: 'Sales Manager',                lvl: 'manager',    mgr: 6    },
      { firstName: 'Gemma',    lastName: 'Lawson',     dept: 'Sales',            title: 'Sales Manager',                lvl: 'manager',    mgr: 6    },
      { firstName: 'Sophie',   lastName: 'Ainsworth',  dept: 'Marketing',        title: 'Marketing Manager',            lvl: 'manager',    mgr: 6    },
      { firstName: 'Tom',      lastName: 'Whitfield',  dept: 'Finance',          title: 'Finance Manager',              lvl: 'manager',    mgr: 2    },
      { firstName: 'Chris',    lastName: 'Patel',      dept: 'IT',               title: 'IT Manager',                   lvl: 'manager',    mgr: 3    },
      { firstName: 'Diane',    lastName: 'Eastwood',   dept: 'Administration',   title: 'Office Manager',               lvl: 'manager',    mgr: 1    },
      { firstName: 'Neil',     lastName: 'Baxter',     dept: 'Health & Safety',  title: 'Health & Safety Manager',      lvl: 'manager',    mgr: 4    },
      { firstName: 'Fiona',    lastName: 'Walsh',      dept: 'Procurement',      title: 'Procurement Manager',          lvl: 'manager',    mgr: 4    },
      { firstName: 'Stuart',   lastName: 'Nolan',      dept: 'Quality',          title: 'Quality Manager',              lvl: 'manager',    mgr: 4    },
      // Tier 4: Supervisors / Senior Staff (index 20–31)
      { firstName: 'Daniel',   lastName: 'Moss',       dept: 'Engineering',      title: 'Senior Engineer',              lvl: 'supervisor', mgr: 8    },
      { firstName: 'Becky',    lastName: 'Crane',      dept: 'Facilities',       title: 'Facilities Supervisor',        lvl: 'supervisor', mgr: 9    },
      { firstName: 'Priya',    lastName: 'Singh',      dept: 'HR',               title: 'HR Business Partner',          lvl: 'staff',      mgr: 10   },
      { firstName: 'Kyle',     lastName: 'Donovan',    dept: 'Sales',            title: 'Senior Sales Executive',       lvl: 'supervisor', mgr: 11   },
      { firstName: 'Lucy',     lastName: 'Chapman',    dept: 'Sales',            title: 'Account Executive',            lvl: 'staff',      mgr: 12   },
      { firstName: 'Amy',      lastName: 'Blackwood',  dept: 'Marketing',        title: 'Marketing Coordinator',        lvl: 'staff',      mgr: 13   },
      { firstName: 'Aaron',    lastName: 'Sherwood',   dept: 'Finance',          title: 'Finance Analyst',              lvl: 'supervisor', mgr: 14   },
      { firstName: 'Raj',      lastName: 'Kapoor',     dept: 'IT',               title: 'IT Support Lead',              lvl: 'supervisor', mgr: 15   },
      { firstName: 'Matt',     lastName: 'Collins',    dept: 'Administration',   title: 'Executive Assistant',          lvl: 'staff',      mgr: 16   },
      { firstName: 'Ingrid',   lastName: 'Holm',       dept: 'Health & Safety',  title: 'Health & Safety Advisor',      lvl: 'staff',      mgr: 17   },
      { firstName: 'Patrick',  lastName: 'Reid',       dept: 'Procurement',      title: 'Procurement Manager',          lvl: 'staff',      mgr: 18   },
      { firstName: 'Yasmin',   lastName: 'Okafor',     dept: 'Legal',            title: 'Compliance Officer',           lvl: 'staff',      mgr: 7    },
      // Tier 5: Staff (index 32–41)
      { firstName: 'Owen',     lastName: 'Clarke',     dept: 'Engineering',      title: 'Mechanical Engineer',          lvl: 'staff',      mgr: 20   },
      { firstName: 'Hannah',   lastName: 'Foster',     dept: 'IT',               title: 'Data Analyst',                 lvl: 'staff',      mgr: 27   },
      { firstName: 'Liam',     lastName: 'Porter',     dept: 'Sales',            title: 'Sales Executive',              lvl: 'staff',      mgr: 23   },
      { firstName: 'Ella',     lastName: 'Whitmore',   dept: 'Finance',          title: 'Payroll Administrator',        lvl: 'staff',      mgr: 26   },
      { firstName: 'Josh',     lastName: 'Neville',    dept: 'IT',               title: 'IT Technician',                lvl: 'staff',      mgr: 27   },
      { firstName: 'Zoe',      lastName: 'Harrison',   dept: 'Sales',            title: 'Sales Executive',              lvl: 'staff',      mgr: 12   },
      { firstName: 'Connor',   lastName: 'McBride',    dept: 'Administration',   title: 'Receptionist',                 lvl: 'staff',      mgr: 28   },
      { firstName: 'Katie',    lastName: 'Lawton',     dept: 'Quality',          title: 'Quality Assurance Engineer',   lvl: 'staff',      mgr: 19   },
      { firstName: 'Darren',   lastName: 'Shah',       dept: 'Engineering',      title: 'Electrical Engineer',          lvl: 'staff',      mgr: 20   },
      { firstName: 'Nina',     lastName: 'Obi',        dept: 'HR',               title: 'HR Coordinator',               lvl: 'staff',      mgr: 22   },
    ];
    const staffIds: string[] = [];
    for (let i = 0; i < sampleStaffDefs.length; i++) {
      try {
        const s = sampleStaffDefs[i];
        const inserted = await customerDb.insert(isolatedSchema.staff).values({
          firstName:   s.firstName,
          lastName:    s.lastName,
          email:       `demo.staff.${batchId}.${i}@example.com`,
          department:  s.dept,
          jobTitle:    s.title,
          employeeId:  `EMP-${batchId}-${String(i + 1).padStart(3, '0')}`,
          accessLevel: s.lvl,
          isActive:    true,
          phoneNumber: ukPhones[i % ukPhones.length],
        }).returning({ id: isolatedSchema.staff.id });
        if (inserted[0]?.id) staffIds.push(inserted[0].id);
        staffAdded++;
      } catch (e) { logger.warn('Sample staff insert failed:', (e as any).message); }
    }
    // Wire up the reporting structure now that all IDs are known
    try {
      for (let i = 0; i < sampleStaffDefs.length; i++) {
        const mgrIdx = sampleStaffDefs[i].mgr;
        if (mgrIdx !== null && staffIds[i] && staffIds[mgrIdx]) {
          await pool.query(
            `UPDATE "${schemaName}".staff SET line_manager_id = $1 WHERE id = $2`,
            [staffIds[mgrIdx], staffIds[i]]
          );
        }
      }
    } catch (e) { logger.warn('Sample staff: reporting structure failed', (e as any).message); }

    // ── 15 sample visitors ── mix of past visits + pre-bookings ──────────────
    const visitorIds: string[] = [];
    const visitorScenarios = [
      // past visitors (checked in and out)
      { daysAgo: 7,  hoursStay: 2,  prebooked: false },
      { daysAgo: 14, hoursStay: 3,  prebooked: false },
      { daysAgo: 21, hoursStay: 1,  prebooked: false },
      { daysAgo: 30, hoursStay: 4,  prebooked: false },
      { daysAgo: 45, hoursStay: 2,  prebooked: false },
      { daysAgo: 60, hoursStay: 3,  prebooked: false },
      { daysAgo: 5,  hoursStay: 2,  prebooked: false },
      { daysAgo: 10, hoursStay: 1,  prebooked: false },
      { daysAgo: 3,  hoursStay: 5,  prebooked: false },
      { daysAgo: 90, hoursStay: 2,  prebooked: false },
      // pre-booked upcoming
      { daysAhead: 3,  hoursStay: 2, prebooked: true },
      { daysAhead: 7,  hoursStay: 3, prebooked: true },
      { daysAhead: 14, hoursStay: 2, prebooked: true },
      { daysAhead: 21, hoursStay: 4, prebooked: true },
      { daysAhead: 28, hoursStay: 2, prebooked: true },
    ] as Array<{ daysAgo?: number; daysAhead?: number; hoursStay: number; prebooked: boolean }>;

    for (let i = 0; i < visitorScenarios.length; i++) {
      try {
        const s = visitorScenarios[i];
        let checkedInAt: Date | undefined, checkedOutAt: Date | undefined;
        if (s.daysAgo !== undefined) {
          checkedInAt  = new Date(now.getTime() - s.daysAgo * 86400000);
          checkedOutAt = new Date(checkedInAt.getTime() + s.hoursStay * 3600000);
        }
        const hostStaffId = staffIds.length > 0 ? staffIds[i % staffIds.length] : undefined;
        const inserted = await customerDb.insert(isolatedSchema.visitors).values({
          firstName:    firstNames[(i + 3) % firstNames.length],
          lastName:     lastNames[(i + 5) % lastNames.length],
          email:        `demo.visitor.${batchId}.${i}@example.com`,
          company:      visitorCompanies[i % visitorCompanies.length],
          jobTitle:     ['Sales Manager', 'Project Lead', 'Consultant', 'Account Manager', 'Director'][i % 5],
          purpose:      ['Business Meeting', 'Site Inspection', 'Training', 'Delivery', 'Audit', 'Consultation'][i % 6],
          qrCode:       `VISITOR-DEMO-${batchId}-${i}`,
          isPreBooked:  s.prebooked,
          isCheckedIn:  false,
          hostStaffId:  hostStaffId ?? undefined,
          ...(checkedInAt  ? { checkedInAt }  : {}),
          ...(checkedOutAt ? { checkedOutAt, checkoutType: 'manual' } : {}),
        }).returning({ id: isolatedSchema.visitors.id });
        if (inserted[0]?.id) visitorIds.push(inserted[0].id);
        visitorsAdded++;
      } catch (e) { logger.warn('Sample visitor insert failed:', (e as any).message); }
    }

    // ── 5 contractor companies, each with 3–4 workers ────────────────────────
    const contractorCompanyData = [
      { name: 'BuildRight Contractors Ltd',   firstName: 'Bob',   lastName: 'Builder',  phone: '01234 567890', industry: 'Construction' },
      { name: 'SafeWork Facilities UK',        firstName: 'Sarah', lastName: 'Safe',     phone: '01234 567891', industry: 'Facilities Management' },
      { name: 'Delta Technical Services',      firstName: 'David', lastName: 'Delta',    phone: '01234 567892', industry: 'Technical Services' },
      { name: 'Apex Maintenance Group',        firstName: 'Alice', lastName: 'Apex',     phone: '01234 567893', industry: 'Maintenance' },
      { name: 'Horizon Build & Civil',         firstName: 'Henry', lastName: 'Horizon',  phone: '01234 567894', industry: 'Civil Engineering' },
    ];
    const workerJobTitles = [
      'Site Engineer', 'Electrician', 'Plumber', 'HVAC Technician', 'Health & Safety Officer',
      'Project Manager', 'Scaffolder', 'Welder', 'Carpenter', 'Painter & Decorator',
      'Structural Engineer', 'Forklift Operator', 'Mechanical Fitter', 'Site Supervisor', 'Labourer',
      'Fire Safety Technician', 'Security Engineer', 'Water Treatment Specialist',
    ];
    const rightToWorkStatuses = ['valid', 'valid', 'valid', 'pending', 'valid'];
    const cscsStatuses        = ['valid', 'valid', 'pending', 'valid', 'expired'];
    const companyIds: string[] = [];
    const workerIds: string[]  = [];
    let workerSeq = 0;

    for (let c = 0; c < contractorCompanyData.length; c++) {
      try {
        const co = contractorCompanyData[c];
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
        const companyId = newCo[0].id;
        companyIds.push(companyId);
        contractorsAdded++;

        // Add 3–4 workers per company
        const workerCount = 3 + (c % 2);
        for (let w = 0; w < workerCount; w++) {
          try {
            const seq   = workerSeq++;
            const fnIdx = seq % firstNames.length;
            const lnIdx = (seq + 4) % lastNames.length;
            const inserted = await customerDb.insert(isolatedSchema.contractorWorkers).values({
              companyId,
              firstName:   firstNames[fnIdx],
              lastName:    lastNames[lnIdx],
              email:       `demo.worker.${batchId}.${seq}@example.com`,
              phoneNumber: ukPhones[seq % ukPhones.length],
              jobTitle:    workerJobTitles[seq % workerJobTitles.length],
              department:  departments[seq % departments.length],
              rightToWork: rightToWorkStatuses[c],
              cscsStatus:  cscsStatuses[c],
              postcode:    `EC${1 + (seq % 4)}V ${seq % 9}BB`,
              transportMethod: ['car_diesel', 'car_petrol', 'public_transport', 'bicycle', 'walking'][seq % 5],
              isActive:    true,
            }).returning({ id: isolatedSchema.contractorWorkers.id });
            if (inserted[0]?.id) workerIds.push(inserted[0].id);
            workersAdded++;
          } catch (e) { logger.warn('Sample worker insert failed:', (e as any).message); }
        }
      } catch (e) { logger.warn('Sample contractor company insert failed:', (e as any).message); }
    }

    // ── 10 sample members ────────────────────────────────────────────────────
    const memberIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        const inserted = await customerDb.insert(isolatedSchema.members).values({
          firstName:        firstNames[(i + 2) % firstNames.length],
          lastName:         lastNames[(i + 7) % lastNames.length],
          email:            `demo.member.${batchId}.${i}@example.com`,
          membershipType:   memberTypes[i],
          membershipId:     `MEM-${batchId}-${i}`,
          membershipNumber: `MBR-DEMO-${String(i + 1).padStart(3, '0')}`,
          joinDate:         `${now.getFullYear()}-01-01`,
          expiryDate:       `${now.getFullYear()}-12-31`,
          membershipStatus: 'active',
          qrCode:           `MEMBER-DEMO-${batchId}-${i}`,
          isCheckedIn:      false,
          isActive:         true,
        }).returning({ id: isolatedSchema.members.id });
        if (inserted[0]?.id) memberIds.push(inserted[0].id);
        membersAdded++;
      } catch (e) { logger.warn('Sample member insert failed:', (e as any).message); }
    }

    // ── HR data for staff ─────────────────────────────────────────────────────
    if (staffIds.length > 0) {
      // 1. Right to Work
      try {
        const rtwScenarios: Array<[string, number | null, number | null]> = [
          ['passport', 2, null], ['passport', 3, null], ['passport', 4, null], ['passport', 5, null],
          ['passport', 3, null], ['passport', 4, null], ['passport', null, 45], ['passport', null, 20],
          ['passport', null, -30], ['british_passport', null, null],
        ];
        for (let i = 0; i < staffIds.length; i++) {
          const [docType, years, days] = rtwScenarios[i];
          const expirySQL = years !== null ? `NOW() + INTERVAL '${years} years'`
            : days === null ? 'NULL' : days >= 0 ? `NOW() + INTERVAL '${days} days'`
            : `NOW() - INTERVAL '${Math.abs(days)} days'`;
          await pool.query(
            `INSERT INTO "${schemaName}".right_to_work (staff_id, document_type, document_reference, issue_date, expiry_date, verified_date, verified_by, verification_method, is_current)
             VALUES ($1, $2, $3, NOW() - INTERVAL '6 months', ${expirySQL}, NOW() - INTERVAL '6 months', 'HR Manager', 'manual', TRUE)`,
            [staffIds[i], docType, `DEMO-RTW-${batchId}-${i}`]
          );
        }
      } catch (e) { logger.warn('Sample HR: right_to_work failed', (e as any).message); }

      // 2. DBS Certificates
      try {
        const dbsData: Array<[string, number | null, number | null]> = [
          ['enhanced_with_barred_lists', 3, null], ['enhanced', 2, null], ['standard', 1, null],
          ['enhanced', null, 60], ['enhanced_with_barred_lists', null, 15], ['basic', 1, null],
          ['enhanced', 2, null], ['basic', 3, null], ['enhanced', 4, null], ['enhanced', 2, null],
        ];
        for (let i = 0; i < staffIds.length; i++) {
          const [level, years, days] = dbsData[i];
          const expirySQL = years !== null ? `NOW() + INTERVAL '${years} years'` : `NOW() + INTERVAL '${days} days'`;
          await pool.query(
            `INSERT INTO "${schemaName}".staff_dbs (staff_id, dbs_level, certificate_number, issue_date, policy_expiry_date, verified_by, verified_date, is_current)
             VALUES ($1, $2, $3, NOW() - INTERVAL '1 year', ${expirySQL}, 'HR Manager', NOW() - INTERVAL '1 year', TRUE)`,
            [staffIds[i], level, `DEMO-DBS-${batchId}-${i}`]
          );
        }
      } catch (e) { logger.warn('Sample HR: staff_dbs failed', (e as any).message); }

      // 3. Leave Requests
      try {
        const leaveData = [
          { si: 0, type: 'annual', sOff: -60, days: 5, status: 'approved' },
          { si: 1, type: 'annual', sOff: -45, days: 3, status: 'approved' },
          { si: 2, type: 'annual', sOff: -30, days: 10, status: 'approved' },
          { si: 3, type: 'annual', sOff: -20, days: 2, status: 'approved' },
          { si: 4, type: 'annual', sOff: -14, days: 5, status: 'approved' },
          { si: 0, type: 'annual', sOff: 14, days: 5, status: 'approved' },
          { si: 5, type: 'annual', sOff: 28, days: 3, status: 'approved' },
          { si: 6, type: 'annual', sOff: 56, days: 5, status: 'approved' },
          { si: 7, type: 'annual', sOff: 21, days: 3, status: 'pending' },
          { si: 8, type: 'annual', sOff: 35, days: 5, status: 'pending' },
          { si: 2, type: 'sick', sOff: -10, days: 2, status: 'approved' },
          { si: 3, type: 'sick', sOff: -25, days: 1, status: 'approved' },
          { si: 4, type: 'parental', sOff: -90, days: 10, status: 'approved' },
          { si: 5, type: 'parental', sOff: -120, days: 5, status: 'approved' },
          { si: 1, type: 'compassionate', sOff: -40, days: 3, status: 'approved' },
        ];
        for (const l of leaveData) {
          if (!staffIds[l.si]) continue;
          const ss = l.sOff >= 0 ? '+' : '-';
          const sa = Math.abs(l.sOff);
          const ea = Math.abs(l.sOff) + l.days - 1;
          await pool.query(
            `INSERT INTO "${schemaName}".leave_requests (staff_id, leave_type, start_date, end_date, days_taken, status, reason)
             VALUES ($1, $2, (NOW() ${ss} INTERVAL '${sa} days')::date, (NOW() ${ss} INTERVAL '${ea} days')::date, $3, $4, 'Sample leave request')`,
            [staffIds[l.si], l.type, l.days, l.status]
          );
        }
      } catch (e) { logger.warn('Sample HR: leave_requests failed', (e as any).message); }

      // 4. Absence Records
      try {
        const absenceData = [
          { si: 0, offsets: [-120, -90, -45], days: 1, reason: 'Cold / Flu' },
          { si: 1, offsets: [-100, -60], days: 2, reason: 'Stomach complaint' },
          { si: 2, offsets: [-180, -150, -120, -90, -45], days: 1, reason: 'Cold / Flu' },
          { si: 3, offsets: [-50], days: 5, reason: 'Back injury' },
          { si: 4, offsets: [-330, -280, -240, -200, -160, -120], days: 1, reason: 'Cold / Flu' },
          { si: 5, offsets: [-30], days: 2, reason: 'Migraine' },
        ];
        for (const a of absenceData) {
          if (!staffIds[a.si]) continue;
          for (const offset of a.offsets) {
            const abs = Math.abs(offset);
            await pool.query(
              `INSERT INTO "${schemaName}".absence_records (staff_id, absence_type, start_date, return_date, days_lost, reason)
               VALUES ($1, 'sickness', (NOW() - INTERVAL '${abs} days')::date, (NOW() - INTERVAL '${abs - a.days} days')::date, $2, $3)`,
              [staffIds[a.si], a.days, a.reason]
            );
          }
        }
      } catch (e) { logger.warn('Sample HR: absence_records failed', (e as any).message); }

      // 5. Training Requirements + Staff Training Records
      const trainingCourseNames: string[] = [];
      const trainingDefs = [
        { name: 'Fire Safety Awareness', freq: 12 },
        { name: 'Manual Handling', freq: 36 },
        { name: 'Health & Safety Induction', freq: 0 },
        { name: 'GDPR Data Protection', freq: 24 },
        { name: 'First Aid Awareness', freq: 36 },
      ];
      try {
        for (const tr of trainingDefs) {
          try {
            await pool.query(`INSERT INTO "${schemaName}".training_requirements (course_name, renewal_period_months) VALUES ($1, $2)`, [tr.name, tr.freq]);
          } catch { /* already exists */ }
          trainingCourseNames.push(tr.name);
        }
      } catch (e) { logger.warn('Sample HR: training_requirements failed', (e as any).message); }

      if (trainingCourseNames.length === 5) {
        try {
          for (let i = 0; i < 4 && i < staffIds.length; i++) {
            for (let t = 0; t < 5; t++) {
              await pool.query(
                `INSERT INTO "${schemaName}".staff_training_records (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory)
                 VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '6 months')::date, (NOW() + INTERVAL '6 months')::date, TRUE)`,
                [staffIds[i], trainingCourseNames[t]]
              );
            }
          }
          if (staffIds[4]) {
            await pool.query(`INSERT INTO "${schemaName}".staff_training_records (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory) VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '14 months')::date, (NOW() - INTERVAL '2 months')::date, TRUE)`, [staffIds[4], trainingCourseNames[0]]);
            for (let t = 1; t < 5; t++) {
              await pool.query(`INSERT INTO "${schemaName}".staff_training_records (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory) VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '6 months')::date, (NOW() + INTERVAL '6 months')::date, TRUE)`, [staffIds[4], trainingCourseNames[t]]);
            }
          }
          if (staffIds[5]) {
            for (const t of [1, 3]) {
              await pool.query(`INSERT INTO "${schemaName}".staff_training_records (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory) VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '6 months')::date, (NOW() + INTERVAL '6 months')::date, TRUE)`, [staffIds[5], trainingCourseNames[t]]);
            }
          }
          for (let i = 6; i < staffIds.length; i++) {
            await pool.query(`INSERT INTO "${schemaName}".staff_training_records (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory) VALUES ($1, $2, 'Internal Training', (NOW() - INTERVAL '3 months')::date, NULL, TRUE)`, [staffIds[i], trainingCourseNames[2]]);
          }
        } catch (e) { logger.warn('Sample HR: staff_training_records failed', (e as any).message); }
      }

      // 6. Appraisals
      try {
        const appraisalData = [
          { si: 0, dOff: -180, nOff: 180, rating: 'good', conductor: 'HR Manager' },
          { si: 1, dOff: -330, nOff: 30, rating: 'excellent', conductor: 'Line Manager' },
          { si: 2, dOff: -90, nOff: 90, rating: null, conductor: 'HR Manager' },
          { si: 3, dOff: -365, nOff: -30, rating: 'good', conductor: 'Line Manager' },
          { si: 4, dOff: -365, nOff: -30, rating: 'satisfactory', conductor: 'HR Manager' },
        ];
        for (const a of appraisalData) {
          if (!staffIds[a.si]) continue;
          const ds = a.dOff >= 0 ? '+' : '-'; const da = Math.abs(a.dOff);
          const ns = a.nOff >= 0 ? '+' : '-'; const na = Math.abs(a.nOff);
          await pool.query(
            `INSERT INTO "${schemaName}".appraisals (staff_id, review_date, next_review_date, conducted_by, overall_rating, summary_notes)
             VALUES ($1, (NOW() ${ds} INTERVAL '${da} days')::date, (NOW() ${ns} INTERVAL '${na} days')::date, $2, $3, 'Sample appraisal record')`,
            [staffIds[a.si], a.conductor, a.rating]
          );
        }
      } catch (e) { logger.warn('Sample HR: appraisals failed', (e as any).message); }

      // 7. Onboarding checklist for newest starter
      if (staffIds[9]) {
        try { await pool.query(`INSERT INTO "${schemaName}".onboarding_checklists (staff_id) VALUES ($1)`, [staffIds[9]]); }
        catch (e) { logger.warn('Sample HR: onboarding failed', (e as any).message); }
      }

      // 8. Leaver process for staff[8]
      if (staffIds[8]) {
        try {
          await pool.query(`UPDATE "${schemaName}".staff SET employment_status = 'leaver', contract_end_date = NOW() - INTERVAL '30 days', is_active = FALSE WHERE id = $1`, [staffIds[8]]);
          await pool.query(`INSERT INTO "${schemaName}".leaver_checklists (staff_id, last_day, reason, is_voluntary, completed_at) VALUES ($1, (NOW() - INTERVAL '30 days')::date, 'resignation', TRUE, NOW() - INTERVAL '28 days')`, [staffIds[8]]);
        } catch (e) { logger.warn('Sample HR: leaver failed', (e as any).message); }
      }

      // 9. Staff Documents (2 per staff)
      try {
        for (let i = 0; i < staffIds.length; i++) {
          await pool.query(`INSERT INTO "${schemaName}".staff_documents (staff_id, document_type, title, file_url, file_name, is_confidential, uploaded_by, notes) VALUES ($1, 'contract', 'Employment Contract', '#', 'employment_contract.pdf', TRUE, 'HR Manager', 'Sample document — uploaded for demonstration purposes')`, [staffIds[i]]);
          await pool.query(`INSERT INTO "${schemaName}".staff_documents (staff_id, document_type, title, file_url, file_name, is_confidential, uploaded_by, notes) VALUES ($1, 'right_to_work', 'Passport Copy', '#', 'passport_copy.pdf', TRUE, 'HR Manager', 'Sample document — uploaded for demonstration purposes')`, [staffIds[i]]);
        }
      } catch (e) { logger.warn('Sample HR: staff_documents failed', (e as any).message); }

      // 10. Staff Sessions (attendance history — 8 sessions per staff member)
      try {
        for (let i = 0; i < staffIds.length; i++) {
          for (let d = 1; d <= 8; d++) {
            const daysBack = d * 3;
            await pool.query(
              `INSERT INTO "${schemaName}".staff_sessions (staff_id, check_in_time, check_out_time, is_manual, check_in_method)
               VALUES ($1, NOW() - INTERVAL '${daysBack} days' + INTERVAL '8 hours', NOW() - INTERVAL '${daysBack} days' + INTERVAL '17 hours', FALSE, 'card')`,
              [staffIds[i]]
            );
          }
        }
      } catch (e) { logger.warn('Sample HR: staff_sessions failed', (e as any).message); }
    }

    // ── Worker certifications ─────────────────────────────────────────────────
    if (workerIds.length > 0) {
      try {
        const certTypes = [
          { type: 'CSCS Card', expMonths: 60 },
          { type: 'Asbestos Awareness', expMonths: 12 },
          { type: 'First Aid at Work', expMonths: 36 },
          { type: 'Working at Height', expMonths: 12 },
          { type: 'Manual Handling', expMonths: 36 },
        ];
        for (let i = 0; i < workerIds.length; i++) {
          const wid = workerIds[i];
          await pool.query(
            `INSERT INTO "${schemaName}".worker_certifications (worker_id, certification_type, certification_number, issuer, issued_date, expiry_date, status)
             VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 year', NOW() + INTERVAL '${certTypes[0].expMonths} months', 'valid')`,
            [wid, certTypes[0].type, `CSCS-DEMO-${batchId}-${i}`, 'CSCS']
          );
          if (i % 3 === 0) {
            await pool.query(
              `INSERT INTO "${schemaName}".worker_certifications (worker_id, certification_type, certification_number, issuer, issued_date, expiry_date, status)
               VALUES ($1, $2, $3, $4, NOW() - INTERVAL '6 months', NOW() + INTERVAL '6 months', 'valid')`,
              [wid, certTypes[1].type, `ASBE-DEMO-${batchId}-${i}`, 'UKATA']
            );
          }
          if (i % 4 === 0) {
            await pool.query(
              `INSERT INTO "${schemaName}".worker_certifications (worker_id, certification_type, certification_number, issuer, issued_date, expiry_date, status)
               VALUES ($1, $2, $3, $4, NOW() - INTERVAL '2 years', NOW() + INTERVAL '1 year', 'valid')`,
              [wid, certTypes[2].type, `FAW-DEMO-${batchId}-${i}`, 'St John Ambulance']
            );
          }
        }
      } catch (e) { logger.warn('Sample worker_certifications failed', (e as any).message); }

      // Worker competencies
      try {
        const compTypes = ['Manual Handling', 'COSHH Awareness', 'Fire Safety', 'Risk Assessment', 'Confined Spaces'];
        for (let i = 0; i < Math.min(workerIds.length, 10); i++) {
          await pool.query(
            `INSERT INTO "${schemaName}".worker_competencies (worker_id, competency_type, issuer, issued_date, expiry_date, status)
             VALUES ($1, $2, $3, NOW() - INTERVAL '8 months', NOW() + INTERVAL '4 months', 'valid')`,
            [workerIds[i], compTypes[i % compTypes.length], 'Internal Training']
          );
        }
      } catch (e) { logger.warn('Sample worker_competencies failed', (e as any).message); }
    }

    // ── Contractor visits ─────────────────────────────────────────────────────
    if (workerIds.length > 0 && companyIds.length > 0) {
      try {
        const purposes = ['Maintenance Work', 'Installation', 'Inspection', 'Repair', 'Survey', 'Testing & Commissioning'];
        let visitSeq = 0;
        for (let i = 0; i < workerIds.length; i++) {
          const wid = workerIds[i];
          const cid = companyIds[Math.floor(i / 4) % companyIds.length];
          const hostId = staffIds.length > 0 ? staffIds[i % staffIds.length] : null;
          const hostFn = staffIds.length > 0 ? `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}` : null;

          // 2–3 past completed visits per worker
          const pastCount = 2 + (i % 2);
          for (let p = 0; p < pastCount; p++) {
            const daysBack = (p + 1) * 14 + (i * 3);
            await pool.query(
              `INSERT INTO "${schemaName}".contractor_visits
                 (worker_id, company_id, host_staff_id, host_name, checked_in_at, checked_out_at, purpose,
                  hs_rules_accepted, hs_rules_accepted_at, induction_completed, induction_completed_at,
                  is_accounted_for, checkout_type)
               VALUES ($1,$2,$3,$4,
                 NOW() - INTERVAL '${daysBack} days' + INTERVAL '8 hours',
                 NOW() - INTERVAL '${daysBack} days' + INTERVAL '16 hours',
                 $5, TRUE, NOW() - INTERVAL '${daysBack} days' + INTERVAL '8 hours',
                 TRUE, NOW() - INTERVAL '${daysBack} days' + INTERVAL '8 hours 15 minutes',
                 TRUE, 'manual')`,
              [wid, cid, hostId, hostFn, purposes[visitSeq++ % purposes.length]]
            );
          }

          // First 4 workers are currently on site (checked in, no checkout)
          if (i < 4) {
            await pool.query(
              `INSERT INTO "${schemaName}".contractor_visits
                 (worker_id, company_id, host_staff_id, host_name, checked_in_at, purpose,
                  hs_rules_accepted, hs_rules_accepted_at, induction_completed, induction_completed_at,
                  is_accounted_for)
               VALUES ($1,$2,$3,$4, NOW() - INTERVAL '2 hours', $5,
                 TRUE, NOW() - INTERVAL '2 hours',
                 TRUE, NOW() - INTERVAL '1 hour 45 minutes', TRUE)`,
              [wid, cid, hostId, hostFn, purposes[visitSeq++ % purposes.length]]
            );
          }
        }
      } catch (e) { logger.warn('Sample contractor_visits failed', (e as any).message); }

      // Contractor pre-bookings (upcoming)
      try {
        const pbData = [
          { coIdx: 0, wIdx: 0, daysAhead: 3,  purpose: 'Planned Maintenance',   time: '09:00', dur: '4' },
          { coIdx: 1, wIdx: 4, daysAhead: 7,  purpose: 'Fire Alarm Testing',     time: '08:00', dur: '8' },
          { coIdx: 2, wIdx: 8, daysAhead: 10, purpose: 'CCTV Installation',       time: '10:00', dur: '6' },
          { coIdx: 3, wIdx: 11, daysAhead: 14, purpose: 'Annual HVAC Service',    time: '08:30', dur: '8' },
          { coIdx: 4, wIdx: 14, daysAhead: 21, purpose: 'Structural Survey',      time: '09:00', dur: '4' },
        ];
        for (const pb of pbData) {
          const coData = contractorCompanyData[pb.coIdx % contractorCompanyData.length];
          const wIdx   = pb.wIdx % workerIds.length;
          const wName  = `${firstNames[wIdx % firstNames.length]} ${lastNames[(wIdx + 4) % lastNames.length]}`;
          const hIdx   = pb.coIdx % staffIds.length;
          const hName  = staffIds.length > 0 ? `${firstNames[hIdx]} ${lastNames[hIdx]}` : 'Site Manager';
          await pool.query(
            `INSERT INTO "${schemaName}".contractor_prebookings
               (company_name, contact_email, contact_phone, worker_name, worker_email, purpose,
                scheduled_date, scheduled_time, duration, status, qr_code, host_staff_id, host_name)
             VALUES ($1,$2,$3,$4,$5,$6,
               (NOW() + INTERVAL '${pb.daysAhead} days')::date, $7, $8, 'approved',
               $9, $10, $11)`,
            [coData.name, `demo.company.${batchId}.${pb.coIdx}@example.com`, coData.phone,
             wName, `demo.worker.${batchId}.${wIdx}@example.com`, pb.purpose,
             pb.time, pb.dur, `CTPB-DEMO-${batchId}-${pb.coIdx}`,
             staffIds.length > 0 ? staffIds[hIdx] : null, hName]
          );
        }
      } catch (e) { logger.warn('Sample contractor_prebookings failed', (e as any).message); }

      // Permit to Work records
      try {
        const ptwData = [
          { wIdx: 0, coIdx: 0, type: 'hot_work',         desc: 'Welding on roof structure', loc: 'Roof Level 3', status: 'approved', dOff: -1, dur: 1 },
          { wIdx: 1, coIdx: 1, type: 'electrical',        desc: 'Electrical panel upgrade',  loc: 'Plant Room',  status: 'approved', dOff: 0,  dur: 1 },
          { wIdx: 2, coIdx: 2, type: 'confined_space',    desc: 'Drainage inspection',       loc: 'Basement',    status: 'draft',    dOff: 3,  dur: 1 },
          { wIdx: 3, coIdx: 3, type: 'working_at_height', desc: 'Facade cleaning works',     loc: 'External',    status: 'closed',   dOff: -7, dur: 1 },
        ];
        for (let i = 0; i < ptwData.length; i++) {
          const p = ptwData[i];
          const wIdx = p.wIdx % workerIds.length;
          const cIdx = p.coIdx % companyIds.length;
          const sIdx = i % staffIds.length;
          const coName = contractorCompanyData[p.coIdx % contractorCompanyData.length].name;
          const wName  = `${firstNames[wIdx % firstNames.length]} ${lastNames[(wIdx + 4) % lastNames.length]}`;
          const sName  = staffIds.length > 0 ? `${firstNames[sIdx]} ${lastNames[sIdx]}` : 'Site Manager';
          const sign = p.dOff >= 0 ? '+' : '-';
          const absD = Math.abs(p.dOff);
          await pool.query(
            `INSERT INTO "${schemaName}".permit_to_work
               (permit_number, permit_type, work_description, work_location,
                contractor_company_id, contractor_company_name, contractor_worker_id, contractor_worker_name,
                staff_id, staff_name,
                planned_start_date, planned_start_time, planned_end_date, planned_end_time,
                permit_valid_from, permit_valid_until, status,
                created_by_id, created_by_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               (NOW() ${sign} INTERVAL '${absD} days')::date, '08:00',
               (NOW() ${sign} INTERVAL '${absD} days')::date, '17:00',
               (NOW() ${sign} INTERVAL '${absD} days')::date,
               (NOW() ${sign} INTERVAL '${absD} days')::date + INTERVAL '${p.dur} days',
               $11,$12,$13)`,
            [`PTW-DEMO-${batchId}-${i}`, p.type, p.desc, p.loc,
             companyIds[cIdx], coName, workerIds[wIdx], wName,
             staffIds.length > 0 ? staffIds[sIdx] : null, sName,
             p.status,
             staffIds.length > 0 ? staffIds[sIdx] : null, sName]
          );
        }
      } catch (e) { logger.warn('Sample permit_to_work failed', (e as any).message); }
    }

    // ── Visitor history (past visit records) ──────────────────────────────────
    if (visitorIds.length > 0 && staffIds.length > 0) {
      try {
        for (let i = 0; i < Math.min(visitorIds.length, 10); i++) {
          const daysBack = (i + 1) * 7;
          const hIdx = i % staffIds.length;
          await pool.query(
            `INSERT INTO "${schemaName}".visitor_history
               (visitor_id, check_in_time, check_out_time, purpose, host_staff_id, host_name,
                induction_completed, hs_rules_accepted, checkout_type)
             VALUES ($1, NOW() - INTERVAL '${daysBack} days' + INTERVAL '9 hours',
               NOW() - INTERVAL '${daysBack} days' + INTERVAL '16 hours',
               $2, $3, $4, TRUE, TRUE, 'manual')`,
            [visitorIds[i],
             ['Business Meeting', 'Site Visit', 'Training', 'Audit', 'Consultation'][i % 5],
             staffIds[hIdx],
             `${firstNames[hIdx]} ${lastNames[hIdx]}`]
          );
        }
      } catch (e) { logger.warn('Sample visitor_history failed', (e as any).message); }

      // Visitor pre-bookings (upcoming, linked to visitor records and host staff)
      try {
        for (let i = 0; i < 5 && i < visitorIds.length; i++) {
          const daysAhead = (i + 1) * 7;
          const hIdx = i % staffIds.length;
          await pool.query(
            `INSERT INTO "${schemaName}".pre_bookings
               (visitor_id, visitor_first_name, visitor_last_name, visitor_email,
                company, visit_date, visit_time, host_staff_id, host_name, purpose, status, qr_code)
             VALUES ($1,$2,$3,$4,$5,
               (NOW() + INTERVAL '${daysAhead} days')::date, '10:00',
               $6, $7, $8, 'pending', $9)`,
            [visitorIds[i + 10] ?? null,
             firstNames[(i + 3) % firstNames.length],
             lastNames[(i + 5) % lastNames.length],
             `demo.visitor.${batchId}.${i + 10}@example.com`,
             visitorCompanies[(i + 10) % visitorCompanies.length],
             staffIds[hIdx],
             `${firstNames[hIdx]} ${lastNames[hIdx]}`,
             ['Business Meeting', 'Site Inspection', 'Training', 'Audit', 'Consultation'][i % 5],
             `VPB-DEMO-${batchId}-${i}`]
          );
        }
      } catch (e) { logger.warn('Sample pre_bookings failed', (e as any).message); }
    }

    // ── RA Builder sample assessments + hazards ──────────────────────────────
    let raAssessmentsAdded = 0;
    try {
      const raAssessments = [
        {
          id: `ra-demo-${batchId}-001`,
          title: 'Warehouse Operations — General Workplace',
          raType: 'general', status: 'approved',
          taskDescription: 'Day-to-day operations within the main warehouse including goods receipt, storage, picking and dispatch of stock items.',
          location: 'Main Warehouse — Building A', department: 'Operations',
          preparedBy: 'Neil Baxter', reviewedBy: 'Marcus Webb', approvedBy: 'Richard Blackwood',
          assessmentDate: '2026-01-15', nextReviewDate: '2027-01-15',
          typeMetadata: '{}',
          notes: 'All staff must complete manual handling induction before commencing warehouse duties.',
        },
        {
          id: `ra-demo-${batchId}-002`,
          title: 'COSHH — Industrial Cleaning Chemicals',
          raType: 'coshh', status: 'approved',
          taskDescription: 'Use of industrial cleaning agents including degreasers and disinfectants in production areas and toilet facilities.',
          location: 'All Internal Areas', department: 'Facilities',
          preparedBy: 'Louise Grant', reviewedBy: 'Neil Baxter', approvedBy: 'Marcus Webb',
          assessmentDate: '2026-02-10', nextReviewDate: '2027-02-10',
          typeMetadata: JSON.stringify({
            substanceName: 'Multi-Surface Degreaser (Industrial Grade)', casNumber: '64-17-5',
            sdsRef: 'SDS-CLEAN-2026-001', form: 'Liquid',
            exposureRoutes: ['Inhalation', 'Skin contact', 'Eye contact'],
            welReference: 'EH40 WEL: 1000 ppm (TWA)', quantity: '25L containers', frequency: 'Daily',
          }),
          notes: 'SDS sheets must be accessible in all areas where chemicals are used.',
        },
        {
          id: `ra-demo-${batchId}-003`,
          title: 'Manual Handling — Stock Box Lifting & Carrying',
          raType: 'manual_handling', status: 'approved',
          taskDescription: 'Lifting, carrying and stacking of stock boxes from delivery vehicles to racking system. Boxes vary from 5kg to 30kg.',
          location: 'Goods-In Bay & Warehouse Racking', department: 'Operations',
          preparedBy: 'James Fletcher', reviewedBy: 'Neil Baxter', approvedBy: 'Marcus Webb',
          assessmentDate: '2026-01-20', nextReviewDate: '2027-01-20',
          typeMetadata: JSON.stringify({
            loadDescription: 'Cardboard stock boxes, various sizes and weights', approxWeightKg: '5–30',
            dimensions: 'Various — up to 0.8m × 0.6m × 0.6m', frequency: 'Constant',
            distanceCarried: 'Up to 30m',
            postureIssues: 'Some loads require bending to ground level. Stack heights above shoulder level not permitted.',
          }),
          notes: null,
        },
        {
          id: `ra-demo-${batchId}-004`,
          title: 'Working at Height — Roof Inspection & Minor Repairs',
          raType: 'working_at_height', status: 'review',
          taskDescription: 'Periodic inspection of flat roof sections including gutters, skylights and fixings. Minor repairs to roofing membrane carried out by in-house facilities team.',
          location: 'Main Building Flat Roof — Level 3', department: 'Facilities',
          preparedBy: 'Becky Crane', reviewedBy: 'Neil Baxter', approvedBy: null,
          assessmentDate: '2026-03-05', nextReviewDate: '2027-03-05',
          typeMetadata: JSON.stringify({
            maxHeightMetres: '9.5', accessEquipment: 'Roof Access',
            surfaceType: 'Flat bituminous membrane — may be slippery when wet',
            rescuePlan: 'Two-person rule in operation at all times. First aid trained colleague to remain at roof access hatch. Emergency: 999. Internal first aid: reception x2020.',
          }),
          notes: 'Roof access permitted to competent persons only. No solo roof working. Works suspended in winds above 15mph or during precipitation.',
        },
        {
          id: `ra-demo-${batchId}-005`,
          title: 'Lone Working — Out-of-Hours Security & Facilities Checks',
          raType: 'lone_working', status: 'approved',
          taskDescription: 'Out-of-hours security patrols and facilities checks conducted by a single member of staff between 22:00 and 06:00.',
          location: 'Entire Site — Internal and External Areas', department: 'Security',
          preparedBy: 'Neil Baxter', reviewedBy: 'Marcus Webb', approvedBy: 'Richard Blackwood',
          assessmentDate: '2026-01-08', nextReviewDate: '2027-01-08',
          typeMetadata: JSON.stringify({
            workLocation: 'Full site — Building A, B and external car parks', workDuration: '8 hours',
            checkInIntervalMins: '60', emergencyContactName: 'Duty Manager On-Call',
            emergencyContactPhone: '07700 900 911', communicationMethod: 'Mobile phone',
          }),
          notes: 'Lone worker must use the TPR Max Lone Worker module to log check-ins every 60 minutes. Missed check-in triggers automated escalation to duty manager.',
        },
        {
          id: `ra-demo-${batchId}-006`,
          title: 'DSE — Office Workstation Assessment',
          raType: 'dse', status: 'approved',
          taskDescription: 'Individual workstation assessment for office-based staff using display screen equipment for more than 1 hour per day under the Health and Safety (Display Screen Equipment) Regulations 1992.',
          location: 'Open Plan Office — Floor 2', department: 'Administration',
          preparedBy: 'Diane Eastwood', reviewedBy: 'Neil Baxter', approvedBy: 'Marcus Webb',
          assessmentDate: '2026-02-14', nextReviewDate: '2027-02-14',
          typeMetadata: JSON.stringify({
            assesseeName: 'Multiple — see individual DSE records', workstationLocation: 'Open Plan Office, Floor 2',
            displayType: 'Desktop monitor', eyeTestStatus: 'Up to date',
            seatingNotes: 'Height-adjustable chairs provided. Staff briefed on correct lumbar support adjustment.',
            keyboardMouse: 'Standard wired keyboard and mouse. Wrist rests available on request.',
            lighting: 'LED panels with individual task lighting. Blinds fitted to manage glare from south-facing windows.',
            environment: 'Air conditioning operational. Background noise levels acceptable.',
          }),
          notes: null,
        },
      ];

      for (const ra of raAssessments) {
        await pool.query(`
          INSERT INTO "${schemaName}".ra_builder_assessments
            (id, title, ra_type, status, task_description, location, department, prepared_by, reviewed_by,
             approved_by, assessment_date, next_review_date, type_metadata, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (id) DO NOTHING`,
          [ra.id, ra.title, ra.raType, ra.status, ra.taskDescription ?? null, ra.location ?? null,
           ra.department ?? null, ra.preparedBy ?? null, ra.reviewedBy ?? null, ra.approvedBy ?? null,
           ra.assessmentDate ?? null, ra.nextReviewDate ?? null, ra.typeMetadata ?? '{}', ra.notes ?? null]
        );
        raAssessmentsAdded++;
      }

      const raHazards: Array<{
        raId: string; hazardDescription: string; affectedPersons: string; existingControls: string;
        likelihood: number; severity: number; riskRating: number; additionalControls: string;
        residualLikelihood: number; residualSeverity: number; residualRiskRating: number;
        actionBy: string; actionDate: string; actionStatus: string; sortOrder: number;
      }> = [
        // Warehouse General (4 hazards)
        { raId: `ra-demo-${batchId}-001`, hazardDescription: 'Slips, trips and falls on warehouse floor', affectedPersons: 'All warehouse staff, visitors', existingControls: 'Non-slip floor surfaces maintained. Pedestrian walkways marked with yellow line markings. Good housekeeping standards enforced.', likelihood: 3, severity: 3, riskRating: 9, additionalControls: 'Weekly walkway inspection checklist completed and signed by supervisor. Immediate reporting system for spillages — spill kit stations at 5 locations. Anti-slip footwear (S1P minimum) mandatory for all warehouse personnel.', residualLikelihood: 1, residualSeverity: 3, residualRiskRating: 3, actionBy: 'James Fletcher', actionDate: '2026-02-01', actionStatus: 'closed', sortOrder: 0 },
        { raId: `ra-demo-${batchId}-001`, hazardDescription: 'Collision between pedestrians and forklift trucks (FLTs)', affectedPersons: 'Warehouse staff, goods-in operatives', existingControls: 'Segregated pedestrian and FLT routes marked on floor. High-visibility vest mandatory in warehouse. FLT speed limit 5mph.', likelihood: 2, severity: 5, riskRating: 10, additionalControls: 'Install proximity warning system on all FLTs (audible and visual alert when pedestrian within 3m). Blue spot lights on FLTs to give advance warning. Annual FLT driver competency refresher training schedule in place.', residualLikelihood: 1, residualSeverity: 5, residualRiskRating: 5, actionBy: 'James Fletcher', actionDate: '2026-03-01', actionStatus: 'open', sortOrder: 1 },
        { raId: `ra-demo-${batchId}-001`, hazardDescription: 'Racking collapse — overloaded or damaged racking bays', affectedPersons: 'All warehouse staff', existingControls: 'Racking load notices posted at each bay. Monthly racking inspection by supervisor. Damage reporting procedure in place.', likelihood: 1, severity: 5, riskRating: 5, additionalControls: 'Annual racking inspection by SARI-qualified inspector contracted. Damaged bay tagged with red card and taken out of service immediately pending repair.', residualLikelihood: 1, residualSeverity: 5, residualRiskRating: 5, actionBy: 'Louise Grant', actionDate: '2026-04-01', actionStatus: 'open', sortOrder: 2 },
        { raId: `ra-demo-${batchId}-001`, hazardDescription: 'Fire — accumulation of combustible packaging materials', affectedPersons: 'All staff, contractors, visitors on site', existingControls: 'Fire risk assessment in place. Sprinkler system fitted. Fire extinguishers sited throughout. Fire exits kept clear.', likelihood: 1, severity: 5, riskRating: 5, additionalControls: 'Monthly fire extinguisher inspection. Cardboard baling machine installed to reduce loose cardboard accumulation. No smoking enforced on entire site. Fire alarm test every Friday at 09:30.', residualLikelihood: 1, residualSeverity: 5, residualRiskRating: 5, actionBy: 'Neil Baxter', actionDate: '2026-02-01', actionStatus: 'closed', sortOrder: 3 },
        // COSHH (3 hazards)
        { raId: `ra-demo-${batchId}-002`, hazardDescription: 'Inhalation of chemical vapours during application in enclosed areas', affectedPersons: 'Cleaning operatives, nearby workers', existingControls: 'Chemical used in diluted form (1:20 ratio). Areas ventilated before and during use.', likelihood: 3, severity: 3, riskRating: 9, additionalControls: 'Respiratory protective equipment (FFP2 masks) to be worn when applying to concentrated areas. Ensure mechanical ventilation is operational before commencing. Display COSHH warning signs whilst in use.', residualLikelihood: 1, residualSeverity: 3, residualRiskRating: 3, actionBy: 'Louise Grant', actionDate: '2026-03-01', actionStatus: 'closed', sortOrder: 0 },
        { raId: `ra-demo-${batchId}-002`, hazardDescription: 'Skin contact causing dermatitis or chemical burns', affectedPersons: 'Cleaning operatives', existingControls: 'Nitrile gloves (minimum 0.3mm) provided. Chemical resistant apron available.', likelihood: 3, severity: 3, riskRating: 9, additionalControls: 'Mandatory use of chemical-resistant nitrile gloves EN 374 certified. Safety goggles required when decanting. Eyewash station sited in cleaning store — monthly integrity check.', residualLikelihood: 1, residualSeverity: 3, residualRiskRating: 3, actionBy: 'Louise Grant', actionDate: '2026-03-01', actionStatus: 'closed', sortOrder: 1 },
        { raId: `ra-demo-${batchId}-002`, hazardDescription: 'Incorrect storage or mixing of incompatible chemicals creating toxic gas', affectedPersons: 'All staff', existingControls: 'Separate locked COSHH store. SDS sheets held in store. Staff verbally briefed.', likelihood: 2, severity: 4, riskRating: 8, additionalControls: 'Chemical segregation labelling system installed. Acids and alkalis stored in separate bunded sections. COSHH inventory updated quarterly. All cleaning staff to complete COSHH awareness e-learning module annually.', residualLikelihood: 1, residualSeverity: 4, residualRiskRating: 4, actionBy: 'Neil Baxter', actionDate: '2026-04-01', actionStatus: 'open', sortOrder: 2 },
        // Manual Handling (2 hazards)
        { raId: `ra-demo-${batchId}-003`, hazardDescription: 'Musculoskeletal injury from lifting heavy or awkwardly shaped boxes', affectedPersons: 'Goods-in operatives, warehouse staff', existingControls: 'Manual handling training completed by all staff on induction. Team lifts for boxes over 20kg.', likelihood: 3, severity: 3, riskRating: 9, additionalControls: 'Procurement requested to ensure supplier packs in maximum 20kg boxes. Mechanical aids (pump trucks, trolleys) mandatory for loads over 25kg. Stretch and warm-up guidance posted at start-of-shift location.', residualLikelihood: 2, residualSeverity: 2, residualRiskRating: 4, actionBy: 'James Fletcher', actionDate: '2026-02-15', actionStatus: 'closed', sortOrder: 0 },
        { raId: `ra-demo-${batchId}-003`, hazardDescription: 'Musculoskeletal strain from awkward postures when stacking to high-level racking', affectedPersons: 'Warehouse pickers and storers', existingControls: 'Staff instructed not to stack above shoulder height manually. Step ladders available.', likelihood: 3, severity: 3, riskRating: 9, additionalControls: 'High-level picking now completed by FLT with safety cage attachment only. Manual stacking restricted to waist-to-shoulder height racking bays (Level 1 and 2 only).', residualLikelihood: 1, residualSeverity: 3, residualRiskRating: 3, actionBy: 'James Fletcher', actionDate: '2026-03-01', actionStatus: 'closed', sortOrder: 1 },
        // Working at Height (3 hazards)
        { raId: `ra-demo-${batchId}-004`, hazardDescription: 'Fall from roof edge — unguarded perimeter section on north face', affectedPersons: 'Facilities maintenance staff', existingControls: 'Permanent safety parapet on 3 sides (750mm height). Roof access restricted via coded lock.', likelihood: 3, severity: 5, riskRating: 15, additionalControls: 'Install temporary edge protection system (double guardrail + toe board) on north unguarded section before any roof works commence. All operatives to wear full harness attached to EN 795 Class A certified roof anchor points. Roof access permit system to be implemented.', residualLikelihood: 1, residualSeverity: 5, residualRiskRating: 5, actionBy: 'Becky Crane', actionDate: '2026-04-01', actionStatus: 'open', sortOrder: 0 },
        { raId: `ra-demo-${batchId}-004`, hazardDescription: 'Slipping on wet or frost-covered roof membrane', affectedPersons: 'Facilities maintenance staff', existingControls: 'Works avoided in wet weather where possible. No formal weather check procedure.', likelihood: 3, severity: 4, riskRating: 12, additionalControls: 'Weather check mandatory before commencing — works suspended if rainfall or temperature below 3°C. Anti-slip roof walkway boards placed over membrane. Non-slip safety footwear (S3 rating) mandatory for all roof access personnel.', residualLikelihood: 1, residualSeverity: 4, residualRiskRating: 4, actionBy: 'Becky Crane', actionDate: '2026-04-01', actionStatus: 'open', sortOrder: 1 },
        { raId: `ra-demo-${batchId}-004`, hazardDescription: 'Objects or tools falling from roof onto persons below', affectedPersons: 'Staff and visitors on ground floor and adjacent external areas', existingControls: 'Roof access sign posted at stairwell. No formal exclusion zone established.', likelihood: 2, severity: 4, riskRating: 8, additionalControls: 'Exclusion zone established and cordoned with barriers and safety signage before roof access. Debris netting erected on south-facing parapet. All tools and materials to be secured with lanyards or stored in belt pouches during roof works.', residualLikelihood: 1, residualSeverity: 4, residualRiskRating: 4, actionBy: 'Becky Crane', actionDate: '2026-04-01', actionStatus: 'open', sortOrder: 2 },
        // Lone Working (2 hazards)
        { raId: `ra-demo-${batchId}-005`, hazardDescription: 'Violence or assault from intruder during out-of-hours patrol', affectedPersons: 'Security / facilities operative working alone', existingControls: 'CCTV coverage of internal areas. Incident reporting system in place. Radio contact with off-site security monitoring centre.', likelihood: 2, severity: 4, riskRating: 8, additionalControls: 'Personal attack alarm issued to all lone workers. TPR Max Lone Worker check-in every 60 minutes — missed check-in triggers immediate call to duty manager. If no response within 10 minutes, emergency services contacted. Avoid challenging intruders directly — call 999 immediately.', residualLikelihood: 1, residualSeverity: 4, residualRiskRating: 4, actionBy: 'Neil Baxter', actionDate: '2026-01-20', actionStatus: 'closed', sortOrder: 0 },
        { raId: `ra-demo-${batchId}-005`, hazardDescription: 'Medical emergency with no immediate assistance available', affectedPersons: 'Lone worker', existingControls: 'First aid kit on site. Mobile phone carried at all times.', likelihood: 1, severity: 5, riskRating: 5, additionalControls: 'TPR Max Lone Worker session active throughout shift with GPS location logged. Pre-shift health declaration to be completed. Any lone worker with a known medical condition to be individually risk assessed. Emergency services number displayed on all internal phones.', residualLikelihood: 1, residualSeverity: 5, residualRiskRating: 5, actionBy: 'Neil Baxter', actionDate: '2026-01-20', actionStatus: 'closed', sortOrder: 1 },
        // DSE (3 hazards)
        { raId: `ra-demo-${batchId}-006`, hazardDescription: 'Upper limb disorders (RSI) from prolonged keyboard and mouse use', affectedPersons: 'Office-based DSE users', existingControls: 'Staff briefed on importance of regular breaks. Ergonomic chairs provided.', likelihood: 3, severity: 3, riskRating: 9, additionalControls: 'Minimum 5-minute break from screen every hour enforced via Outlook calendar reminder policy. Ergonomic mouse and keyboard available on request from IT. Upper limb disorder self-assessment checklist available via HR portal.', residualLikelihood: 2, residualSeverity: 2, residualRiskRating: 4, actionBy: 'Diane Eastwood', actionDate: '2026-03-01', actionStatus: 'closed', sortOrder: 0 },
        { raId: `ra-demo-${batchId}-006`, hazardDescription: 'Eye strain and headaches from screen glare and blue light exposure', affectedPersons: 'Office-based DSE users', existingControls: 'Adjustable blinds fitted. Monitor brightness set to default medium.', likelihood: 3, severity: 2, riskRating: 6, additionalControls: 'Monitor anti-glare screens available on request. All staff entitled to employer-funded eye test — reminder issued annually. Dark mode and display zoom options available and promoted on all company devices.', residualLikelihood: 2, residualSeverity: 2, residualRiskRating: 4, actionBy: 'Diane Eastwood', actionDate: '2026-03-01', actionStatus: 'closed', sortOrder: 1 },
        { raId: `ra-demo-${batchId}-006`, hazardDescription: 'Back and neck pain from sustained poor workstation posture', affectedPersons: 'Office-based DSE users', existingControls: 'Height-adjustable chairs provided. DSE induction completed on joining.', likelihood: 3, severity: 2, riskRating: 6, additionalControls: 'Individual DSE workstation assessment completed for each user by trained assessor (Diane Eastwood, DSE Assessor Certificate 2025). Monitor arms fitted for independent height/tilt adjustment. Footrests available on request. Sit-stand desks available on medical referral.', residualLikelihood: 1, residualSeverity: 2, residualRiskRating: 2, actionBy: 'Diane Eastwood', actionDate: '2026-03-01', actionStatus: 'closed', sortOrder: 2 },
      ];

      for (const hz of raHazards) {
        await pool.query(`
          INSERT INTO "${schemaName}".ra_builder_hazards
            (assessment_id, hazard_description, affected_persons, existing_controls,
             likelihood, severity, risk_rating, additional_controls,
             residual_likelihood, residual_severity, residual_risk_rating,
             action_by, action_date, action_status, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [hz.raId, hz.hazardDescription, hz.affectedPersons, hz.existingControls,
           hz.likelihood, hz.severity, hz.riskRating, hz.additionalControls,
           hz.residualLikelihood, hz.residualSeverity, hz.residualRiskRating,
           hz.actionBy, hz.actionDate, hz.actionStatus, hz.sortOrder]
        );
      }
      logger.info(`✅ RA Builder sample data: ${raAssessments.length} assessments, ${raHazards.length} hazards`);
    } catch (e: any) {
      logger.warn(`Sample RA Builder data failed: ${e.message}`);
    }

    // ── Audit & Inspection sample data ───────────────────────────────────────
    let auditTemplatesAdded = 0, auditRecordsAdded = 0, auditActionsAdded = 0;
    try {
      const auditTemplateData = [
        {
          id: `audit-demo-${batchId}-tmpl-001`,
          name: 'Monthly H&S Workplace Inspection',
          description: 'General health and safety inspection covering all workplace areas including offices, welfare facilities, fire systems and pedestrian routes.',
          category: 'safety', frequency: 'monthly', estimatedMinutes: 45, passScore: 80,
          items: [
            { q: 'Are all fire exit routes clear and unobstructed?',                              cat: 'Fire Safety',   critical: true,  photo: false, note: true  },
            { q: 'Are fire extinguishers in date and correctly sited?',                           cat: 'Fire Safety',   critical: true,  photo: false, note: true  },
            { q: 'Is the fire alarm test log up to date?',                                        cat: 'Fire Safety',   critical: false, photo: false, note: false },
            { q: 'Are all emergency lighting units operational?',                                 cat: 'Fire Safety',   critical: true,  photo: false, note: true  },
            { q: 'Are pedestrian walkways clearly marked and free from obstruction?',             cat: 'Housekeeping',  critical: false, photo: true,  note: false },
            { q: 'Is spillage/slip hazard management in place?',                                  cat: 'Housekeeping',  critical: false, photo: false, note: true  },
            { q: 'Are first aid kits fully stocked and in date?',                                 cat: 'First Aid',     critical: true,  photo: false, note: true  },
            { q: 'Is the first aid register up to date?',                                         cat: 'First Aid',     critical: false, photo: false, note: false },
            { q: 'Are all electrical panels and distribution boards accessible and unblocked?',   cat: 'Electrical',    critical: true,  photo: false, note: true  },
            { q: 'Is PPE available, in good condition and correctly stored?',                     cat: 'PPE',           critical: false, photo: false, note: true  },
            { q: 'Is the accident/incident book accessible and correctly completed?',             cat: 'Records',       critical: false, photo: false, note: false },
            { q: 'Are H&S policies and risk assessments displayed/accessible to staff?',         cat: 'Records',       critical: false, photo: false, note: false },
          ],
        },
        {
          id: `audit-demo-${batchId}-tmpl-002`,
          name: 'Fire Safety Quarterly Audit',
          description: 'Quarterly structured audit of all fire safety measures, prevention controls, evacuation procedures and responsible persons obligations.',
          category: 'fire_safety', frequency: 'quarterly', estimatedMinutes: 60, passScore: 85,
          items: [
            { q: 'Has the fire risk assessment been reviewed in the last 12 months?',             cat: 'Documentation', critical: true,  photo: false, note: true  },
            { q: 'Are all fire doors in good condition and self-closing?',                        cat: 'Passive',       critical: true,  photo: true,  note: true  },
            { q: 'Is the fire alarm panel showing normal with no faults?',                        cat: 'Detection',     critical: true,  photo: false, note: true  },
            { q: 'Have all manual call points been tested in the last 12 months?',               cat: 'Detection',     critical: true,  photo: false, note: true  },
            { q: 'Is emergency lighting tested monthly and results recorded?',                    cat: 'Evacuation',    critical: true,  photo: false, note: true  },
            { q: 'Are assembly point signs visible and unobstructed externally?',                cat: 'Evacuation',    critical: false, photo: true,  note: false },
            { q: 'Have evacuation drills been conducted in the last 6 months?',                  cat: 'Evacuation',    critical: true,  photo: false, note: true  },
            { q: 'Are all sprinkler heads clean and unobstructed?',                              cat: 'Suppression',   critical: true,  photo: false, note: true  },
            { q: 'Is a hot works permit procedure in place and communicated?',                   cat: 'Prevention',    critical: false, photo: false, note: false },
            { q: 'Are all fire signage and exit signs illuminated and visible?',                  cat: 'Signage',       critical: true,  photo: true,  note: false },
          ],
        },
        {
          id: `audit-demo-${batchId}-tmpl-003`,
          name: 'Contractor Site Induction Compliance Check',
          description: 'Verification that visiting contractors have completed all required induction steps and carry valid documentation before commencing work.',
          category: 'compliance', frequency: 'weekly', estimatedMinutes: 20, passScore: 100,
          items: [
            { q: 'Has the contractor completed the site induction on TPR?',                      cat: 'Induction',     critical: true,  photo: false, note: false },
            { q: 'Does the contractor hold a valid CSCS or equivalent card?',                    cat: 'Competence',    critical: true,  photo: true,  note: true  },
            { q: 'Has a valid RAMS been received and approved for the work?',                    cat: 'Documentation', critical: true,  photo: false, note: true  },
            { q: 'Is the contractor\'s public liability insurance in date?',                     cat: 'Insurance',     critical: true,  photo: false, note: true  },
            { q: 'Is a Permit to Work required and has it been issued?',                         cat: 'Permits',       critical: true,  photo: false, note: true  },
            { q: 'Is the contractor wearing appropriate PPE for the task?',                      cat: 'PPE',           critical: true,  photo: true,  note: false },
            { q: 'Does the contractor have emergency contact details for site?',                  cat: 'Emergency',     critical: false, photo: false, note: false },
          ],
        },
      ];

      for (const tmpl of auditTemplateData) {
        await pool.query(`
          INSERT INTO "${schemaName}".audit_templates
            (id, name, description, category, frequency, estimated_minutes, pass_score, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,true)
          ON CONFLICT (id) DO NOTHING`,
          [tmpl.id, tmpl.name, tmpl.description, tmpl.category, tmpl.frequency, tmpl.estimatedMinutes, tmpl.passScore]
        );
        auditTemplatesAdded++;
        for (let i = 0; i < tmpl.items.length; i++) {
          const item = tmpl.items[i];
          const itemId = `${tmpl.id}-item-${String(i + 1).padStart(2, '0')}`;
          await pool.query(`
            INSERT INTO "${schemaName}".audit_template_items
              (id, template_id, question, category, requires_photo, requires_note, is_critical, sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (id) DO NOTHING`,
            [itemId, tmpl.id, item.q, item.cat, item.photo, item.note, item.critical, i]
          );
        }
      }

      // 5 audit records: 3 completed (pass, fail, pass), 1 scheduled, 1 in-progress
      const auditRecordDefs = [
        {
          id: `audit-demo-${batchId}-rec-001`,
          templateId: `audit-demo-${batchId}-tmpl-001`,
          templateName: 'Monthly H&S Workplace Inspection', category: 'safety',
          title: 'Monthly H&S Inspection — January 2026', conductedBy: 'Neil Baxter',
          conductedAt: new Date('2026-01-20T10:30:00Z'), scheduledDate: '2026-01-20',
          location: 'Main Office & Warehouse — Building A',
          status: 'completed', overallScore: 92, passed: true,
          summary: 'Generally strong performance. Fire exit signage updated since last audit. First aid kit in server room requires restocking — action raised.',
        },
        {
          id: `audit-demo-${batchId}-rec-002`,
          templateId: `audit-demo-${batchId}-tmpl-001`,
          templateName: 'Monthly H&S Workplace Inspection', category: 'safety',
          title: 'Monthly H&S Inspection — February 2026', conductedBy: 'Ingrid Holm',
          conductedAt: new Date('2026-02-18T09:00:00Z'), scheduledDate: '2026-02-18',
          location: 'Main Office & Warehouse — Building A',
          status: 'completed', overallScore: 67, passed: false,
          summary: 'FAILED: Three critical findings — emergency lighting unit in stairwell B defective, fire extinguisher in loading bay expired, and pedestrian walkway on goods-in bay partially blocked by pallets. Immediate corrective actions raised.',
        },
        {
          id: `audit-demo-${batchId}-rec-003`,
          templateId: `audit-demo-${batchId}-tmpl-002`,
          templateName: 'Fire Safety Quarterly Audit', category: 'fire_safety',
          title: 'Fire Safety Audit — Q1 2026', conductedBy: 'Neil Baxter',
          conductedAt: new Date('2026-03-14T14:00:00Z'), scheduledDate: '2026-03-14',
          location: 'All Buildings',
          status: 'completed', overallScore: 88, passed: true,
          summary: 'Good overall compliance. One minor finding: east stairwell emergency lighting requires replacement battery. Action raised with facilities team.',
        },
        {
          id: `audit-demo-${batchId}-rec-004`,
          templateId: `audit-demo-${batchId}-tmpl-001`,
          templateName: 'Monthly H&S Workplace Inspection', category: 'safety',
          title: 'Monthly H&S Inspection — April 2026', conductedBy: 'Ingrid Holm',
          conductedAt: null, scheduledDate: '2026-04-20',
          location: 'Main Office & Warehouse — Building A',
          status: 'scheduled', overallScore: null, passed: null, summary: null,
        },
        {
          id: `audit-demo-${batchId}-rec-005`,
          templateId: `audit-demo-${batchId}-tmpl-003`,
          templateName: 'Contractor Site Induction Compliance Check', category: 'compliance',
          title: 'Contractor Compliance Check — BuildRight Contractors', conductedBy: 'James Fletcher',
          conductedAt: new Date('2026-02-25T08:30:00Z'), scheduledDate: '2026-02-25',
          location: 'Site Entrance & Works Area — Goods-in Extension',
          status: 'completed', overallScore: 86, passed: true,
          summary: 'Induction completed, CSCS cards verified. RAMS approved prior to works. PTW issued. Minor: one operative wearing incorrect footwear — corrected immediately on site.',
        },
      ];

      for (const rec of auditRecordDefs) {
        await pool.query(`
          INSERT INTO "${schemaName}".audit_records
            (id, template_id, template_name, category, title, conducted_by, conducted_at, scheduled_date, location, status, overall_score, passed, summary)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (id) DO NOTHING`,
          [rec.id, rec.templateId, rec.templateName, rec.category, rec.title, rec.conductedBy,
           rec.conductedAt ?? null, rec.scheduledDate, rec.location, rec.status,
           rec.overallScore ?? null, rec.passed ?? null, rec.summary ?? null]
        );
        auditRecordsAdded++;
      }

      // Items for rec-001 (passed 92% — one fail on first aid kit)
      const rec001Items = [
        { q: 'Are all fire exit routes clear and unobstructed?',                            critical: true,  resp: 'pass', note: null },
        { q: 'Are fire extinguishers in date and correctly sited?',                         critical: true,  resp: 'pass', note: null },
        { q: 'Is the fire alarm test log up to date?',                                      critical: false, resp: 'pass', note: null },
        { q: 'Are all emergency lighting units operational?',                               critical: true,  resp: 'pass', note: null },
        { q: 'Are pedestrian walkways clearly marked and free from obstruction?',           critical: false, resp: 'pass', note: null },
        { q: 'Is spillage/slip hazard management in place?',                                critical: false, resp: 'pass', note: null },
        { q: 'Are first aid kits fully stocked and in date?',                               critical: true,  resp: 'fail', note: 'First aid kit in server room requires restocking — plasters and burns dressings depleted.' },
        { q: 'Is the first aid register up to date?',                                       critical: false, resp: 'pass', note: null },
        { q: 'Are all electrical panels accessible and unblocked?',                         critical: true,  resp: 'pass', note: null },
        { q: 'Is PPE available, in good condition and correctly stored?',                   critical: false, resp: 'pass', note: null },
        { q: 'Is the accident/incident book accessible and correctly completed?',           critical: false, resp: 'pass', note: null },
        { q: 'Are H&S policies and risk assessments displayed/accessible to staff?',       critical: false, resp: 'pass', note: null },
      ];
      for (let i = 0; i < rec001Items.length; i++) {
        const it = rec001Items[i];
        await pool.query(`INSERT INTO "${schemaName}".audit_record_items (id,audit_id,question,is_critical,response,note,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
          [`${auditRecordDefs[0].id}-item-${String(i+1).padStart(2,'0')}`, auditRecordDefs[0].id, it.q, it.critical, it.resp, it.note, i]);
      }

      // Items for rec-002 (failed 67% — three fails: extinguisher, emergency lighting, walkway)
      const rec002Items = [
        { q: 'Are all fire exit routes clear and unobstructed?',                            critical: true,  resp: 'pass', note: null },
        { q: 'Are fire extinguishers in date and correctly sited?',                         critical: true,  resp: 'fail', note: 'Fire extinguisher No. 7 in loading bay — annual service tag expired 31/12/2025. Removed from service pending engineer visit.' },
        { q: 'Is the fire alarm test log up to date?',                                      critical: false, resp: 'pass', note: null },
        { q: 'Are all emergency lighting units operational?',                               critical: true,  resp: 'fail', note: 'Unit in stairwell B (2nd floor landing) not illuminating on test. Battery self-contained unit — requires replacement.' },
        { q: 'Are pedestrian walkways clearly marked and free from obstruction?',           critical: false, resp: 'fail', note: 'Walkway on goods-in bay partially blocked by 3 pallets awaiting processing. Operatives instructed to clear immediately.' },
        { q: 'Is spillage/slip hazard management in place?',                                critical: false, resp: 'pass', note: null },
        { q: 'Are first aid kits fully stocked and in date?',                               critical: true,  resp: 'pass', note: null },
        { q: 'Is the first aid register up to date?',                                       critical: false, resp: 'pass', note: null },
        { q: 'Are all electrical panels accessible and unblocked?',                         critical: true,  resp: 'pass', note: null },
        { q: 'Is PPE available, in good condition and correctly stored?',                   critical: false, resp: 'pass', note: null },
        { q: 'Is the accident/incident book accessible and correctly completed?',           critical: false, resp: 'pass', note: null },
        { q: 'Are H&S policies and risk assessments displayed/accessible to staff?',       critical: false, resp: 'pass', note: null },
      ];
      const rec002ItemIds: string[] = [];
      for (let i = 0; i < rec002Items.length; i++) {
        const it = rec002Items[i];
        const itemId = `${auditRecordDefs[1].id}-item-${String(i+1).padStart(2,'0')}`;
        rec002ItemIds.push(itemId);
        await pool.query(`INSERT INTO "${schemaName}".audit_record_items (id,audit_id,question,is_critical,response,note,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
          [itemId, auditRecordDefs[1].id, it.q, it.critical, it.resp, it.note, i]);
      }

      // 3 corrective actions for rec-002 (the failed audit)
      const rec002Actions = [
        {
          id: `audit-demo-${batchId}-action-001`,
          auditId: auditRecordDefs[1].id, auditItemId: rec002ItemIds[1],
          title: 'Replace/re-service loading bay fire extinguisher',
          description: 'Fire extinguisher No. 7 in loading bay has an expired service tag (31/12/2025). Arrange emergency service visit or replace with a serviced unit immediately.',
          priority: 'high', assignedTo: 'Louise Grant', assignedEmail: `demo.facilities.mgr.${batchId}@example.com`,
          dueDate: '2026-02-25', status: 'closed',
          closureNotes: 'Replacement CO2 2kg extinguisher installed 22/02/2026, service tag valid to 2027. Old unit sent for annual service.',
          closedAt: new Date('2026-02-22T11:00:00Z'), closedBy: 'Louise Grant',
        },
        {
          id: `audit-demo-${batchId}-action-002`,
          auditId: auditRecordDefs[1].id, auditItemId: rec002ItemIds[3],
          title: 'Replace emergency lighting battery — Stairwell B 2nd floor',
          description: 'Self-contained emergency lighting unit in stairwell B (2nd floor landing) failed function test. Unit requires new battery pack or replacement fitting.',
          priority: 'high', assignedTo: 'Becky Crane', assignedEmail: `demo.facilities.super.${batchId}@example.com`,
          dueDate: '2026-02-28', status: 'open',
          closureNotes: null, closedAt: null, closedBy: null,
        },
        {
          id: `audit-demo-${batchId}-action-003`,
          auditId: auditRecordDefs[1].id, auditItemId: rec002ItemIds[4],
          title: 'Clear goods-in bay pedestrian walkway',
          description: 'Three pallets partially blocking the pedestrian walkway in goods-in bay. Supervisor to ensure walkway is cleared and to brief team on housekeeping expectations.',
          priority: 'medium', assignedTo: 'James Fletcher', assignedEmail: `demo.ops.mgr.${batchId}@example.com`,
          dueDate: '2026-02-18', status: 'closed',
          closureNotes: 'Pallets cleared on the day. Team briefed. Supervisor conducting daily walkway check until next audit.',
          closedAt: new Date('2026-02-18T16:00:00Z'), closedBy: 'James Fletcher',
        },
      ];
      for (const action of rec002Actions) {
        await pool.query(`
          INSERT INTO "${schemaName}".audit_corrective_actions
            (id, audit_id, audit_item_id, title, description, priority, assigned_to, assigned_email, due_date, status, closure_notes, closed_at, closed_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (id) DO NOTHING`,
          [action.id, action.auditId, action.auditItemId, action.title, action.description,
           action.priority, action.assignedTo, action.assignedEmail, action.dueDate, action.status,
           action.closureNotes, action.closedAt ?? null, action.closedBy ?? null]
        );
        auditActionsAdded++;
      }
      logger.info(`✅ Audit sample data: ${auditTemplatesAdded} templates, ${auditRecordsAdded} records, ${auditActionsAdded} actions`);
    } catch (e: any) {
      logger.warn(`Sample Audit data failed: ${e.message}`);
    }

    // ── Permit to Work sample data ────────────────────────────────────────────
    let permitsAdded = 0;
    try {
      const oneWeekAgo  = new Date(now.getTime() - 7  * 86400000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
      const tomorrow    = new Date(now.getTime() + 1  * 86400000);
      const nextWeek    = new Date(now.getTime() + 7  * 86400000);

      const samplePermits = [
        {
          id: `ptw-demo-${batchId}-001`,
          permitNumber: `DEMO-HOT-${batchId}-001`,
          permitType: 'hot_work',
          workDescription: 'Welding and hot cutting of steel frame supports in the loading bay extension. All combustibles within 5m radius removed or protected prior to works commencing. Works form part of approved structural extension project.',
          workLocation: 'Loading Bay — Extension Zone C, Building A',
          contractorCompanyName: 'BuildRight Contractors Ltd', contractorWorkerName: 'Dave Ramsey',
          staffName: 'James Fletcher',
          plannedStartDate: twoWeeksAgo.toISOString().slice(0,10), plannedStartTime: '08:00',
          plannedEndDate:   twoWeeksAgo.toISOString().slice(0,10), plannedEndTime:   '17:00',
          permitValidFrom: twoWeeksAgo, permitValidUntil: new Date(twoWeeksAgo.getTime() + 10 * 3600000),
          status: 'closed',
          authorisedByName: 'Marcus Webb', authorisedAt: new Date(twoWeeksAgo.getTime() - 3600000),
          authNotes: 'Fire watch in place throughout. CO2 extinguisher positioned within 2m of work area. Smoke detection in Zone C isolated for duration of works.',
          closedByName: 'James Fletcher', closedAt: new Date(twoWeeksAgo.getTime() + 9 * 3600000),
          closureNotes: 'All welding works completed. Area inspected — no smouldering found. Fire watch maintained 60 minutes post-works. Area returned to normal use.',
          workCompletedSatisfactorily: true, createdByName: 'James Fletcher',
        },
        {
          id: `ptw-demo-${batchId}-002`,
          permitNumber: `DEMO-WAH-${batchId}-002`,
          permitType: 'working_at_height',
          workDescription: 'Replacement of guttering and downpipes on the north face of Building A at approximately 8m. Access via podium scaffold erected and inspected by approved scaffolding contractor.',
          workLocation: 'North Elevation — Building A Roofline',
          contractorCompanyName: 'SafeWork Facilities UK', contractorWorkerName: 'Mike Doyle',
          staffName: 'Louise Grant',
          plannedStartDate: oneWeekAgo.toISOString().slice(0,10), plannedStartTime: '07:30',
          plannedEndDate:   tomorrow.toISOString().slice(0,10),   plannedEndTime:   '16:30',
          permitValidFrom: oneWeekAgo, permitValidUntil: new Date(tomorrow.getTime() + 17 * 3600000),
          status: 'active',
          authorisedByName: 'Neil Baxter', authorisedAt: new Date(oneWeekAgo.getTime() - 2 * 3600000),
          authNotes: 'Scaffold inspection certificate provided and on file (valid). Exclusion zone established below works area. All ground workers briefed on overhead works.',
          closedByName: null, closedAt: null, closureNotes: null, workCompletedSatisfactorily: null,
          createdByName: 'Louise Grant',
        },
        {
          id: `ptw-demo-${batchId}-003`,
          permitNumber: `DEMO-CS-${batchId}-003`,
          permitType: 'confined_space',
          workDescription: 'Inspection and CCTV drainage survey of foul water manhole MH-07 in the south car park. Required following ground movement investigation by structural engineer.',
          workLocation: 'South Car Park — Manhole MH-07',
          contractorCompanyName: 'Delta Technical Services', contractorWorkerName: 'Phil Asher',
          staffName: 'Stuart Nolan',
          plannedStartDate: tomorrow.toISOString().slice(0,10), plannedStartTime: '09:00',
          plannedEndDate:   tomorrow.toISOString().slice(0,10), plannedEndTime:   '14:00',
          permitValidFrom: tomorrow, permitValidUntil: new Date(tomorrow.getTime() + 5 * 3600000),
          status: 'authorised',
          authorisedByName: 'Neil Baxter', authorisedAt: new Date(now.getTime() - 3600000),
          authNotes: 'Attendant to remain topside at all times. Gas monitoring equipment required — contractor to confirm calibration certificate on arrival. Emergency rescue plan submitted and approved.',
          closedByName: null, closedAt: null, closureNotes: null, workCompletedSatisfactorily: null,
          createdByName: 'Stuart Nolan',
        },
        {
          id: `ptw-demo-${batchId}-004`,
          permitNumber: `DEMO-ELEC-${batchId}-004`,
          permitType: 'electrical_isolation',
          workDescription: 'Isolation and replacement of faulty MCBs in distribution board DB-04 serving the east warehouse lighting circuit. Works by Approved Electrician (17th Edition BS 7671 qualified).',
          workLocation: 'East Warehouse — Electrical Room ER-02',
          contractorCompanyName: 'Apex Maintenance Group', contractorWorkerName: 'Steve Calder',
          staffName: 'Chris Patel',
          plannedStartDate: nextWeek.toISOString().slice(0,10), plannedStartTime: '06:00',
          plannedEndDate:   nextWeek.toISOString().slice(0,10), plannedEndTime:   '12:00',
          permitValidFrom: nextWeek, permitValidUntil: new Date(nextWeek.getTime() + 6 * 3600000),
          status: 'draft',
          authorisedByName: null, authorisedAt: null, authNotes: null,
          closedByName: null, closedAt: null, closureNotes: null, workCompletedSatisfactorily: null,
          createdByName: 'Chris Patel',
        },
        {
          id: `ptw-demo-${batchId}-005`,
          permitNumber: `DEMO-GEN-${batchId}-005`,
          permitType: 'general',
          workDescription: 'Installation of new CCTV cameras on Building B exterior (ground and 1st floor only). Cable runs routed through existing trunking within the building — no structural work.',
          workLocation: 'Building B — Exterior Walls and Internal Trunking Routes',
          contractorCompanyName: 'SecureIT Solutions', contractorWorkerName: 'Gary Blaine',
          staffName: 'Ben Ashworth',
          plannedStartDate: twoWeeksAgo.toISOString().slice(0,10), plannedStartTime: '09:00',
          plannedEndDate:   oneWeekAgo.toISOString().slice(0,10),  plannedEndTime:   '17:00',
          permitValidFrom: twoWeeksAgo, permitValidUntil: oneWeekAgo,
          status: 'closed',
          authorisedByName: 'Ben Ashworth', authorisedAt: new Date(twoWeeksAgo.getTime() - 30 * 60000),
          authNotes: 'Standard install — no high-risk activities. Contractor to contain all arisings and leave site clean each day.',
          closedByName: 'Ben Ashworth', closedAt: oneWeekAgo,
          closureNotes: '8 cameras installed and commissioned. As-built drawing provided to IT team. Site left clean and tidy.',
          workCompletedSatisfactorily: true, createdByName: 'Ben Ashworth',
        },
      ];

      for (const permit of samplePermits) {
        await pool.query(`
          INSERT INTO "${schemaName}".permit_to_work (
            id, permit_number, permit_type, work_description, work_location,
            contractor_company_name, contractor_worker_name, staff_name,
            planned_start_date, planned_start_time, planned_end_date, planned_end_time,
            permit_valid_from, permit_valid_until, status,
            authorised_by_name, authorised_at, auth_notes,
            closed_by_name, closed_at, closure_notes, work_completed_satisfactorily,
            created_by_name, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())
          ON CONFLICT (id) DO NOTHING`,
          [permit.id, permit.permitNumber, permit.permitType, permit.workDescription, permit.workLocation,
           permit.contractorCompanyName, permit.contractorWorkerName, permit.staffName,
           permit.plannedStartDate, permit.plannedStartTime, permit.plannedEndDate, permit.plannedEndTime,
           permit.permitValidFrom, permit.permitValidUntil, permit.status,
           permit.authorisedByName ?? null, permit.authorisedAt ?? null, permit.authNotes ?? null,
           permit.closedByName ?? null, permit.closedAt ?? null, permit.closureNotes ?? null,
           permit.workCompletedSatisfactorily ?? null, permit.createdByName ?? null]
        );
        permitsAdded++;
      }
      logger.info(`✅ Permit to Work sample data: ${permitsAdded} permits`);
    } catch (e: any) {
      logger.warn(`Sample Permit to Work data failed: ${e.message}`);
    }

    res.json({
      success: true,
      message: `Sample data loaded: ${staffAdded} staff, ${visitorsAdded} visitors, ${contractorsAdded} contractor companies (${workersAdded} workers), ${membersAdded} members, ${raAssessmentsAdded} risk assessments, ${auditTemplatesAdded} audit templates (${auditRecordsAdded} records, ${auditActionsAdded} actions), ${permitsAdded} permits — plus HR, certifications, visits, pre-bookings and attendance records`,
      results: { staffAdded, visitorsAdded, contractorsAdded, workersAdded, membersAdded, hrDataAdded: staffIds.length > 0, raAssessmentsAdded, auditTemplatesAdded, auditRecordsAdded, auditActionsAdded, permitsAdded },
    });
  } catch (error) {
    logger.error('Error loading sample data:', error);
    res.status(500).json({ error: 'Failed to load sample data', details: (error as any).message });
  }
});

app.post("/api/import/clear-sample-data", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const customerDb2 = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(req.customerId);
      const pool = (customerDb2 as any).$client ?? (customerDb2 as any).session?.client;

      // ── Step 1: Collect all sample entity IDs (@example.com marker) ────────
      const staffRes   = await pool.query(`SELECT id FROM "${schemaName}".staff WHERE email LIKE '%@example.com'`);
      const workerRes  = await pool.query(`SELECT id FROM "${schemaName}".contractor_workers WHERE email LIKE '%@example.com'`);
      const companyRes = await pool.query(`SELECT id FROM "${schemaName}".contractor_companies WHERE contact_email LIKE '%@example.com'`);
      const visitorRes = await pool.query(`SELECT id FROM "${schemaName}".visitors WHERE email LIKE '%@example.com'`);

      const staffIds:   string[] = staffRes.rows.map((r: any) => r.id);
      const workerIds:  string[] = workerRes.rows.map((r: any) => r.id);
      const companyIds: string[] = companyRes.rows.map((r: any) => r.id);
      const visitorIds: string[] = visitorRes.rows.map((r: any) => r.id);

      const deleted: Record<string, number> = {};
      const del = async (table: string, sql: string, params: any[] = []) => {
        try {
          const r = await pool.query(`DELETE FROM "${schemaName}".${table} ${sql}`, params);
          deleted[table] = (deleted[table] ?? 0) + (r.rowCount ?? 0);
        } catch (e) { logger.warn(`Clear sample: ${table} — ${(e as any).message}`); }
      };
      const inP = (ids: string[]) => ids.map((_, i) => `$${i + 1}`).join(',');

      // ── Step 2: Delete worker-dependent rows first (NO ACTION FKs) ─────────
      if (workerIds.length > 0) {
        const wP = inP(workerIds);
        await del('worker_certifications',      `WHERE worker_id IN (${wP})`, workerIds);
        await del('worker_competencies',         `WHERE worker_id IN (${wP})`, workerIds);
        await del('worker_document_assignments', `WHERE worker_id IN (${wP})`, workerIds);
        await del('induction_tokens',            `WHERE worker_id IN (${wP})`, workerIds);
        await del('worker_notes',                `WHERE worker_id IN (${wP})`, workerIds);
        try {
          const r = await pool.query(
            `DELETE FROM "${schemaName}".worker_document_acceptances WHERE worker_id IN (${wP}) OR submitted_by IN (${wP})`,
            workerIds
          );
          deleted['worker_document_acceptances'] = r.rowCount ?? 0;
        } catch (e) { logger.warn(`Clear sample: worker_document_acceptances — ${(e as any).message}`); }
        await del('co2_records',          `WHERE worker_id IN (${wP})`, workerIds);
        await del('local_labour_records', `WHERE worker_id IN (${wP})`, workerIds);
        // Lone worker sessions for sample workers
        await del('lone_worker_sessions', `WHERE person_email LIKE '%@example.com'`);
      }

      // ── Step 3: Delete company-dependent rows (NO ACTION FKs) ─────────────
      if (companyIds.length > 0) {
        const cP = inP(companyIds);
        await del('co2_records',              `WHERE company_id IN (${cP})`, companyIds);
        await del('company_notes',            `WHERE company_id IN (${cP})`, companyIds);
        await del('enhanced_company_details', `WHERE company_id IN (${cP})`, companyIds);
        await del('local_labour_records',     `WHERE company_id IN (${cP})`, companyIds);
        await del('rams_documents',           `WHERE company_id IN (${cP})`, companyIds);
        try {
          const r = await pool.query(
            `DELETE FROM "${schemaName}".cdm_projects WHERE company_id IN (${cP}) OR principal_contractor_id IN (${cP})`,
            companyIds
          );
          deleted['cdm_projects'] = r.rowCount ?? 0;
        } catch (e) { logger.warn(`Clear sample: cdm_projects — ${(e as any).message}`); }
        // Permit to work linked to sample companies or workers
        const ptwConditions: string[] = [];
        const ptwParams: string[] = [];
        let pp = 1;
        ptwConditions.push(`contractor_company_id IN (${companyIds.map(() => `$${pp++}`).join(',')})`);
        ptwParams.push(...companyIds);
        if (workerIds.length > 0) {
          ptwConditions.push(`contractor_worker_id IN (${workerIds.map(() => `$${pp++}`).join(',')})`);
          ptwParams.push(...workerIds);
        }
        try {
          const r = await pool.query(`DELETE FROM "${schemaName}".permit_to_work WHERE ${ptwConditions.join(' OR ')}`, ptwParams);
          deleted['permit_to_work'] = r.rowCount ?? 0;
        } catch (e) { logger.warn(`Clear sample: permit_to_work — ${(e as any).message}`); }
        // Contractor pre-bookings
        await del('contractor_prebookings', `WHERE contact_email LIKE '%@example.com'`);
      }

      // ── Step 4: contractor_visits (NO ACTION FKs to staff+workers+companies) ──
      {
        const conditions: string[] = [];
        const params: string[] = [];
        let p = 1;
        if (staffIds.length > 0)   { conditions.push(`host_staff_id IN (${staffIds.map(  () => `$${p++}`).join(',')})`); params.push(...staffIds);   }
        if (workerIds.length > 0)  { conditions.push(`worker_id IN (${workerIds.map(     () => `$${p++}`).join(',')})`); params.push(...workerIds);  }
        if (companyIds.length > 0) { conditions.push(`company_id IN (${companyIds.map(   () => `$${p++}`).join(',')})`); params.push(...companyIds); }
        if (conditions.length > 0) {
          try {
            const r = await pool.query(`DELETE FROM "${schemaName}".contractor_visits WHERE ${conditions.join(' OR ')}`, params);
            deleted['contractor_visits'] = r.rowCount ?? 0;
          } catch (e) { logger.warn(`Clear sample: contractor_visits — ${(e as any).message}`); }
        }
      }

      // ── Step 4b: Visitor history + pre-bookings ───────────────────────────
      if (visitorIds.length > 0) {
        const vP = inP(visitorIds);
        await del('visitor_history', `WHERE visitor_id IN (${vP})`, visitorIds);
      }
      await del('pre_bookings', `WHERE visitor_email LIKE '%@example.com'`);

      // ── Step 5: Staff HR records + sessions ──────────────────────────────
      if (staffIds.length > 0) {
        const sP = inP(staffIds);
        for (const t of ['right_to_work','staff_dbs','leave_requests','absence_records','staff_training_records','staff_documents','appraisals','onboarding_checklists','leaver_checklists','staff_sessions']) {
          await del(t, `WHERE staff_id IN (${sP})`, staffIds);
        }
        try {
          await pool.query(`UPDATE "${schemaName}".staff SET employment_status='active', is_active=TRUE, contract_end_date=NULL WHERE id IN (${sP})`, staffIds);
        } catch (e) { logger.warn(`Clear sample: staff reset — ${(e as any).message}`); }
      }

      // ── Step 6: Main records (dependency order: workers → companies → visitors → members → staff) ──
      await del('contractor_workers',   `WHERE email LIKE '%@example.com'`);
      if (companyIds.length > 0) {
        await del('contractor_companies', `WHERE id IN (${inP(companyIds)})`, companyIds);
      }
      await del('visitors', `WHERE email LIKE '%@example.com'`);
      await del('members',  `WHERE email LIKE '%@example.com'`);
      if (staffIds.length > 0) {
        await del('staff', `WHERE id IN (${inP(staffIds)})`, staffIds);
      }

      // ── Step 7: Training requirements ─────────────────────────────────────
      try {
        const courses = ['Fire Safety Awareness','Manual Handling','Health & Safety Induction','GDPR Data Protection','First Aid Awareness'];
        const r = await pool.query(
          `DELETE FROM "${schemaName}".training_requirements WHERE course_name IN (${courses.map((_, i) => `$${i + 1}`).join(',')})`,
          courses
        );
        deleted['training_requirements'] = r.rowCount ?? 0;
      } catch (e) { logger.warn(`Clear sample: training_requirements — ${(e as any).message}`); }

      // ── Step 8: Old-style sample data cleanup (pre-@example.com era) ───────
      // Cleans up data loaded by older versions of the sample data loader that
      // used realistic-looking emails instead of @example.com
      try {
        // Old-style visitors: had purpose='Demo Visit' or no purpose with high-frequency emails
        const oldVisitorRes = await pool.query(`SELECT id FROM "${schemaName}".visitors WHERE purpose = 'Demo Visit' OR email LIKE '%@memberco.com'`);
        const oldVisitorIds: string[] = oldVisitorRes.rows.map((r: any) => r.id);
        if (oldVisitorIds.length > 0) {
          const ovP = inP(oldVisitorIds);
          await pool.query(`DELETE FROM "${schemaName}".visitor_history WHERE visitor_id IN (${ovP})`, oldVisitorIds);
          await pool.query(`DELETE FROM "${schemaName}".pre_bookings WHERE visitor_id IN (${ovP})`, oldVisitorIds);
          await pool.query(`DELETE FROM "${schemaName}".visitors WHERE id IN (${ovP})`, oldVisitorIds);
          deleted['visitors_old_style'] = oldVisitorIds.length;
        }
      } catch (e) { logger.warn(`Clear sample (old): visitors — ${(e as any).message}`); }

      try {
        // Old-style members: @memberco.com or duplicate membership numbers
        await pool.query(`DELETE FROM "${schemaName}".members WHERE email LIKE '%@memberco.com'`);
        // Members that have the same membership_number as another member (old duplicate loads)
        await pool.query(
          `DELETE FROM "${schemaName}".members WHERE id IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY membership_number ORDER BY created_at) AS rn
              FROM "${schemaName}".members WHERE membership_number IS NOT NULL
            ) sub WHERE rn > 1
          )`
        );
      } catch (e) { logger.warn(`Clear sample (old): members — ${(e as any).message}`); }

      try {
        // Old-style contractor data: companies/workers loaded by older sample data code
        // that used realistic-looking .co.uk emails instead of @example.com.
        // Identified by a fixed list of known sample company names.
        const sampleCompanyNames = [
          'BuildRight Contractors Ltd','SafeWork Facilities UK','Delta Technical Services',
          'Apex Maintenance Group','Horizon Build & Civil',
          'BuildRight Construction Ltd','SparkTech Electrical Services','SteelFrame Engineering',
          'PipeFix Plumbing Ltd','SafeClean Environmental','TopCoat Decorators',
          'SecureIT Solutions','CoolAir Services Ltd','FireGuard UK Ltd',
          'BuildRight Co','Volt-Safe Electrical Ltd','AquaSafe Hygiene Ltd',
          'SecureAccess Systems',
        ];
        const oldCoRes = await pool.query(
          `SELECT id FROM "${schemaName}".contractor_companies WHERE company_name = ANY($1)`,
          [sampleCompanyNames]
        );
        if (oldCoRes.rows.length > 0) {
          const oldCoIds: string[] = oldCoRes.rows.map((r: any) => r.id);
          const oP = inP(oldCoIds);
          // Collect all workers for these companies
          const oldWorkerRes = await pool.query(`SELECT id FROM "${schemaName}".contractor_workers WHERE company_id IN (${oP})`, oldCoIds);
          const oldWorkerIds: string[] = oldWorkerRes.rows.map((r: any) => r.id);
          if (oldWorkerIds.length > 0) {
            const owP = inP(oldWorkerIds);
            // Clear every FK that references workers (same list as new-style cleanup)
            for (const t of ['worker_certifications','worker_competencies','worker_document_assignments','induction_tokens','co2_records','local_labour_records','worker_notes']) {
              try { await pool.query(`DELETE FROM "${schemaName}".${t} WHERE worker_id IN (${owP})`, oldWorkerIds); } catch (e) { logger.warn(`Clear old-style: ${t} — ${(e as any).message}`); }
            }
            try {
              await pool.query(
                `DELETE FROM "${schemaName}".worker_document_acceptances WHERE worker_id IN (${owP}) OR submitted_by IN (${owP})`,
                oldWorkerIds
              );
            } catch (e) { logger.warn(`Clear old-style: worker_document_acceptances — ${(e as any).message}`); }
            // Permit to work referencing these workers
            try { await pool.query(`DELETE FROM "${schemaName}".permit_to_work WHERE contractor_worker_id IN (${owP})`, oldWorkerIds); } catch (e) { logger.warn(`Clear old-style: permit_to_work (worker) — ${(e as any).message}`); }
          }
          // Permit to work referencing these companies
          try { await pool.query(`DELETE FROM "${schemaName}".permit_to_work WHERE contractor_company_id IN (${oP})`, oldCoIds); } catch (e) { logger.warn(`Clear old-style: permit_to_work (company) — ${(e as any).message}`); }
          // Contractor visits for these companies (covers worker_id fk too via cascade logic)
          try { await pool.query(`DELETE FROM "${schemaName}".contractor_visits WHERE company_id IN (${oP})`, oldCoIds); } catch (e) { logger.warn(`Clear old-style: contractor_visits — ${(e as any).message}`); }
          // Pre-bookings
          try { await pool.query(`DELETE FROM "${schemaName}".contractor_prebookings WHERE company_name = ANY($1)`, [sampleCompanyNames]); } catch (e) { logger.warn(`Clear old-style: contractor_prebookings — ${(e as any).message}`); }
          // Company-level dependents
          for (const t of ['co2_records','company_notes','enhanced_company_details','local_labour_records','rams_documents']) {
            try { await pool.query(`DELETE FROM "${schemaName}".${t} WHERE company_id IN (${oP})`, oldCoIds); } catch (e) { logger.warn(`Clear old-style: ${t} — ${(e as any).message}`); }
          }
          try {
            await pool.query(`DELETE FROM "${schemaName}".cdm_projects WHERE company_id IN (${oP}) OR principal_contractor_id IN (${oP})`, oldCoIds);
          } catch (e) { logger.warn(`Clear old-style: cdm_projects — ${(e as any).message}`); }
          // Now safe to delete workers and companies
          if (oldWorkerIds.length > 0) {
            try { await pool.query(`DELETE FROM "${schemaName}".contractor_workers WHERE company_id IN (${oP})`, oldCoIds); } catch (e) { logger.warn(`Clear old-style: contractor_workers — ${(e as any).message}`); }
          }
          try { await pool.query(`DELETE FROM "${schemaName}".contractor_companies WHERE id IN (${oP})`, oldCoIds); } catch (e) { logger.warn(`Clear old-style: contractor_companies — ${(e as any).message}`); }
          deleted['old_style_contractors'] = oldCoIds.length;
        }
      } catch (e) { logger.warn(`Clear sample (old): contractors — ${(e as any).message}`); }

      // ── RA Builder sample data cleanup ────────────────────────────────────
      try {
        const raRes = await pool.query(`SELECT id FROM "${schemaName}".ra_builder_assessments WHERE id LIKE 'ra-demo-%'`);
        const raIds: string[] = raRes.rows.map((r: any) => r.id);
        if (raIds.length > 0) {
          const rP = inP(raIds);
          await pool.query(`DELETE FROM "${schemaName}".ra_builder_hazards WHERE assessment_id IN (${rP})`, raIds);
          await pool.query(`DELETE FROM "${schemaName}".ra_builder_assessments WHERE id IN (${rP})`, raIds);
          deleted['ra_builder_assessments'] = raIds.length;
        }
      } catch (e) { logger.warn(`Clear sample: ra_builder — ${(e as any).message}`); }

      // ── Audit & Inspection sample data cleanup ─────────────────────────────
      try {
        // Delete corrective actions created with demo email addresses (child of record items)
        await pool.query(`DELETE FROM "${schemaName}".audit_corrective_actions WHERE assigned_email LIKE '%@example.com'`);
        // Delete corrective actions with demo-prefixed IDs
        const demoCaRes = await pool.query(`SELECT id FROM "${schemaName}".audit_corrective_actions WHERE id LIKE 'audit-demo-%'`);
        if (demoCaRes.rows.length > 0) {
          const caIds: string[] = demoCaRes.rows.map((r: any) => r.id);
          await pool.query(`DELETE FROM "${schemaName}".audit_corrective_actions WHERE id IN (${inP(caIds)})`, caIds);
        }
        // Audit records created with demo-prefixed IDs (record items + corrective actions cascade)
        const demoRecRes = await pool.query(`SELECT id FROM "${schemaName}".audit_records WHERE id LIKE 'audit-demo-%'`);
        if (demoRecRes.rows.length > 0) {
          const recIds: string[] = demoRecRes.rows.map((r: any) => r.id);
          const rP = inP(recIds);
          await pool.query(`DELETE FROM "${schemaName}".audit_corrective_actions WHERE audit_id IN (${rP})`, recIds);
          await pool.query(`DELETE FROM "${schemaName}".audit_record_items WHERE audit_id IN (${rP})`, recIds);
          await pool.query(`DELETE FROM "${schemaName}".audit_records WHERE id IN (${rP})`, recIds);
          deleted['audit_records'] = recIds.length;
        }
        // Audit templates with demo-prefixed IDs (template items cascade, records already deleted above)
        const demoTmplRes = await pool.query(`SELECT id FROM "${schemaName}".audit_templates WHERE id LIKE 'audit-demo-%'`);
        if (demoTmplRes.rows.length > 0) {
          const tmplIds: string[] = demoTmplRes.rows.map((r: any) => r.id);
          const tP = inP(tmplIds);
          await pool.query(`DELETE FROM "${schemaName}".audit_template_items WHERE template_id IN (${tP})`, tmplIds);
          await pool.query(`DELETE FROM "${schemaName}".audit_templates WHERE id IN (${tP})`, tmplIds);
          deleted['audit_templates'] = tmplIds.length;
        }
        logger.info(`✅ Audit sample data cleared`);
      } catch (e) { logger.warn(`Clear sample: audit engine — ${(e as any).message}`); }

      // ── Permit to Work sample data cleanup ─────────────────────────────────
      // New-style demo permits: identified by DEMO- prefix in permit_number
      try {
        const demoPtwRes = await pool.query(`SELECT id FROM "${schemaName}".permit_to_work WHERE permit_number LIKE 'DEMO-%'`);
        if (demoPtwRes.rows.length > 0) {
          const demoPtwIds: string[] = demoPtwRes.rows.map((r: any) => r.id);
          const pP = inP(demoPtwIds);
          try { await pool.query(`DELETE FROM "${schemaName}".permit_checklist WHERE permit_id IN (${pP})`, demoPtwIds); } catch (_) { /* table may not exist */ }
          try { await pool.query(`DELETE FROM "${schemaName}".permit_attachments WHERE permit_id IN (${pP})`, demoPtwIds); } catch (_) { /* table may not exist */ }
          await pool.query(`DELETE FROM "${schemaName}".permit_to_work WHERE id IN (${pP})`, demoPtwIds);
          deleted['permit_to_work_demo'] = demoPtwIds.length;
        }
        // Also delete permits with demo-prefixed IDs (belt-and-braces)
        const demoPtwIdRes = await pool.query(`SELECT id FROM "${schemaName}".permit_to_work WHERE id LIKE 'ptw-demo-%'`);
        if (demoPtwIdRes.rows.length > 0) {
          const extraIds: string[] = demoPtwIdRes.rows.map((r: any) => r.id);
          const eP = inP(extraIds);
          try { await pool.query(`DELETE FROM "${schemaName}".permit_checklist WHERE permit_id IN (${eP})`, extraIds); } catch (_) { /* table may not exist */ }
          try { await pool.query(`DELETE FROM "${schemaName}".permit_attachments WHERE permit_id IN (${eP})`, extraIds); } catch (_) { /* table may not exist */ }
          await pool.query(`DELETE FROM "${schemaName}".permit_to_work WHERE id IN (${eP})`, extraIds);
          deleted['permit_to_work_demo'] = (deleted['permit_to_work_demo'] ?? 0) + extraIds.length;
        }
        logger.info(`✅ Permit to Work demo data cleared`);
      } catch (e) { logger.warn(`Clear sample: permit_to_work demo — ${(e as any).message}`); }

      res.json({ success: true, message: 'Sample data cleared successfully', deleted });
    } catch (error) {
      logger.error('Error clearing sample data:', error);
      res.status(500).json({ error: 'Failed to clear sample data', details: (error as any).message });
    }
  });

}
