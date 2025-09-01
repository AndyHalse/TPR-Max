/**
 * Thermal Print Service for Toshiba TEC B-FV4D Direct Thermal Printer
 * Handles RTF generation and direct printing communication
 */

interface ThermalElement {
  id: string;
  type: 'text' | 'qr_code' | 'logo' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  rotation?: number;
  isVariable?: boolean;
  variableType?: string;
}

interface PrinterSettings {
  blackMarkSensing: boolean;
  printSpeed: 'slow' | 'medium' | 'fast';
  printDensity: 'light' | 'normal' | 'dark';
  thermalAdjustment: number;
  labelLength: number;
  labelWidth: number;
  cutAfterPrint: boolean;
  backfeedAdjustment: number;
}

interface PassData {
  name?: string;
  company?: string;
  host?: string;
  purpose?: string;
  phone?: string;
  email?: string;
  date?: string;
  time?: string;
  id?: string;
}

export class ThermalPrintService {
  
  /**
   * Generate RTF content for B-FV4D thermal printer
   */
  generateRTF(elements: ThermalElement[], data: PassData, settings: PrinterSettings): string {
    const rtfHeader = this.generateRTFHeader(settings);
    const rtfContent = this.generateRTFContent(elements, data);
    const rtfFooter = this.generateRTFFooter();
    
    return rtfHeader + rtfContent + rtfFooter;
  }

  /**
   * Generate RTF header with B-FV4D specific settings
   */
  private generateRTFHeader(settings: PrinterSettings): string {
    // Convert mm to twips (1 mm = 56.7 twips)
    const pageWidth = Math.round(settings.labelWidth * 56.7);
    const pageHeight = Math.round(settings.labelLength * 56.7);
    
    let rtf = '{\\rtf1\\ansi\\deff0';
    
    // Font table - using standard printer fonts
    rtf += '{\\fonttbl{\\f0\\fmodern\\fcharset0 Courier New;}{\\f1\\fswiss\\fcharset0 Arial;}}';
    
    // Page setup for 85mm x 66mm thermal label
    rtf += `\\paperw${pageWidth}\\paperh${pageHeight}`;
    rtf += '\\margl0\\margr0\\margt0\\margb0';
    
    // Printer-specific commands for B-FV4D
    if (settings.blackMarkSensing) {
      rtf += '{\\*\\bkmrkstart B}'; // Black mark sensing on
    }
    
    // Print density setting
    const densityMap = { light: '1', normal: '2', dark: '3' };
    rtf += `{\\*\\density ${densityMap[settings.printDensity]}}`;
    
    // Print speed setting
    const speedMap = { slow: '1', medium: '2', fast: '3' };
    rtf += `{\\*\\speed ${speedMap[settings.printSpeed]}}`;
    
    // Thermal adjustment
    if (settings.thermalAdjustment !== 0) {
      rtf += `{\\*\\thermal ${settings.thermalAdjustment}}`;
    }
    
    // Auto cut setting
    if (settings.cutAfterPrint) {
      rtf += '{\\*\\autocut 1}';
    }
    
    rtf += '\\pard';
    
    return rtf;
  }

  /**
   * Generate RTF content from elements and data
   */
  private generateRTFContent(elements: ThermalElement[], data: PassData): string {
    let rtf = '';
    
    // Sort elements by position for proper layering
    const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (const element of sortedElements) {
      rtf += this.generateElementRTF(element, data);
    }
    
    return rtf;
  }

  /**
   * Generate RTF for individual element
   */
  private generateElementRTF(element: ThermalElement, data: PassData): string {
    let rtf = '';
    
    // Convert positions from pixels to twips (assuming 96 DPI)
    const x = Math.round(element.x * 15); // 1440 twips per inch / 96 DPI
    const y = Math.round(element.y * 15);
    
    switch (element.type) {
      case 'text':
        rtf += this.generateTextRTF(element, data, x, y);
        break;
      case 'qr_code':
        rtf += this.generateQRCodeRTF(element, data, x, y);
        break;
      case 'logo':
        rtf += this.generateLogoRTF(element, x, y);
        break;
      case 'line':
        rtf += this.generateLineRTF(element, x, y);
        break;
    }
    
    return rtf;
  }

