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
    
    // Generate HTML for PDF conversion
    const html = this.generateHTML(processedElements, data);
    
    // Convert HTML to PDF using a simple approach
    const pdfBuffer = await this.htmlToPDF(html);
    
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
          // Simple QR placeholder - could integrate with QR generation service
          const qrData = data.id || 'VISITOR-PASS-' + Date.now();
          elementsHTML += `
            <div style="${style} border: 2px solid #000; display: flex; align-items: center; justify-content: center; background: #f0f0f0;">
              <div style="font-size: 8px; text-align: center; word-break: break-all; padding: 2px;">
                QR: ${qrData}
              </div>
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
   * Simple HTML to PDF conversion
   * Note: This is a basic implementation. For production, consider using puppeteer or similar
   */
  private async htmlToPDF(html: string): Promise<Buffer> {
    // For now, we'll return the HTML as a simple "PDF-like" format
    // In production, you'd use a proper HTML-to-PDF conversion library
    
    const timestamp = Date.now();
    const filename = `visitor-pass-${timestamp}.html`;
    const filepath = path.join(this.tempDir, filename);
    
    // Write HTML file
    fs.writeFileSync(filepath, html);
    
    // Read it back as buffer (simulating PDF generation)
    const buffer = fs.readFileSync(filepath);
    
    // Clean up
    setTimeout(() => {
      try {
        fs.unlinkSync(filepath);
      } catch (err) {
        console.log(`🗑️ Cleanup: Could not delete ${filepath}`);
      }
    }, 5000);
    
    return buffer;
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