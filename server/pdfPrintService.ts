import * as fs from 'fs';
import * as path from 'path';

export interface PDFElement {
  type: 'text' | 'qr_code' | 'logo' | 'line';
  x: number; // mm
  y: number; // mm
  width?: number; // mm
  height?: number; // mm
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  isVariable?: boolean;
  variableType?: 'name' | 'company' | 'date' | 'time' | 'host' | 'purpose' | 'id' | 'phone' | 'email';
}

export interface PDFPrintData {
  name?: string;
  company?: string;
  purpose?: string;
  date?: string;
  time?: string;
  host?: string;
  id?: string;
  phone?: string;
  email?: string;
}

/**
 * PDF Print Service - Universal SaaS Printing Solution
 * 
 * Generates high-quality PDFs that work with any browser and printer
 * Perfect for SaaS applications that need universal printing without installation
 */
export class PDFPrintService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Generate PDF from thermal pass elements
   */
  async generatePDF(elements: PDFElement[], data: PDFPrintData): Promise<Buffer> {
    console.log(`📄 Generating PDF pass with ${elements.length} elements`);

    // Replace variable content with actual data
    const processedElements = this.processVariableElements(elements, data);
    
    // Generate PDF directly using jsPDF
    const pdfBuffer = await this.createPDFFromElements(processedElements, data);
    
    console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
  }

  /**
   * Process elements to replace variables with actual data
   */
  private processVariableElements(elements: PDFElement[], data: PDFPrintData): PDFElement[] {
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('en-GB');
    const timeStr = currentDate.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    return elements.map(element => {
      if (element.isVariable && element.variableType) {
        const processed = { ...element };
        
        switch (element.variableType) {
          case 'name':
            processed.content = data.name || 'Visitor Name';
            break;
          case 'company':
            processed.content = data.company || 'Company Name';
            break;
          case 'date':
            processed.content = dateStr;
            break;
          case 'time':
            processed.content = timeStr;
            break;
          case 'host':
            processed.content = data.host || 'Host Name';
            break;
          case 'purpose':
            processed.content = data.purpose || 'Visit Purpose';
            break;
          case 'id':
            processed.content = data.id || `#${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
            break;
          case 'phone':
            processed.content = data.phone || '+44 1234 567890';
            break;
          case 'email':
            processed.content = data.email || 'visitor@company.com';
            break;
        }
        
        return processed;
      }
      
      return element;
    });
  }

  /**
   * Generate HTML for the thermal pass
   */
  private generateHTML(elements: PDFElement[], data: PDFPrintData): string {
    // Thermal pass dimensions: 85mm x 66mm
    const passWidth = 323; // 85mm at 96dpi
    const passHeight = 251; // 66mm at 96dpi

    let elementsHTML = '';

    elements.forEach(element => {
      const style = this.getElementStyle(element);
      
      switch (element.type) {
        case 'text':
          elementsHTML += `
            <div style="${style}">
              ${this.escapeHTML(element.content || '')}
            </div>`;
          break;
          
        case 'qr_code':
          // Generate thermal-optimized QR code
          const qrData = data.id || 'VISITOR-PASS-' + Date.now();
          const qrSize = Math.min(element.width || 100, element.height || 100);
          elementsHTML += `
            <div style="${style} display: flex; align-items: center; justify-content: center; background: white; border: 1px solid #000;">
              <svg width="${qrSize}" height="${qrSize}" viewBox="0 0 25 25" style="image-rendering: pixelated;">
                ${this.generateSimpleQRSVG(qrData, 25)}
              </svg>
            </div>`;
          break;
          
        case 'logo':
          elementsHTML += `
            <div style="${style} border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; background: #f9f9f9;">
              <div style="font-size: 10px; color: #666;">LOGO</div>
            </div>`;
          break;
          
        case 'line':
          elementsHTML += `
            <div style="${style} border-top: 1px solid #000;"></div>`;
          break;
      }
    });

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Visitor Pass</title>
    <style>
        @media print {
            body { margin: 0; }
            .pass { page-break-inside: avoid; }
        }
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: white;
        }
        .pass {
            width: ${passWidth}px;
            height: ${passHeight}px;
            position: relative;
            border: 2px solid #333;
            background: white;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .element {
            position: absolute;
            box-sizing: border-box;
        }
    </style>
</head>
<body>
    <div class="pass">
        ${elementsHTML}
    </div>
</body>
</html>`;
  }

  /**
   * Get CSS style for element
   */
  private getElementStyle(element: PDFElement): string {
    const styles = [
      `position: absolute`,
      `left: ${element.x}px`,
      `top: ${element.y}px`,
      `width: ${element.width || 'auto'}px`,
      `height: ${element.height || 'auto'}px`
    ];

    if (element.fontSize) {
      styles.push(`font-size: ${element.fontSize}px`);
    }

    if (element.fontWeight) {
      styles.push(`font-weight: ${element.fontWeight}`);
    }

    if (element.alignment) {
      styles.push(`text-align: ${element.alignment}`);
    }

    return styles.join('; ');
  }

  /**
   * Create PDF from processed elements using jsPDF
   */
  private async createPDFFromElements(elements: PDFElement[], data: PDFPrintData): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');
    
    console.log('📄 Creating PDF with jsPDF...');
    
    // Create PDF with thermal pass dimensions (85mm x 66mm)
    const pdf = new jsPDF({
      orientation: 'landscape', 
      unit: 'mm',
      format: [85, 66]
    });
    
    // Process each element
    for (const element of elements) {
      const x = (element.x * 85) / 323; // Convert pixels to mm
      const y = (element.y * 66) / 251; // Convert pixels to mm
      
      switch (element.type) {
        case 'text':
          pdf.setFontSize(element.fontSize || 10);
          pdf.setFont('helvetica', element.fontWeight === 'bold' ? 'bold' : 'normal');
          if (element.content) {
            pdf.text(element.content, x, y + 3); // Slight offset for text baseline
          }
          break;
          
        case 'qr_code':
          const size = Math.min((element.width || 50) * 85 / 323, (element.height || 50) * 66 / 251);
          pdf.rect(x, y, size, size);
          pdf.setFontSize(6);
          pdf.text('QR', x + size/3, y + size/2);
          break;
          
        case 'logo':
          const logoSize = Math.min((element.width || 40) * 85 / 323, (element.height || 20) * 66 / 251);
          pdf.rect(x, y, logoSize, logoSize * 0.6);
          pdf.setFontSize(6);
          pdf.text('LOGO', x + 2, y + logoSize * 0.4);
          break;
          
        case 'line':
          const lineWidth = (element.width || 100) * 85 / 323;
          pdf.line(x, y, x + lineWidth, y);
          break;
      }
    }
    
    // Add border around the entire pass
    pdf.rect(1, 1, 83, 64);
    
    // Convert to buffer
    const pdfArrayBuffer = pdf.output('arraybuffer');
    const buffer = Buffer.from(pdfArrayBuffer);
    
    console.log('✅ PDF generated with jsPDF:', buffer.length, 'bytes');
    return buffer;
  }

  /**
   * Generate PDF directly using jsPDF for cloud compatibility
   */
  private async htmlToPDF(html: string): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');
    
    console.log('📄 Creating PDF with jsPDF...');
    
    // Create PDF with thermal pass dimensions (85mm x 66mm)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85, 66]
    });
    
    // Set font and basic styling
    pdf.setFont('helvetica');
    
    // Add title
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('VISITOR PASS', 5, 10);
    
    // Add visitor details (these would come from the data)
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Name: John Smith', 5, 20);
    pdf.text('Company: Tech Corp Ltd', 5, 27);
    pdf.text('Date: ' + new Date().toLocaleDateString(), 5, 34);
    pdf.text('Time: ' + new Date().toLocaleTimeString(), 5, 41);
    pdf.text('Host: Sarah Johnson', 5, 48);
    
    // Add border
    pdf.rect(2, 2, 81, 62);
    
    // Add QR code placeholder
    pdf.rect(55, 15, 25, 25);
    pdf.setFontSize(6);
    pdf.text('QR CODE', 62, 30);
    
    // Add footer
    pdf.setFontSize(7);
    pdf.text('Return to Reception', 5, 58);
    pdf.text('ID: #' + Math.random().toString(36).substr(2, 6).toUpperCase(), 45, 58);
    
    // Convert to buffer
    const pdfArrayBuffer = pdf.output('arraybuffer');
    const buffer = Buffer.from(pdfArrayBuffer);
    
    console.log('✅ PDF generated with jsPDF:', buffer.length, 'bytes');
    return buffer;
  }

  /**
   * Generate simple QR code pattern for thermal printing
   */
  private generateSimpleQRSVG(data: string, size: number): string {
    // Create a simple data matrix pattern based on data hash
    const hash = this.simpleHash(data);
    let svg = '';
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Create finder patterns (corners)
        if ((x < 7 && y < 7) || (x >= size-7 && y < 7) || (x < 7 && y >= size-7)) {
          const isBlack = (x === 0 || x === 6 || y === 0 || y === 6 || 
                          (x >= 2 && x <= 4 && y >= 2 && y <= 4));
          if (isBlack) {
            svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="black"/>`;
          }
        }
        // Data area - use hash to determine pattern
        else if (x > 7 || y > 7) {
          const isBlack = (hash >> ((x + y * size) % 32)) & 1;
          if (isBlack) {
            svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="black"/>`;
          }
        }
      }
    }
    
    return svg;
  }

  /**
   * Simple hash function for QR pattern generation
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Escape HTML characters
   */
  private escapeHTML(str: string): string {
    const div = { innerHTML: '' } as any;
    div.textContent = str;
    return div.innerHTML || str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}