  /**
   * Generate RTF for text elements
   */
  private generateTextRTF(element: ThermalElement, data: PassData, x: number, y: number): string {
    let content = element.content || '';
    
    // Replace variable content
    if (element.isVariable && element.variableType) {
      content = this.resolveVariableContent(element.variableType, data);
    }
    
    let rtf = `\\posx${x}\\posy${y}`;
    
    // Font size (RTF uses half-points)
    const fontSize = (element.fontSize || 12) * 2;
    rtf += `\\fs${fontSize}`;
    
    // Font weight
    if (element.fontWeight === 'bold') {
      rtf += '\\b';
    }
    
    // Text alignment
    switch (element.alignment) {
      case 'center':
        rtf += '\\qc';
        break;
      case 'right':
        rtf += '\\qr';
        break;
      default:
        rtf += '\\ql';
    }
    
    // Rotation if specified
    if (element.rotation) {
      rtf += `{\\*\\rotate ${element.rotation}}`;
    }
    
    rtf += ` ${content}\\par`;
    
    return rtf;
  }

  /**
   * Generate RTF for QR codes
   */
  private generateQRCodeRTF(element: ThermalElement, data: PassData, x: number, y: number): string {
    // Generate QR data - typically visitor/contractor ID with timestamp
    const qrData = this.generateQRData(data);
    const size = Math.min(element.width, element.height);
    
    let rtf = `\\posx${x}\\posy${y}`;
    rtf += `{\\*\\qrcode${size} ${qrData}}`;
    rtf += '\\par';
    
    return rtf;
  }

  /**
   * Generate RTF for logo placement
   */
  private generateLogoRTF(element: ThermalElement, x: number, y: number): string {
    let rtf = `\\posx${x}\\posy${y}`;
    rtf += `{\\*\\logo ${element.width} ${element.height}}`;
    rtf += '\\par';
    
    return rtf;
  }

  /**
   * Generate RTF for lines/borders
   */
  private generateLineRTF(element: ThermalElement, x: number, y: number): string {
    let rtf = `\\posx${x}\\posy${y}`;
    rtf += `{\\*\\line ${element.width} ${element.height}}`;
    rtf += '\\par';
    
    return rtf;
  }

  /**
   * Generate RTF footer
   */
  private generateRTFFooter(): string {
    return '}';
  }

  /**
   * Resolve variable content based on type
   */
  private resolveVariableContent(variableType: string, data: PassData): string {
    switch (variableType) {
      case 'name': return data.name || 'Unknown';
      case 'company': return data.company || '';
      case 'host': return data.host || '';
      case 'purpose': return data.purpose || '';
      case 'phone': return data.phone || '';
      case 'email': return data.email || '';
      case 'date': return data.date || new Date().toLocaleDateString('en-GB');
      case 'time': return data.time || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      case 'id': return data.id || this.generatePassID();
      default: return '';
    }
  }

  /**
   * Generate QR code data
   */
  private generateQRData(data: PassData): string {
    const timestamp = new Date().toISOString();
    const qrData = {
      id: data.id || this.generatePassID(),
      name: data.name,
      company: data.company,
      timestamp,
      type: 'visigate_pass'
    };
    return JSON.stringify(qrData);
  }

