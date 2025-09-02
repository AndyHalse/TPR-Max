import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PrintJob {
  printerName?: string;
  copies?: number;
  paperSize?: string;
}

/**
 * Direct thermal printer service for Windows systems
 * Uses installed printer drivers to send jobs directly to thermal printers
 */
export class DirectPrintService {
  private tempDir = path.join(process.cwd(), 'temp');

  constructor() {
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get list of available printers on Windows
   */
  async getAvailablePrinters(): Promise<string[]> {
    try {
      if (process.platform !== 'win32') {
        console.log('🖨️ Direct printing only supported on Windows');
        return [];
      }

      console.log('🔍 Detecting Windows printers using multiple methods...');
      let printers: string[] = [];
      
      // Method 1: PowerShell Get-Printer (most reliable for installed printers)
      try {
        const { stdout: psOutput } = await execAsync('powershell.exe -Command "Get-Printer | Select-Object Name | ConvertTo-Json"', { timeout: 15000 });
        const psResult = JSON.parse(psOutput);
        const psPrinters = Array.isArray(psResult) ? psResult.map(p => p.Name) : [psResult.Name];
        printers.push(...psPrinters.filter(Boolean));
        console.log('✅ PowerShell detected printers:', psPrinters);
      } catch (psError) {
        console.log('⚠️ PowerShell printer detection failed:', psError.message);
      }
      
      // Method 2: WMIC (fallback method)
      try {
        const { stdout } = await execAsync('wmic printer get name /format:csv');
        const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node,Name'));
        const wmicPrinters = lines.map(line => {
          const parts = line.split(',');
          return parts[1]?.trim() || '';
        }).filter(name => name && name !== 'Name');
        
        // Add any new printers not found by PowerShell
        wmicPrinters.forEach(printer => {
          if (!printers.includes(printer)) {
            printers.push(printer);
          }
        });
        console.log('✅ WMIC detected additional printers:', wmicPrinters);
      } catch (wmicError) {
        console.log('⚠️ WMIC printer detection failed:', wmicError.message);
      }
      
      // Remove duplicates and empty entries
      printers = [...new Set(printers)].filter(Boolean);
      
      console.log(`🖨️ Final printer list (${printers.length} total):`);
      printers.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      
      return printers;
    } catch (error) {
      console.error('❌ Error getting printers:', error);
      return [];
    }
  }

  /**
   * Find TEC B-EV4 thermal printer or similar thermal printer
   */
  async findThermalPrinter(): Promise<string | null> {
    const printers = await this.getAvailablePrinters();
    
    console.log(`🔍 Searching for TEC B-EV4 among ${printers.length} detected printers...`);
    
    // Enhanced keywords for TEC B-EV4 and similar thermal printers
    const tecKeywords = [
      'tec b-ev4', 'tec b-fv4', 'tec desktop', 'b-ev4', 'b-fv4',
      'thermal transfer', 'thermal', 'label printer', 'desktop printer',
      'toshiba tec', 'tec', 'barcode printer', 'receipt printer'
    ];
    
    // First priority: Look for exact TEC B-EV4 matches
    for (const printer of printers) {
      const printerLower = printer.toLowerCase();
      console.log(`🖨️ Checking printer: "${printer}"`);
      
      if (printerLower.includes('tec') && (printerLower.includes('b-ev4') || printerLower.includes('b-fv4'))) {
        console.log('🎯 Found exact TEC B-EV4 printer:', printer);
        return printer;
      }
    }
    
    // Second priority: Look for TEC printers
    for (const printer of printers) {
      const printerLower = printer.toLowerCase();
      if (printerLower.includes('tec') && (printerLower.includes('desktop') || printerLower.includes('thermal'))) {
        console.log('🎯 Found TEC thermal printer:', printer);
        return printer;
      }
    }
    
    // Third priority: Look for any thermal printer
    for (const printer of printers) {
      const printerLower = printer.toLowerCase();
      if (tecKeywords.some(keyword => printerLower.includes(keyword))) {
        console.log('🎯 Found thermal printer:', printer);
        return printer;
      }
    }

    // If no thermal printer found, show available options
    if (printers.length > 0) {
      console.log('⚠️ No thermal printer detected. Available printers:');
      printers.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      console.log('⚠️ Using first available printer as fallback:', printers[0]);
      return printers[0];
    }

    console.error('❌ No printers detected on system');
    return null;
  }

  /**
   * Print PDF directly to thermal printer using Windows print drivers
   */
  async printPdfToThermalPrinter(
    pdfBuffer: Buffer, 
    options: PrintJob = {}
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (process.platform !== 'win32') {
        return {
          success: false,
          message: 'Direct thermal printing is only supported on Windows systems'
        };
      }

      // Find thermal printer
      const printerName = options.printerName || await this.findThermalPrinter();
      if (!printerName) {
        return {
          success: false,
          message: 'No thermal printer found. Please ensure your B-FV4 printer is installed and connected.'
        };
      }

      // Save PDF to temp file
      const tempFile = path.join(this.tempDir, `thermal-pass-${Date.now()}.pdf`);
      await fs.writeFile(tempFile, pdfBuffer);

      // Print using PowerShell for better printer control
      const powershellScript = `
        $printer = "${printerName}"
        $file = "${tempFile.replace(/\\/g, '\\\\')}"
        
        # Use Windows printing API for direct printing
        Start-Process -FilePath "C:\\Windows\\System32\\SumatraPDF.exe" -ArgumentList "-print-to", $printer, $file -Wait -WindowStyle Hidden
        
        # Alternative using PowerShell printing if SumatraPDF not available
        if (-not (Get-Process "SumatraPDF" -ErrorAction SilentlyContinue)) {
          $printJob = Start-Process -FilePath $file -Verb "PrintTo" -ArgumentList $printer -PassThru -Wait
        }
      `;

      // First try with Adobe Reader silent printing
      try {
        const adobeCommand = `"C:\\Program Files (x86)\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe" /t "${tempFile}" "${printerName}"`;
        await execAsync(adobeCommand, { timeout: 10000 });
        
        console.log('✅ PDF sent to thermal printer via Adobe Reader');
      } catch (adobeError) {
        // Try with PowerShell approach
        try {
          await execAsync(`powershell -Command "${powershellScript}"`, { timeout: 15000 });
          console.log('✅ PDF sent to thermal printer via PowerShell');
        } catch (psError) {
          // Try with simple Windows print command
          const printCommand = `print /D:"${printerName}" "${tempFile}"`;
          await execAsync(printCommand, { timeout: 10000 });
          console.log('✅ PDF sent to thermal printer via print command');
        }
      }

      // Clean up temp file after a delay
      setTimeout(async () => {
        try {
          await fs.unlink(tempFile);
        } catch (error) {
          console.log('📁 Temp file cleanup:', error.message);
        }
      }, 5000);

      return {
        success: true,
        message: `Print job sent successfully to ${printerName}`
      };

    } catch (error) {
      console.error('❌ Direct printing error:', error);
      return {
        success: false,
        message: `Printing failed: ${error.message}`
      };
    }
  }

