import JSZip from 'jszip';
import crypto from 'crypto';
import sharp from 'sharp';

export interface WalletPassParams {
  qrCode: string;
  staffName: string;
  department: string;
  employeeId: string;
  companyName: string;
  brandColor: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 79, g: 70, b: 229 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function sha1(data: Buffer): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

async function createSolidColorPng(size: number, hex: string): Promise<Buffer> {
  const { r, g, b } = hexToRgb(hex);
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  }).png().toBuffer();
}

export async function generateStaffWalletPass(params: WalletPassParams): Promise<Buffer> {
  const { r, g, b } = hexToRgb(params.brandColor || '#4f46e5');

  const passTypeId = process.env.APPLE_PASS_TYPE_ID || 'pass.com.tprmax.staff';
  const teamId = process.env.APPLE_TEAM_ID || 'TPRMAX001';

  const passJson = JSON.stringify({
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: params.qrCode,
    teamIdentifier: teamId,
    organizationName: params.companyName,
    description: `${params.companyName} Staff Check-In Pass`,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
    labelColor: 'rgb(210, 210, 255)',
    logoText: params.companyName,
    generic: {
      primaryFields: [
        { key: 'name', label: 'NAME', value: params.staffName },
      ],
      secondaryFields: [
        { key: 'dept', label: 'DEPARTMENT', value: params.department },
        { key: 'empid', label: 'EMPLOYEE ID', value: params.employeeId },
      ],
      auxiliaryFields: [
        { key: 'passtype', label: 'PASS TYPE', value: 'Staff Check-In Pass' },
      ],
      backFields: [
        {
          key: 'instructions',
          label: 'How to Use',
          value: 'Present the QR code at the reception kiosk to check in or out. Your pass is unique — do not share it.',
        },
        { key: 'issuedby', label: 'Issued By', value: params.companyName },
        { key: 'qrdata', label: 'Pass Code', value: params.qrCode },
      ],
    },
    barcode: {
      message: params.qrCode,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },
    barcodes: [
      {
        message: params.qrCode,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
      },
    ],
  }, null, 2);

  const passJsonBuf = Buffer.from(passJson, 'utf8');
  const icon1x = await createSolidColorPng(29, params.brandColor);
  const icon2x = await createSolidColorPng(58, params.brandColor);
  const icon3x = await createSolidColorPng(87, params.brandColor);
  const logo1x = await createSolidColorPng(160, params.brandColor);
  const logo2x = await createSolidColorPng(320, params.brandColor);

  const manifest: Record<string, string> = {
    'pass.json': sha1(passJsonBuf),
    'icon.png': sha1(icon1x),
    'icon@2x.png': sha1(icon2x),
    'icon@3x.png': sha1(icon3x),
    'logo.png': sha1(logo1x),
    'logo@2x.png': sha1(logo2x),
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBuf = Buffer.from(manifestJson, 'utf8');

  const zip = new JSZip();
  zip.file('pass.json', passJsonBuf);
  zip.file('manifest.json', manifestBuf);
  zip.file('icon.png', icon1x);
  zip.file('icon@2x.png', icon2x);
  zip.file('icon@3x.png', icon3x);
  zip.file('logo.png', logo1x);
  zip.file('logo@2x.png', logo2x);

  const certPem = process.env.APPLE_PASS_CERT;
  const keyPem = process.env.APPLE_PASS_KEY;
  const wwdrPem = process.env.APPLE_PASS_WWDR;

  if (certPem && keyPem && wwdrPem) {
    try {
      const forge = await import('node-forge');
      const cert = forge.pki.certificateFromPem(certPem);
      const key = forge.pki.privateKeyFromPem(keyPem);
      const wwdr = forge.pki.certificateFromPem(wwdrPem);

      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(manifestJson, 'utf8');
      p7.addCertificate(cert);
      p7.addCertificate(wwdr);
      p7.addSigner({
        key,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha1,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date() },
        ],
      });
      p7.sign({ detached: true });
      const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
      const signatureBuf = Buffer.from(derBytes, 'binary');
      zip.file('signature', signatureBuf);
      console.log('✅ Wallet pass signed with Apple certificate');
    } catch (err) {
      console.warn('⚠️ Apple certificate signing failed, generating unsigned pass:', err);
    }
  } else {
    console.log('ℹ️ Generating unsigned wallet pass (configure APPLE_PASS_CERT/KEY/WWDR env vars for signed passes)');
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
