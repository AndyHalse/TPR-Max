import { Visitor, Staff } from '../shared/schema';

interface ZPLElement {
  type: 'text' | 'qr_code' | 'logo' | 'line';
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  rotation?: number;
}

interface ZPLPrintData {
  visitor?: Visitor;
  contractor?: any;
  company?: string;
  host?: string;
  passType: 'visitor' | 'contractor';
  qrData?: string;
}

export class ZebraPrintService {
  /**
   * Generate ZPL commands for thermal pass printing (95mm x 65mm)
   * Standard DPI for Zebra printers: 203 DPI
   * 95mm = 759 dots, 65mm = 520 dots
   */
  async generateZPL(elements: ZPLElement[], data: ZPLPrintData): Promise<string> {
    console.log('🦓 Generating ZPL for Zebra printer...');
    
    let zpl = '';
    
    // Start ZPL sequence
    zpl += '^XA\n'; // Start of format
    
    // Set label dimensions (95mm x 65mm at 203 DPI)
    zpl += '^PW759\n'; // Print width in dots (95mm * 8 dots/mm)
    zpl += '^LL520\n'; // Label length in dots (65mm * 8 dots/mm)
    
    // Set print density and speed
    zpl += '^PR2\n'; // Print speed (2 = medium)
    zpl += '^MD10\n'; // Media darkness
    
    // Process each design element
    for (const element of elements) {
      zpl += this.generateElementZPL(element, data);
    }
    
    // End ZPL sequence
    zpl += '^XZ\n'; // End of format
    
    console.log('📝 Generated ZPL:', zpl.length, 'characters');
    return zpl;
  }

  /**
   * Generate ZPL for individual design elements
   */
  private generateElementZPL(element: ZPLElement, data: ZPLPrintData): string {
    let zpl = '';
    
    // Convert coordinates from designer (361x247) to Zebra dots (759x520)
    const x = Math.round((element.x / 361) * 759);
    const y = Math.round((element.y / 247) * 520);
    
    switch (element.type) {
      case 'text':
        zpl += this.generateTextZPL(element, data, x, y);
        break;
        
      case 'qr_code':
        zpl += this.generateQRZPL(element, data, x, y);
        break;
        
      case 'line':
        zpl += this.generateLineZPL(element, x, y);
        break;
        
      case 'logo':
        zpl += this.generateLogoZPL(element, x, y);
        break;
    }
    
    return zpl;
  }

  /**
   * Generate ZPL for text elements
   */
  private generateTextZPL(element: ZPLElement, data: ZPLPrintData, x: number, y: number): string {
    let content = element.content || '';
    
    // Replace variable placeholders with actual data
    if (content.includes('{{') || element.content === 'Visitor Name' || element.content === 'Company Name') {
      content = this.replaceVariables(content, data);
    }
    
    if (!content.trim()) return '';
    
    // Determine font size (Zebra uses different font scaling)
    const fontSize = element.fontSize || 12;
    let fontCode = '0'; // Default font
    let fontHeight = Math.max(20, Math.min(100, fontSize * 3)); // Scale for Zebra
    let fontWidth = Math.max(20, Math.min(100, fontSize * 2));
    
    if (fontSize >= 16) {
      fontCode = '0'; // Large font
      fontHeight = Math.min(100, fontSize * 4);
      fontWidth = Math.min(100, fontSize * 3);
    } else if (fontSize >= 12) {
      fontCode = '0'; // Medium font
    } else {
      fontCode = '0'; // Small font
      fontHeight = Math.max(15, fontSize * 2);
      fontWidth = Math.max(15, fontSize * 1.5);
    }
    
    // Set field origin
    let zpl = `^FO${x},${y}\n`;
    
    // Set font and size
    zpl += `^A${fontCode}N,${fontHeight},${fontWidth}\n`;
    
    // Add field data
    zpl += `^FD${content}^FS\n`;
    
    return zpl;
  }

  /**
   * Generate ZPL for QR code elements
   */
  private generateQRZPL(element: ZPLElement, data: ZPLPrintData, x: number, y: number): string {
    // Generate QR data
    let qrData = data.qrData || this.generateQRData(data);
    
    // Calculate QR code size
    const size = Math.min(element.width || 100, element.height || 100);
    const scaledSize = Math.round((size / 100) * 6); // Scale for Zebra (1-10)
    
    let zpl = `^FO${x},${y}\n`;
    zpl += `^BQN,2,${scaledSize}\n`; // QR code with error correction level M
    zpl += `^FD${qrData}^FS\n`;
    
    return zpl;
  }

  /**
   * Generate ZPL for line elements
   */
  private generateLineZPL(element: ZPLElement, x: number, y: number): string {
    const width = Math.round((element.width || 100) / 361 * 759);
    const thickness = 3; // Line thickness in dots
    
    // Horizontal line
    return `^FO${x},${y}^GB${width},${thickness},${thickness}^FS\n`;
  }

  /**
   * Generate ZPL for logo placeholder
   */
  private generateLogoZPL(element: ZPLElement, x: number, y: number): string {
    const width = Math.round((element.width || 80) / 361 * 759);
    const height = Math.round((element.height || 30) / 247 * 520);
    
    // For now, create a placeholder box (in production, you'd load actual logo graphic)
    let zpl = `^FO${x},${y}\n`;
    zpl += `^GB${width},${height},3^FS\n`; // Border box
    zpl += `^FO${x + 5},${y + height/2 - 10}\n`;
    zpl += `^A0N,20,15\n`;
    zpl += `^FDLOGO^FS\n`;
    
    return zpl;
  }