  /**
   * Generate unique pass ID
   */
  private generatePassID(): string {
    const prefix = 'VS';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Send RTF directly to thermal printer
   * Uses Windows printing API for direct communication with B-FV4D
   */
  async printDirect(rtfContent: string, printerName: string = 'B-FV4D'): Promise<boolean> {
    try {
      console.log(`🖨️ Sending RTF content to thermal printer: ${printerName}`);
      console.log(`📄 RTF Content (${rtfContent.length} chars):`, rtfContent.substring(0, 200) + '...');
      
      // Import required modules
      const fs = require('fs').promises;
      const path = require('path');
      const { execSync } = require('child_process');
      
      const tempDir = path.join(process.cwd(), 'temp');
      const tempFile = path.join(tempDir, `thermal_pass_${Date.now()}.rtf`);
      
      // Ensure temp directory exists
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      
      // Write RTF content to temporary file
      await fs.writeFile(tempFile, rtfContent, 'utf8');
      console.log(`📁 Created temporary RTF file: ${tempFile}`);
      
      // Try multiple printing methods for B-FV4D thermal printer
      let printed = false;
      
      try {
        // Method 1: Direct Windows print command
        const printCmd = `print /D:"TEC B-EV4 Desktop Printer" "${tempFile}"`;
        execSync(printCmd, { timeout: 10000 });
        console.log(`✅ Successfully sent to TEC B-EV4 Desktop Printer via print command`);
        printed = true;
      } catch (printError) {
        console.log(`⚠️ Direct print failed: ${printError.message}`);
        
        try {
          // Method 2: PowerShell with specific printer
          const powershellCmd = `powershell -Command "Get-Content '${tempFile}' | Out-Printer -Name 'TEC B-EV4 Desktop Printer'"`;
          execSync(powershellCmd, { timeout: 10000 });
          console.log(`✅ Successfully sent to TEC B-EV4 Desktop Printer via PowerShell`);
          printed = true;
        } catch (psError) {
          console.log(`⚠️ PowerShell failed: ${psError.message}`);
          
          try {
            // Method 3: Notepad print (fallback)
            const notepadCmd = `notepad.exe /p "${tempFile}"`;
            execSync(notepadCmd, { timeout: 15000 });
            console.log(`✅ Successfully sent to default printer via Notepad`);
            printed = true;
          } catch (notepadError) {
            console.log(`⚠️ All print methods failed: ${notepadError.message}`);
          }
        }
      }
      
      // Clean up temporary file after delay
      setTimeout(async () => {
        try {
          await fs.unlink(tempFile);
          console.log(`🗑️ Cleaned up temporary file: ${tempFile}`);
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up temporary file:', cleanupError.message);
        }
      }, 5000);
      
      return printed;
    } catch (error) {
      console.error('❌ Failed to print to thermal printer:', error);
      return false;
    }
  }

  /**
   * Generate RTF for emergency muster list
   */
  generateMusterListRTF(peopleOnSite: any[], settings: PrinterSettings): string {
    const rtfHeader = this.generateRTFHeader(settings);
    let rtfContent = '';
    
    // Title
    rtfContent += '\\fs28\\b EMERGENCY MUSTER LIST\\b0\\fs20\\par\\par';
    rtfContent += `Generated: ${new Date().toLocaleString('en-GB')}\\par\\par`;
    
    // People on site
    rtfContent += `\\b Total People On Site: ${peopleOnSite.length}\\b0\\par\\par`;
    
    // List each person
    peopleOnSite.forEach((person, index) => {
      rtfContent += `${index + 1}. ${person.name}\\par`;
      rtfContent += `   Company: ${person.company || 'N/A'}\\par`;
      rtfContent += `   Type: ${person.type || 'Visitor'}\\par`;
      if (person.department) {
        rtfContent += `   Department: ${person.department}\\par`;
      }
      rtfContent += `   Check-in: ${person.checkInTime || 'Unknown'}\\par\\par`;
    });
    
    const rtfFooter = this.generateRTFFooter();
    return rtfHeader + rtfContent + rtfFooter;
  }

  /**
   * Print emergency muster list
   */
  async printMusterList(peopleOnSite: any[], settings: PrinterSettings): Promise<boolean> {
    const rtfContent = this.generateMusterListRTF(peopleOnSite, settings);
    return await this.printDirect(rtfContent, 'B-FV4D');
  }
}

export const thermalPrintService = new ThermalPrintService();