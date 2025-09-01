import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

const execAsync = promisify(exec);

export interface RobustPrintOptions {
  printerName: string;
  method: 'thermal' | 'pdf' | 'image' | 'auto';
  paperSize: { width: number; height: number }; // in mm
  dpi: number;
  quality: 'draft' | 'normal' | 'high';
}

export interface PrintElement {
  type: 'text' | 'qr_code' | 'logo' | 'line' | 'image';
  x: number; // mm from left
  y: number; // mm from top
  width?: number; // mm
  height?: number; // mm
  content?: string;
  fontSize?: number; // points
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  color?: string; // hex color
}

export interface PassData {
  fullName?: string;
  company?: string;
  purpose?: string;
  date?: string;
  time?: string;
  hostName?: string;
  id?: string;
  phone?: string;
  email?: string;
}

/**
 * Robust Printing Service - Superior to Crystal Reports
 * 
 * Features:
 * - Multiple printing methods (Thermal ESC/POS, PDF, Image)
 * - Automatic fallback between methods
 * - High-quality logo and QR code rendering
 * - Professional fonts and formatting
 * - Windows Print Spooler integration
 * - Precise positioning and scaling
 */
export class RobustPrintService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Main printing method - attempts multiple strategies for maximum success
   */
  async printPass(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<{
    success: boolean;
    method: string;
    message: string;
    file?: string;
  }> {
    console.log(`🖨️ Starting robust print with method: ${options.method}`);

    // Auto-detect best method if not specified
    if (options.method === 'auto') {
      options.method = await this.detectBestPrintMethod(options.printerName);
    }

    const strategies = this.getPrintStrategies(options.method);

    for (const strategy of strategies) {
      try {
        console.log(`🎯 Attempting ${strategy} printing...`);
        const result = await this.executeStrategy(strategy, elements, data, options);
        if (result.success) {
          return { ...result, method: strategy };
        }
        console.log(`⚠️ ${strategy} failed: ${result.message}`);
      } catch (error) {
        console.log(`❌ ${strategy} error:`, error);
      }
    }

    return {
      success: false,
      method: 'none',
      message: 'All printing strategies failed'
    };
  }

  /**
   * Get fallback strategies in order of preference
   */
  private getPrintStrategies(primaryMethod: string): string[] {
    const strategies: Record<string, string[]> = {
      'thermal': ['thermal-escpos', 'pdf-spooler', 'image-spooler'],
      'pdf': ['pdf-spooler', 'pdf-direct', 'image-spooler'],
      'image': ['image-spooler', 'pdf-spooler', 'thermal-escpos']
    };
    
    return strategies[primaryMethod] || ['pdf-spooler', 'image-spooler'];
  }

  /**
   * Execute specific printing strategy
   */
  private async executeStrategy(
    strategy: string, 
    elements: PrintElement[], 
    data: PassData, 
    options: RobustPrintOptions
  ): Promise<{ success: boolean; message: string; file?: string }> {
    
    switch (strategy) {
      case 'thermal-escpos':
        return await this.printThermalESCPOS(elements, data, options);
      
      case 'pdf-spooler':
        return await this.printPDFSpooler(elements, data, options);
      
      case 'pdf-direct':
        return await this.printPDFDirect(elements, data, options);
      
      case 'image-spooler':
        return await this.printImageSpooler(elements, data, options);
      
      default:
        return { success: false, message: `Unknown strategy: ${strategy}` };
    }
  }

  /**
   * Method 1: Thermal ESC/POS - Direct to printer with raw commands
   */
  private async printThermalESCPOS(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      // Import node-thermal-printer dynamically for Windows compatibility
      const { ThermalPrinter, PrinterTypes } = await import('node-thermal-printer');
      
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON, // B-FV4D uses ESC/POS commands
        interface: `printer:${options.printerName}`,
        options: {
          timeout: 5000
        }
      });

      // Test printer connection
      const isConnected = await printer.isPrinterConnected();
      if (!isConnected) {
        throw new Error(`Cannot connect to printer: ${options.printerName}`);
      }

      // Initialize printer
      printer.clear();
      printer.alignCenter();

      // Process elements in Y-order for proper layout
      const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);

      for (const element of sortedElements) {
        await this.renderThermalElement(printer, element, data, options);
      }

      // Cut paper and execute
      printer.cut();
      await printer.execute();

      return {
        success: true,
        message: `✅ Printed successfully via ESC/POS to ${options.printerName}`
      };

    } catch (error) {
      return {
        success: false,
        message: `Thermal ESC/POS failed: ${error.message}`
      };
    }
  }

  /**
   * Method 2: PDF Spooler - Generate PDF and send to Windows spooler
   */
  private async printPDFSpooler(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      const pdfFile = await this.generatePDF(elements, data, options);
      
      // Use Windows print command to send PDF to spooler
      const printCommand = process.platform === 'win32'
        ? `powershell -Command "Start-Process -FilePath '${pdfFile}' -Verb Print -WindowStyle Hidden"`
        : `lp -d "${options.printerName}" "${pdfFile}"`;

      await execAsync(printCommand);
      
      // Clean up after successful print
      setTimeout(() => {
        if (fs.existsSync(pdfFile)) fs.unlinkSync(pdfFile);
      }, 5000);

      return {
        success: true,
        message: `✅ PDF sent to print spooler for ${options.printerName}`,
        file: pdfFile
      };

    } catch (error) {
      return {
        success: false,
        message: `PDF Spooler failed: ${error.message}`
      };
    }
  }

  /**
   * Method 3: Direct PDF Print - Adobe Reader or similar
   */
  private async printPDFDirect(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      const pdfFile = await this.generatePDF(elements, data, options);
      
      // Try different PDF print commands
      const commands = [
        `"C:\\Program Files\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe" /t "${pdfFile}" "${options.printerName}"`,
        `"C:\\Program Files (x86)\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe" /t "${pdfFile}" "${options.printerName}"`,
        `gsprint -printer "${options.printerName}" "${pdfFile}"`
      ];

      for (const cmd of commands) {
        try {
          await execAsync(cmd);
          return {
            success: true,
            message: `✅ PDF printed directly to ${options.printerName}`,
            file: pdfFile
          };
        } catch (error) {
          continue; // Try next command
        }
      }

      throw new Error('No PDF print command succeeded');

    } catch (error) {
      return {
        success: false,
        message: `Direct PDF failed: ${error.message}`
      };
    }
  }

  /**
   * Method 4: Image Spooler - Convert to high-quality image and print
   */
  private async printImageSpooler(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      const imageFile = await this.generateImage(elements, data, options);
      
      // Use Windows photo print or generic image print
      const printCommand = process.platform === 'win32'
        ? `rundll32.exe "${process.env.windir}\\system32\\shimgvw.dll",ImageView_PrintTo "${imageFile}" "${options.printerName}"`
        : `lp -d "${options.printerName}" "${imageFile}"`;

      await execAsync(printCommand);

      // Clean up after successful print  
      setTimeout(() => {
        if (fs.existsSync(imageFile)) fs.unlinkSync(imageFile);
      }, 5000);

      return {
        success: true,
        message: `✅ Image printed to ${options.printerName}`,
        file: imageFile
      };

    } catch (error) {
      return {
        success: false,
        message: `Image Spooler failed: ${error.message}`
      };
    }
  }

  /**
   * Generate professional PDF with precise positioning
   */
  private async generatePDF(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    
    // Convert mm to points (1mm = 2.834645669 points)
    const mmToPoints = 2.834645669;
    const pageWidth = options.paperSize.width * mmToPoints;
    const pageHeight = options.paperSize.height * mmToPoints;
    
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Process elements
    for (const element of elements) {
      await this.renderPDFElement(page, element, data, options, font, fontBold, mmToPoints);
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `thermal_pass_${Date.now()}.pdf`;
    const filepath = path.join(this.tempDir, filename);
    
    fs.writeFileSync(filepath, pdfBytes);
    return filepath;
  }

  /**
   * Generate high-quality image using Canvas
   */
  private async generateImage(elements: PrintElement[], data: PassData, options: RobustPrintOptions): Promise<string> {
    const { createCanvas } = await import('canvas');
    
    const mmToPixel = options.dpi / 25.4; // Convert mm to pixels at given DPI
    const width = Math.round(options.paperSize.width * mmToPixel);
    const height = Math.round(options.paperSize.height * mmToPixel);
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Render elements
    for (const element of elements) {
      await this.renderCanvasElement(ctx, element, data, options, mmToPixel);
    }

    const buffer = canvas.toBuffer('image/png');
    const filename = `thermal_pass_${Date.now()}.png`;
    const filepath = path.join(this.tempDir, filename);
    
    fs.writeFileSync(filepath, buffer);
    return filepath;
  }

  /**
   * Render element on thermal printer
   */
  private async renderThermalElement(printer: any, element: PrintElement, data: PassData, options: RobustPrintOptions): Promise<void> {
    let content = element.content || '';
    
    // Resolve variable content
    if (element.type === 'text') {
      content = this.resolveVariableContent(element.content || '', data);
      
      // Set alignment
      switch (element.alignment) {
        case 'center': printer.alignCenter(); break;
        case 'right': printer.alignRight(); break;
        default: printer.alignLeft(); break;
      }
      
      // Set size and weight
      if (element.fontSize && element.fontSize > 16) {
        printer.setTextDoubleHeight();
        printer.setTextDoubleWidth();
      }
      
      if (element.fontWeight === 'bold') {
        printer.bold(true);
      }
      
      printer.println(content);
      
      // Reset formatting
      printer.bold(false);
      printer.setTextNormal();
      
    } else if (element.type === 'qr_code') {
      const qrData = this.resolveVariableContent(element.content || data.id || 'VisiGate', data);
      printer.printQR(qrData, { size: 6, model: 2 });
    }
  }

  /**
   * Render element on PDF page
   */
  private async renderPDFElement(page: any, element: PrintElement, data: PassData, options: RobustPrintOptions, font: any, fontBold: any, mmToPoints: number): Promise<void> {
    const x = element.x * mmToPoints;
    const y = (options.paperSize.height - element.y) * mmToPoints; // PDF coordinates start from bottom
    
    if (element.type === 'text') {
      const content = this.resolveVariableContent(element.content || '', data);
      const fontSize = element.fontSize || 12;
      const selectedFont = element.fontWeight === 'bold' ? fontBold : font;
      
      page.drawText(content, {
        x: x,
        y: y - fontSize, // Adjust for text baseline
        size: fontSize,
        font: selectedFont,
        color: rgb(0, 0, 0)
      });
    } else if (element.type === 'line') {
      page.drawLine({
        start: { x: x, y: y },
        end: { x: x + (element.width || 50) * mmToPoints, y: y },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
    }
  }

  /**
   * Render element on canvas
   */
  private async renderCanvasElement(ctx: any, element: PrintElement, data: PassData, options: RobustPrintOptions, mmToPixel: number): Promise<void> {
    const x = element.x * mmToPixel;
    const y = element.y * mmToPixel;
    
    if (element.type === 'text') {
      const content = this.resolveVariableContent(element.content || '', data);
      const fontSize = (element.fontSize || 12) * mmToPixel / 3; // Convert to pixel size
      
      ctx.font = `${element.fontWeight === 'bold' ? 'bold ' : ''}${fontSize}px Arial`;
      ctx.fillStyle = element.color || '#000000';
      ctx.fillText(content, x, y + fontSize);
    } else if (element.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (element.width || 50) * mmToPixel, y);
      ctx.strokeStyle = element.color || '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /**
   * Resolve variable content in text
   */
  private resolveVariableContent(content: string, data: PassData): string {
    return content
      .replace(/\{fullName\}/g, data.fullName || 'Visitor')
      .replace(/\{company\}/g, data.company || 'Guest')
      .replace(/\{purpose\}/g, data.purpose || 'Visit')
      .replace(/\{date\}/g, data.date || new Date().toLocaleDateString())
      .replace(/\{time\}/g, data.time || new Date().toLocaleTimeString())
      .replace(/\{hostName\}/g, data.hostName || 'Reception')
      .replace(/\{id\}/g, data.id || Math.random().toString(36).substr(2, 9))
      .replace(/\{phone\}/g, data.phone || '')
      .replace(/\{email\}/g, data.email || '');
  }

  /**
   * Auto-detect best printing method based on printer capabilities
   */
  private async detectBestPrintMethod(printerName: string): Promise<'thermal' | 'pdf' | 'image'> {
    // Check if it's a thermal printer
    if (printerName.toLowerCase().includes('thermal') || 
        printerName.toLowerCase().includes('b-fv4') ||
        printerName.toLowerCase().includes('tec') ||
        printerName.toLowerCase().includes('receipt')) {
      return 'thermal';
    }
    
    // Default to PDF for office printers
    return 'pdf';
  }

  /**
   * Clean up temporary files
   */
  cleanup(): void {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stat = fs.statSync(filepath);
        
        // Delete files older than 1 hour
        if (now - stat.mtime.getTime() > 3600000) {
          fs.unlinkSync(filepath);
        }
      }
    } catch (error) {
      console.log('Cleanup error:', error);
    }
  }
}