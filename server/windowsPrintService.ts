import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface WindowsPrintElement {
  type: 'text' | 'qr_code' | 'logo' | 'line';
  x: number; // mm
  y: number; // mm
  width?: number; // mm
  height?: number; // mm
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
}

export interface PrintData {
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
 * Windows-focused Print Service - Reliable alternative to Crystal Reports
 * 
 * This service focuses on Windows compatibility and provides multiple 
 * reliable printing methods specifically designed for business environments.
 */
export class WindowsPrintService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Main print method with Windows-optimized approaches
   */
  async print(elements: WindowsPrintElement[], data: PrintData, printerName: string): Promise<{
    success: boolean;
    method: string;
    message: string;
    file?: string;
  }> {
    console.log(`🖨️ Windows Print Service: Targeting printer "${printerName}"`);

    // Try methods in order of reliability for Windows + B-FV4D
    const methods = [
      'html-chrome', // Chrome headless printing - most reliable
      'text-raw',    // Raw text commands - thermal printer friendly
      'powershell'   // PowerShell printing - Windows native
    ];

    for (const method of methods) {
      try {
        console.log(`🎯 Attempting ${method} printing...`);
        const result = await this.executeMethod(method, elements, data, printerName);
        
        if (result.success) {
          return { ...result, method };
        }
        
        console.log(`⚠️ ${method} failed: ${result.message}`);
      } catch (error) {
        console.log(`❌ ${method} error:`, error.message);
      }
    }

    return {
      success: false,
      method: 'none',
      message: 'All Windows printing methods failed'
    };
  }

  /**
   * Execute specific printing method
   */
  private async executeMethod(
    method: string, 
    elements: WindowsPrintElement[], 
    data: PrintData, 
    printerName: string
  ): Promise<{ success: boolean; message: string; file?: string }> {
    
    switch (method) {
      case 'html-chrome':
        return await this.printHtmlChrome(elements, data, printerName);
      
      case 'text-raw':
        return await this.printTextRaw(elements, data, printerName);
      
      case 'powershell':
        return await this.printPowerShell(elements, data, printerName);
      
      default:
        return { success: false, message: `Unknown method: ${method}` };
    }
  }

  /**
   * Method 1: HTML + Chrome Headless (Most Reliable)
   * Generates clean HTML and uses Chrome to print - works with any printer
   */
  private async printHtmlChrome(
    elements: WindowsPrintElement[], 
    data: PrintData, 
    printerName: string
  ): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      const htmlContent = this.generateHTML(elements, data);
      const htmlFile = path.join(this.tempDir, `pass_${Date.now()}.html`);
      
      fs.writeFileSync(htmlFile, htmlContent);
      
      // Use Chrome headless for consistent printing
      const chromeCmd = process.platform === 'win32'
        ? `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`
        : 'google-chrome';
      
      const printCmd = `${chromeCmd} --headless --disable-gpu --print-to-pdf-no-header --no-margins --run-all-compositor-stages-before-draw --virtual-time-budget=5000 --print-to-pdf "${htmlFile}.pdf" "${htmlFile}"`;
      
      await execAsync(printCmd);
      
      // Send PDF to printer using Windows printing
      const windowsPrintCmd = `powershell -Command "Start-Process -FilePath '${htmlFile}.pdf' -Verb Print -WindowStyle Hidden"`;
      await execAsync(windowsPrintCmd);
      
      // Cleanup after delay
      setTimeout(() => {
        try {
          if (fs.existsSync(htmlFile)) fs.unlinkSync(htmlFile);
          if (fs.existsSync(htmlFile + '.pdf')) fs.unlinkSync(htmlFile + '.pdf');
        } catch (e) {
          console.log('Cleanup warning:', e.message);
        }
      }, 10000);

