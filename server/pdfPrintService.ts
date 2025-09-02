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
    // Thermal pass dimensions: 95mm x 65mm
    const passWidth = 361; // 95mm at 96dpi
    const passHeight = 247; // 65mm at 96dpi

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
    
    console.log('📄 Creating PDF with jsPDF using', elements.length, 'design elements');
    
    // Create PDF with thermal pass dimensions (85mm x 65mm)
    const pdf = new jsPDF({
      orientation: 'landscape', 
      unit: 'mm',
      format: [95, 65]
    });
    
    // Set default font
    pdf.setFont('helvetica');
    
    // Process each element from the designer
    for (const element of elements) {
      // Convert from designer canvas coordinates (361x247) to PDF mm (95x65)
      const x = (element.x / 323) * 85;
      const y = (element.y / 247) * 65;
      const width = ((element.width || 100) / 323) * 85;
      const height = ((element.height || 20) / 247) * 65;
      
      console.log(`Processing ${element.type}: x=${x.toFixed(1)}, y=${y.toFixed(1)}, content="${element.content}"`);
      
      switch (element.type) {
        case 'text':
          if (element.content) {
            const fontSize = Math.max(6, Math.min(12, (element.fontSize || 12) * 0.8));
            pdf.setFontSize(fontSize);
            pdf.setFont('helvetica', element.fontWeight === 'bold' ? 'bold' : 'normal');
            
            // Handle text color if specified
            if (element.color) {
              const color = this.parseColor(element.color);
              pdf.setTextColor(color.r, color.g, color.b);
            }
            
            pdf.text(element.content, x, y + fontSize * 0.3);
            
            // Reset color
            pdf.setTextColor(0, 0, 0);
          }
          break;
          
        case 'qr_code':
          // Draw QR code placeholder
          const qrSize = Math.min(width, height);
          pdf.setLineWidth(0.5);
          pdf.rect(x, y, qrSize, qrSize);
          
          // Add QR pattern simulation
          const cellSize = qrSize / 12;
          pdf.setFillColor(0, 0, 0);
          for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) {
              if ((i + j) % 3 === 0) {
                pdf.rect(x + i * cellSize, y + j * cellSize, cellSize, cellSize, 'F');
              }
            }
          }
          break;
          
        case 'logo':
          // Draw logo placeholder
          pdf.setLineWidth(0.5);
          pdf.rect(x, y, width, height);
          pdf.setFontSize(8);
          pdf.text('LOGO', x + width/4, y + height/2);
          break;
          
        case 'line':
          pdf.setLineWidth(element.strokeWidth || 1);
          if (element.color) {
            const color = this.parseColor(element.color);
            pdf.setDrawColor(color.r, color.g, color.b);
          }
          pdf.line(x, y, x + width, y);
          pdf.setDrawColor(0, 0, 0); // Reset color
          break;
          
        case 'image':
          // Image placeholder
          pdf.setLineWidth(0.5);
          pdf.rect(x, y, width, height);
          pdf.setFontSize(6);
          pdf.text('IMAGE', x + 1, y + height/2);
          break;
      }
    }
    
    // Convert to buffer
    const pdfArrayBuffer = pdf.output('arraybuffer');
    const buffer = Buffer.from(pdfArrayBuffer);
    
    console.log('✅ PDF generated with proper design elements:', buffer.length, 'bytes');
    return buffer;
  }
  
  /**
   * Parse color string to RGB values
   */
  private parseColor(color: string): { r: number, g: number, b: number } {
    // Default to black
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
      }
    } else if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        r = parseInt(matches[0]);
        g = parseInt(matches[1]);
        b = parseInt(matches[2]);
      }
    }
    
    return { r, g, b };
  }

  /**
   * Generate PDF directly using jsPDF for cloud compatibility
   */
  private async htmlToPDF(html: string): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');
    
    console.log('📄 Creating PDF with jsPDF...');
    
    // Create PDF with thermal pass dimensions (85mm x 65mm)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [95, 65]
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
    pdf.rect(2, 2, 81, 61);
    
    // Add QR code placeholder
    pdf.rect(55, 15, 25, 25);
    pdf.setFontSize(6);
    pdf.text('QR CODE', 62, 30);
    
    // Add footer
    pdf.setFontSize(7);
    pdf.text('Return to Reception', 5, 57);
    pdf.text('ID: #' + Math.random().toString(36).substr(2, 6).toUpperCase(), 45, 57);
    
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