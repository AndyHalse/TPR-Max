import type { Express } from 'express';
import QRCode from 'qrcode';
import { requireAuth } from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

/** Build a self-contained printable HTML page for a visitor or contractor pass. */
async function buildPassPage(opts: {
  title: string;
  headerLabel: string;
  headerColor: string;
  name: string;
  subName?: string;
  details: { label: string; value: string }[];
  qrData: string;
  companyName: string;
  companyAddress?: string;
  logoUrl: string | null;
  footerId: string;
}): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(opts.qrData, {
    width: 150,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  });
  const logoHtml = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="Logo" style="max-width:60px;max-height:40px;object-fit:contain;" />`
    : `<div style="width:48px;height:36px;background:${opts.headerColor};border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:13px;">CO</div>`;
  const detailsHtml = opts.details
    .filter(d => d.value)
    .map(d => `<p style="margin:1px 0;font-size:10px;color:#374151;"><strong>${d.label}:</strong> ${d.value}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${opts.title}</title>
  <style>
    @page { size: 95mm 65mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; width: 95mm; height: 65mm; overflow: hidden; }
    .pass { width: 95mm; height: 65mm; padding: 6px 8px; display: flex; flex-direction: column; background: #fff; border: 1px solid #e5e7eb; }
    .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 4px; border-bottom: 2px solid ${opts.headerColor}; margin-bottom: 4px; }
    .header-label { font-size: 11px; font-weight: bold; color: ${opts.headerColor}; letter-spacing: 1px; }
    .body { display: flex; flex: 1; gap: 6px; }
    .body-left { flex: 1; }
    .name { font-size: 14px; font-weight: bold; color: #111827; line-height: 1.2; }
    .subname { font-size: 10px; color: #6b7280; margin-top: 1px; }
    .details { margin-top: 4px; }
    .qr { flex-shrink: 0; width: 60px; display: flex; align-items: center; justify-content: center; }
    .qr img { width: 60px; height: 60px; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 3px; border-top: 1px solid #e5e7eb; margin-top: 3px; font-size: 9px; color: #9ca3af; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body onload="window.print()">
  <div class="pass">
    <div class="header">
      <div>
        <div class="header-label">${opts.headerLabel}</div>
        <div style="font-size:10px;color:#6b7280;">${opts.companyName}</div>
        ${opts.companyAddress ? `<div style="font-size:9px;color:#9ca3af;">${opts.companyAddress}</div>` : ''}
      </div>
      <div>${logoHtml}</div>
    </div>
    <div class="body">
      <div class="body-left">
        <div class="name">${opts.name}</div>
        ${opts.subName ? `<div class="subname">${opts.subName}</div>` : ''}
        <div class="details">${detailsHtml}</div>
      </div>
      <div class="qr"><img src="${qrDataUrl}" alt="QR Code" /></div>
    </div>
    <div class="footer">
      <span>ID: ${opts.footerId}</span>
      <span>${opts.companyName}</span>
    </div>
  </div>
</body>
</html>`;
}

export function registerPassRoutes(app: Express): void {
  // GET /api/passes/print/visitor/demo — demo visitor pass (no auth needed for design preview)
  app.get("/api/passes/print/visitor/demo", async (req, res) => {
    try {
      const html = await buildPassPage({
        title: "Visitor Pass — Demo",
        headerLabel: "VISITOR PASS",
        headerColor: "#1a56db",
        name: "John Smith",
        subName: "Tech Solutions Ltd",
        details: [
          { label: "Host", value: "Sarah Johnson" },
          { label: "Purpose", value: "Demo / Design Preview" },
          { label: "Time In", value: new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) },
        ],
        qrData: "DEMO-VISITOR-001",
        companyName: "Demo Company",
        companyAddress: "123 Demo Street, London",
        logoUrl: null,
        footerId: "DEMO0001",
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      logger.error('Browser print demo error:', error);
      res.status(500).send("<h1>Failed to generate demo pass</h1>");
    }
  });

  // GET /api/passes/print/visitor/:visitorId — visitor pass
  app.get("/api/passes/print/visitor/:visitorId", requireAuth, async (req, res) => {
    try {
      const { visitorId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      const visitor = await databaseService.getVisitorById(context, visitorId);
      if (!visitor) return res.status(404).send('<h1>Visitor not found</h1>');

      const settings = await simpleDatabaseService.getCompanySettings(context);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const logoUrl = settings?.logoUrl ? `${baseUrl}${settings.logoUrl}` : null;

      let hostName = '';
      if ((visitor as any).hostStaffId) {
        try {
          const host = await databaseService.getStaffById(context, (visitor as any).hostStaffId);
          if (host) hostName = `${host.firstName} ${host.lastName}`;
        } catch { /* ignore */ }
      }

      const checkinTime = visitor.checkedInAt
        ? new Date(visitor.checkedInAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/London' })
        : new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/London' });

      const html = await buildPassPage({
        title: `Visitor Pass — ${visitor.firstName} ${visitor.lastName}`,
        headerLabel: 'VISITOR PASS',
        headerColor: '#1a56db',
        name: `${visitor.firstName} ${visitor.lastName}`,
        subName: visitor.company || undefined,
        details: [
          { label: 'Host', value: hostName },
          { label: 'Purpose', value: visitor.purpose || '' },
          { label: 'Time In', value: checkinTime },
        ],
        qrData: visitor.qrCode || visitor.id,
        companyName: settings?.companyName || 'Company Name',
        companyAddress: settings?.address || '',
        logoUrl,
        footerId: visitor.id.substring(0, 8).toUpperCase(),
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      logger.error('Browser print visitor error:', error);
      res.status(500).send('<h1>Failed to generate visitor pass</h1>');
    }
  });

  // GET /api/passes/print/contractor/:workerId — contractor pass
  app.get("/api/passes/print/contractor/:workerId", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) return res.status(404).send('<h1>Contractor worker not found</h1>');

      const settings = await simpleDatabaseService.getCompanySettings(context);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const logoUrl = settings?.logoUrl ? `${baseUrl}${settings.logoUrl}` : null;

      const checkinTime = worker.checkedInAt
        ? new Date(worker.checkedInAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/London' })
        : new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/London' });

      // Gate on active card_issues — never trust the raw column alone
      const db = await customerDbService.getCustomerDatabase(req.customerId);
      const activeCards = await db.execute(
        `SELECT id FROM card_issues WHERE worker_id = '${worker.id.replace(/'/g, "''")}' AND status = 'active' LIMIT 1`
      );
      const hasActiveCard = (activeCards.rows || []).length > 0;
      const cardStatusLabel = !hasActiveCard ? 'CLEARED'
        : worker.currentCardStatus === 'yellow' ? 'ADVISORY'
        : worker.currentCardStatus === 'red' ? 'RESTRICTED'
        : 'CLEARED';

      const html = await buildPassPage({
        title: `Contractor Pass — ${worker.firstName} ${worker.lastName}`,
        headerLabel: 'CONTRACTOR PASS',
        headerColor: '#ea580c',
        name: `${worker.firstName} ${worker.lastName}`,
        subName: (worker as any).companyName || undefined,
        details: [
          { label: 'Company', value: (worker as any).companyName || '' },
          { label: 'Time In', value: checkinTime },
          { label: 'Status', value: cardStatusLabel },
          { label: 'Induction', value: worker.inductionCompleted ? 'Complete' : 'Required' },
        ],
        qrData: worker.qrCode || worker.id,
        companyName: settings?.companyName || 'Company Name',
        companyAddress: settings?.address || '',
        logoUrl,
        footerId: worker.id.substring(0, 8).toUpperCase(),
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      logger.error('Browser print contractor error:', error);
      res.status(500).send('<h1>Failed to generate contractor pass</h1>');
    }
  });

  // QR Reader device management
  app.get('/api/qr-readers/devices', async (req, res) => {
    try {
      const { qrReaderService } = await import('../qrReaderService');
      const devices = await qrReaderService.detectDevices();
      res.json({ success: true, devices, count: devices.length, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('QR reader device detection error:', error);
      res.status(500).json({ success: false, message: 'Failed to detect QR reader devices', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/qr-readers/test', async (req, res) => {
    try {
      const { qrReaderService } = await import('../qrReaderService');
      const { deviceId } = req.body;
      const result = await qrReaderService.testConnection(deviceId);
      res.json({ success: result.success, message: result.message, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('QR reader test error:', error);
      res.status(500).json({ success: false, message: 'Failed to test QR reader connection', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/qr-readers/detect', async (req, res) => {
    try {
      const { qrReaderService } = await import('../qrReaderService');
      const devices = await qrReaderService.detectDevices();
      res.json({ success: true, message: `Device scan complete. Found ${devices.length} QR reader devices.`, devices, count: devices.length, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('QR reader detection error:', error);
      res.status(500).json({ success: false, message: 'Failed to detect QR reader devices', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // QR Code Scan Processing Routes
  app.post('/api/qr-scan/visitor', async (req, res) => {
    try {
      const { qrReaderService } = await import('../qrReaderService');
      const { qrData } = req.body;
      if (!qrData) return res.status(400).json({ success: false, message: 'QR code data is required' });
      const result = await qrReaderService.processVisitorScan(qrData);
      logger.info(`Visitor QR scan processed: ${qrData} -> ${result.action || 'unknown'}`);
      res.json({ success: result.success, message: result.message, action: result.action, qrData, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Visitor QR scan error:', error);
      res.status(500).json({ success: false, message: 'Failed to process visitor QR scan', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/qr-scan/staff', async (req, res) => {
    try {
      const { qrReaderService } = await import('../qrReaderService');
      const { qrData } = req.body;
      if (!qrData) return res.status(400).json({ success: false, message: 'QR code data is required' });
      const result = await qrReaderService.processStaffScan(qrData);
      logger.info(`Staff QR scan processed: ${qrData} -> ${result.action || 'unknown'}`);
      res.json({ success: result.success, message: result.message, action: result.action, qrData, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Staff QR scan error:', error);
      res.status(500).json({ success: false, message: 'Failed to process staff QR scan', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/qr-scan/contractor', async (req, res) => {
    try {
      const { qrReaderService } = await import('../qrReaderService');
      const { qrData } = req.body;
      if (!qrData) return res.status(400).json({ success: false, message: 'QR code data is required' });
      const result = await qrReaderService.processContractorScan(qrData);
      logger.info(`Contractor QR scan processed: ${qrData} -> ${result.action || 'unknown'}`);
      res.json({ success: result.success, message: result.message, action: result.action, qrData, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Contractor QR scan error:', error);
      res.status(500).json({ success: false, message: 'Failed to process contractor QR scan', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Universal camera QR scan
  app.post('/api/qr-scan/universal', requireAuth, async (req, res) => {
    try {
      const { qrData } = req.body;
      if (!qrData) return res.status(400).json({ success: false, message: 'QR code data is required' });

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);

      // 1. Try visitor pre-booking
      let preBooking: any = null;
      if (qrData.startsWith('PBK-')) {
        const pbId = qrData.replace('PBK-', '');
        const [found] = await customerDb.select().from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.id, pbId)).limit(1);
        preBooking = found;
      } else {
        const lookupCode = qrData.startsWith('PRE-') ? qrData.replace('PRE-', '') : qrData;
        const [found] = await customerDb.select().from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.qrCode, lookupCode)).limit(1);
        preBooking = found;
      }

      if (preBooking) {
        if (preBooking.isCheckedIn) {
          return res.json({
            success: false,
            personName: `${preBooking.visitorFirstName} ${preBooking.visitorLastName}`,
            personType: 'visitor',
            action: 'already_checked_in',
            message: `${preBooking.visitorFirstName} ${preBooking.visitorLastName} has already been checked in from this pre-booking.`
          });
        }

        let resolvedHostStaffId: string | null = null;
        if (preBooking.hostStaffId) {
          try {
            const hostStaff = await databaseService.getStaffById(context, preBooking.hostStaffId);
            resolvedHostStaffId = hostStaff ? preBooking.hostStaffId : null;
          } catch { resolvedHostStaffId = null; }
        }

        const visitor = await databaseService.createVisitor(context, {
          firstName: preBooking.visitorFirstName,
          lastName: preBooking.visitorLastName,
          email: preBooking.visitorEmail,
          company: preBooking.company,
          purpose: preBooking.purpose,
          carRegistration: null,
          hostStaffId: resolvedHostStaffId,
          isPreBooked: true,
          expectedDateTime: preBooking.visitDate,
          visitPurpose: preBooking.purpose,
          isCheckedIn: true,
        });
        await customerDb.update(isolatedSchema.preBookings)
          .set({ isCheckedIn: true, checkedInAt: new Date(), visitorId: visitor.id })
          .where(eq(isolatedSchema.preBookings.id, preBooking.id));
        return res.json({
          success: true,
          personName: `${visitor.firstName} ${visitor.lastName}`,
          personType: 'visitor',
          action: 'checked_in',
          message: `${visitor.firstName} ${visitor.lastName} checked in successfully from pre-booking.`,
          details: { company: visitor.company, purpose: visitor.purpose }
        });
      }

      // 2. Try contractor pre-booking
      const [contractorPb] = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(eq(isolatedSchema.contractorPreBookings.qrCode, qrData)).limit(1);
      if (contractorPb) {
        if (contractorPb.status === 'completed') {
          return res.json({
            success: false,
            personName: contractorPb.workerName,
            personType: 'contractor',
            action: 'already_checked_in',
            message: `${contractorPb.workerName} (${contractorPb.companyName}) is already checked in.`
          });
        }
        await customerDb.update(isolatedSchema.contractorPreBookings)
          .set({ status: 'completed' })
          .where(eq(isolatedSchema.contractorPreBookings.id, contractorPb.id));
        return res.json({
          success: true,
          personName: contractorPb.workerName,
          personType: 'contractor',
          action: 'checked_in',
          message: `${contractorPb.workerName} (${contractorPb.companyName}) checked in successfully.`,
          details: { company: contractorPb.companyName, purpose: contractorPb.purpose }
        });
      }

      // 3. Try existing visitor by QR code
      const visitor = await databaseService.getVisitorByQrCode(context, qrData);
      if (visitor) {
        const isCheckedIn = !visitor.isCheckedIn;
        await customerDb.update(isolatedSchema.visitors)
          .set({ isCheckedIn, checkedInAt: isCheckedIn ? new Date() : null } as any)
          .where(eq(isolatedSchema.visitors.id, visitor.id));
        return res.json({
          success: true,
          personName: `${visitor.firstName} ${visitor.lastName}`,
          personType: 'visitor',
          action: isCheckedIn ? 'checked_in' : 'checked_out',
          message: `${visitor.firstName} ${visitor.lastName} ${isCheckedIn ? 'checked in' : 'checked out'} successfully.`,
          details: { company: visitor.company }
        });
      }

      // 4. Try staff by QR code
      const staff = await databaseService.getStaffByQrCode(context, qrData);
      if (staff) {
        const isCheckedIn = !staff.isCheckedIn;
        await customerDb.update(isolatedSchema.staff)
          .set({ isCheckedIn } as any)
          .where(eq(isolatedSchema.staff.id, staff.id));
        return res.json({
          success: true,
          personName: `${staff.firstName} ${staff.lastName}`,
          personType: 'staff',
          action: isCheckedIn ? 'checked_in' : 'checked_out',
          message: `${staff.firstName} ${staff.lastName} ${isCheckedIn ? 'checked in' : 'checked out'} successfully.`,
          details: { department: staff.department }
        });
      }

      return res.status(404).json({ success: false, message: 'QR code not recognised. Please check the code and try again.' });
    } catch (error) {
      logger.error('Universal QR scan error:', error);
      res.status(500).json({ success: false, message: 'Failed to process QR scan.' });
    }
  });
}