      return {
        success: true,
        message: `✅ HTML+Chrome printed successfully to ${printerName}`,
        file: htmlFile
      };

    } catch (error) {
      return {
        success: false,
        message: `HTML+Chrome failed: ${error.message}`
      };
    }
  }

  /**
   * Method 2: Raw Text Commands (Thermal Printer Optimized)
   * Sends plain text with basic formatting - ideal for thermal printers
   */
  private async printTextRaw(
    elements: WindowsPrintElement[], 
    data: PrintData, 
    printerName: string
  ): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      const textContent = this.generateRawText(elements, data);
      const textFile = path.join(this.tempDir, `pass_${Date.now()}.txt`);
      
      fs.writeFileSync(textFile, textContent, 'utf8');
      
      // Send raw text directly to printer using Windows copy command
      // This is the most compatible method for thermal printers
      const printCmd = `copy "${textFile}" "\\\\localhost\\${printerName}"`;
      
      await execAsync(printCmd);
      
      // Cleanup after delay
      setTimeout(() => {
        try {
          if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
        } catch (e) {
          console.log('Cleanup warning:', e.message);
        }
      }, 5000);

      return {
        success: true,
        message: `✅ Raw text printed successfully to ${printerName}`,
        file: textFile
      };

    } catch (error) {
      return {
        success: false,
        message: `Raw text failed: ${error.message}`
      };
    }
  }

  /**
   * Method 3: PowerShell Native Printing
   * Uses Windows PowerShell for reliable system-level printing
   */
  private async printPowerShell(
    elements: WindowsPrintElement[], 
    data: PrintData, 
    printerName: string
  ): Promise<{ success: boolean; message: string; file?: string }> {
    try {
      const textContent = this.generateFormattedText(elements, data);
      const textFile = path.join(this.tempDir, `pass_${Date.now()}.txt`);
      
      fs.writeFileSync(textFile, textContent, 'utf8');
      
      // PowerShell script to print text file
      const psScript = `
        $printer = Get-Printer -Name "${printerName}" -ErrorAction SilentlyContinue
        if ($printer) {
          Get-Content "${textFile}" | Out-Printer -Name "${printerName}"
          Write-Output "Success"
        } else {
          Write-Output "Printer not found: ${printerName}"
          exit 1
        }
      `;
      
      const psFile = path.join(this.tempDir, `print_${Date.now()}.ps1`);
      fs.writeFileSync(psFile, psScript);
      
      const result = await execAsync(`powershell -ExecutionPolicy Bypass -File "${psFile}"`);
      
      if (result.stdout.includes('Success')) {
        // Cleanup after delay
        setTimeout(() => {
          try {
            if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
            if (fs.existsSync(psFile)) fs.unlinkSync(psFile);
          } catch (e) {
            console.log('Cleanup warning:', e.message);
          }
        }, 5000);

        return {
          success: true,
          message: `✅ PowerShell printed successfully to ${printerName}`,
          file: textFile
        };
      } else {
        throw new Error(result.stdout || 'PowerShell print failed');
      }

    } catch (error) {
      return {
        success: false,
        message: `PowerShell failed: ${error.message}`
      };
    }
  }

  /**
   * Generate professional HTML for printing
   */
  private generateHTML(elements: WindowsPrintElement[], data: PrintData): string {
    const resolvedData = this.resolveData(data);
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: 85mm 66mm;
            margin: 2mm;
        }
        body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            width: 81mm;
            height: 62mm;
            position: relative;
        }
        .bold { font-weight: bold; }
        .center { text-align: center; }
        .right { text-align: right; }
        .element {
            position: absolute;
            overflow: hidden;
        }
        .qr-placeholder {
            border: 1px solid #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8pt;
        }
        .line {
            border-top: 1px solid #000;
        }
    </style>