  /**
   * Send raw thermal printer commands (ESC/POS)
   */
  async sendRawThermalCommands(
    commands: string, 
    printerName?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (process.platform !== 'win32') {
        return {
          success: false,
          message: 'Raw thermal printing only supported on Windows'
        };
      }

      const printer = printerName || await this.findThermalPrinter();
      if (!printer) {
        return {
          success: false,
          message: 'No thermal printer found'
        };
      }

      // Create temp file with raw commands
      const tempFile = path.join(this.tempDir, `thermal-raw-${Date.now()}.txt`);
      await fs.writeFile(tempFile, commands, 'binary');

      // Send raw data to printer
      const command = `copy /b "${tempFile}" "${printer}"`;
      await execAsync(command, { timeout: 10000 });

      // Clean up
      setTimeout(async () => {
        try {
          await fs.unlink(tempFile);
        } catch (error) {
          console.log('📁 Raw temp file cleanup:', error.message);
        }
      }, 2000);

      console.log('✅ Raw commands sent to thermal printer');
      return {
        success: true,
        message: `Raw thermal commands sent to ${printer}`
      };

    } catch (error) {
      console.error('❌ Raw thermal printing error:', error);
      return {
        success: false,
        message: `Raw printing failed: ${error.message}`
      };
    }
  }
}

export const directPrintService = new DirectPrintService();