  /**
   * Replace variable placeholders with actual data
   */
  private replaceVariables(content: string, data: ZPLPrintData): string {
    if (!data.visitor && !data.contractor) return content;
    
    const replacements: Record<string, string> = {};
    
    if (data.passType === 'visitor' && data.visitor) {
      replacements['{{name}}'] = `${data.visitor.firstName} ${data.visitor.lastName}`;
      replacements['{{company}}'] = data.visitor.company || 'Guest';
      replacements['{{host}}'] = data.host || 'Reception';
      replacements['{{date}}'] = new Date().toLocaleDateString('en-GB');
      replacements['{{time}}'] = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      replacements['{{id}}'] = data.visitor.id.substring(0, 8).toUpperCase();
    } else if (data.passType === 'contractor' && data.contractor) {
      replacements['{{name}}'] = `${data.contractor.firstName} ${data.contractor.lastName}`;
      replacements['{{company}}'] = data.contractor.company || 'Contractor';
      replacements['{{phone}}'] = data.contractor.phone || '';
      replacements['{{email}}'] = data.contractor.email || '';
      replacements['{{date}}'] = new Date().toLocaleDateString('en-GB');
      replacements['{{time}}'] = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      replacements['{{id}}'] = data.contractor.id.substring(0, 8).toUpperCase();
    }
    
    // Handle simple content matching
    if (content === 'Visitor Name' || content === 'Contractor Name') {
      return replacements['{{name}}'] || content;
    }
    if (content === 'Company Name') {
      return replacements['{{company}}'] || content;
    }
    if (content === 'Host Name') {
      return replacements['{{host}}'] || content;
    }
    
    // Replace template variables
    let result = content;
    Object.entries(replacements).forEach(([key, value]) => {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    });
    
    return result;
  }

  /**
   * Generate QR code data
   */
  private generateQRData(data: ZPLPrintData): string {
    if (data.passType === 'visitor' && data.visitor) {
      return JSON.stringify({
        type: 'visitor',
        id: data.visitor.id,
        name: `${data.visitor.firstName} ${data.visitor.lastName}`,
        company: data.visitor.company,
        checkinTime: new Date().toISOString(),
        host: data.host
      });
    } else if (data.passType === 'contractor' && data.contractor) {
      return JSON.stringify({
        type: 'contractor',
        id: data.contractor.id,
        name: `${data.contractor.firstName} ${data.contractor.lastName}`,
        company: data.contractor.company,
        checkinTime: new Date().toISOString()
      });
    }
    
    return 'VisiGate Pro Pass - ' + new Date().toISOString();
  }

  /**
   * Send ZPL directly to Zebra printer via network
   */
  async printToZebraPrinter(zpl: string, printerIP: string, port: number = 9100): Promise<boolean> {
    try {
      console.log('🖨️ Sending ZPL to Zebra printer at', printerIP + ':' + port);
      
      const net = await import('net');
      
      return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        
        socket.connect(port, printerIP, () => {
          console.log('✅ Connected to Zebra printer');
          socket.write(zpl);
          socket.end();
        });
        
        socket.on('close', () => {
          console.log('✅ ZPL sent successfully');
          resolve(true);
        });
        
        socket.on('error', (err) => {
          console.error('❌ Zebra printer error:', err);
          reject(err);
        });
        
        // Timeout after 10 seconds
        socket.setTimeout(10000, () => {
          socket.destroy();
          reject(new Error('Printer connection timeout'));
        });
      });
    } catch (error) {
      console.error('❌ Failed to print to Zebra printer:', error);
      return false;
    }
  }

  /**
   * Get supported Zebra printer models and capabilities
   */
  getZebraCapabilities() {
    return {
      models: [
        'GK420d', 'GK420t', 'GX420d', 'GX420t',
        'ZD410', 'ZD420', 'ZD421', 'ZD510', 'ZD620', 'ZD621',
        'ZT410', 'ZT411', 'ZT420', 'ZT421', 'ZT510', 'ZT610',
        'GC420d', 'GC420t', 'LP2824', 'LP2844'
      ],
      paperSizes: [
        '85mm x 65mm (Thermal Pass)',
        '4" x 6" (102mm x 152mm)',
        '4" x 3" (102mm x 76mm)',
        '2.25" x 1.25" (57mm x 32mm)'
      ],
      connectivity: ['USB', 'Ethernet', 'Wi-Fi', 'Bluetooth'],
      dpi: [203, 300, 600], // Dots per inch
      zplVersion: '2.0',
      supportedBarcodes: [
        'QR Code', 'Code 128', 'Code 39', 'Code 93',
        'UPC-A', 'UPC-E', 'EAN-8', 'EAN-13',
        'Data Matrix', 'PDF417', 'Aztec'
      ],
      commandSet: 'ZPL (Zebra Programming Language)',
      features: [
        'Direct Thermal & Thermal Transfer',
        'Auto-calibration',
        'Print Verification',
        'RFID Encoding (select models)',
        'Status Monitoring'
      ]
    };
  }
}

export default ZebraPrintService;