</head>
<body>
`;

    // Sort elements by Y position for proper layering
    const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const element of sortedElements) {
      const content = this.resolveContent(element.content || '', resolvedData);
      const fontSize = element.fontSize ? `font-size: ${element.fontSize}pt;` : '';
      const fontWeight = element.fontWeight === 'bold' ? 'font-weight: bold;' : '';
      const textAlign = element.alignment ? `text-align: ${element.alignment};` : '';
      
      const style = `
        left: ${element.x}mm; 
        top: ${element.y}mm; 
        width: ${element.width || 'auto'}mm; 
        height: ${element.height || 'auto'}mm;
        ${fontSize}
        ${fontWeight}
        ${textAlign}
      `;

      if (element.type === 'text') {
        html += `<div class="element" style="${style}">${content}</div>\n`;
      } else if (element.type === 'qr_code') {
        html += `<div class="element qr-placeholder" style="${style}">QR: ${content}</div>\n`;
      } else if (element.type === 'line') {
        html += `<div class="element line" style="${style}"></div>\n`;
      }
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * Generate raw text suitable for thermal printers
   */
  private generateRawText(elements: WindowsPrintElement[], data: PrintData): string {
    const resolvedData = this.resolveData(data);
    let text = '';
    
    // Add thermal printer initialization if needed
    text += '\x1B@'; // ESC @ - Initialize printer
    
    // Sort elements by Y position
    const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (const element of sortedElements) {
      if (element.type === 'text') {
        const content = this.resolveContent(element.content || '', resolvedData);
        
        // Add formatting for thermal printers
        if (element.fontWeight === 'bold') {
          text += '\x1BE\x01'; // Bold on
        }
        
        if (element.fontSize && element.fontSize > 14) {
          text += '\x1D!\x11'; // Double width and height
        }
        
        // Add alignment
        if (element.alignment === 'center') {
          text += '\x1Ba\x01'; // Center align
        } else if (element.alignment === 'right') {
          text += '\x1Ba\x02'; // Right align
        } else {
          text += '\x1Ba\x00'; // Left align
        }
        
        text += content + '\n';
        
        // Reset formatting
        text += '\x1BE\x00'; // Bold off
        text += '\x1D!\x00'; // Normal size
        
      } else if (element.type === 'qr_code') {
        const qrContent = this.resolveContent(element.content || '', resolvedData);
        text += `[QR CODE: ${qrContent}]\n`;
        
      } else if (element.type === 'line') {
        text += '------------------------\n';
      }
    }
    
    // Add paper cut command for thermal printers
    text += '\x1DVA'; // Partial cut
    
    return text;
  }

  /**
   * Generate formatted text for general printers
   */
  private generateFormattedText(elements: WindowsPrintElement[], data: PrintData): string {
    const resolvedData = this.resolveData(data);
    let text = '';
    
    // Sort elements by Y position
    const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (const element of sortedElements) {
      if (element.type === 'text') {
        const content = this.resolveContent(element.content || '', resolvedData);
        
        // Simple text formatting
        if (element.alignment === 'center') {
          const padding = Math.max(0, (40 - content.length) / 2);
          text += ' '.repeat(Math.floor(padding)) + content + '\n';
        } else if (element.alignment === 'right') {
          const padding = Math.max(0, 40 - content.length);
          text += ' '.repeat(padding) + content + '\n';
        } else {
          text += content + '\n';
        }
        
      } else if (element.type === 'qr_code') {
        const qrContent = this.resolveContent(element.content || '', resolvedData);
        text += `QR CODE: ${qrContent}\n`;
        
      } else if (element.type === 'line') {
        text += '========================================\n';
      }
    }
    
    return text;
  }

  /**
   * Resolve all data variables
   */
  private resolveData(data: PrintData): PrintData {
    return {
      fullName: data.fullName || 'Visitor',
      company: data.company || 'Guest',
      purpose: data.purpose || 'Visit',
      date: data.date || new Date().toLocaleDateString(),
      time: data.time || new Date().toLocaleTimeString(),
      hostName: data.hostName || 'Reception',
      id: data.id || Math.random().toString(36).substr(2, 9).toUpperCase(),
      phone: data.phone || '',
      email: data.email || ''
    };
  }

  /**
   * Resolve content with variables
   */
  private resolveContent(content: string, data: PrintData): string {
    return content
      .replace(/\{fullName\}/g, data.fullName || '')
      .replace(/\{company\}/g, data.company || '')
      .replace(/\{purpose\}/g, data.purpose || '')
      .replace(/\{date\}/g, data.date || '')
      .replace(/\{time\}/g, data.time || '')
      .replace(/\{hostName\}/g, data.hostName || '')
      .replace(/\{id\}/g, data.id || '')
      .replace(/\{phone\}/g, data.phone || '')
      .replace(/\{email\}/g, data.email || '');
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
      console.log('Cleanup warning:', error);
    }
  }
}