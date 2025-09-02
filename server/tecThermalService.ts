import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ThermalPassData {
  name: string;
  company: string;
  host: string;
  date: string;
  time: string;
  passId: string;
  qrCode: string;
}

/**
 * TEC B-EV4 Native Thermal Printing Service
 * Uses raw ESC/P commands and internal printer fonts/barcodes
 * Bypasses PDF generation for direct thermal printing
 */
export class TecThermalService {
  private printerName: string;

  constructor(printerName: string = 'TEC B-EV4 Desktop Printer') {
    this.printerName = printerName;
  }

  /**
   * Generate TEC B-EV4 specific ESC/P commands for visitor pass
   */
  private generateTecCommands(passData: ThermalPassData): Buffer {
    const commands: number[] = [];
    
    // ESC/P initialization commands for TEC B-EV4
    commands.push(...[0x1B, 0x40]); // ESC @ - Initialize printer
    commands.push(...[0x1B, 0x74, 0x00]); // ESC t 0 - Select character table (USA)
    
    // Set page format for 85mm x 66mm (approx 323 x 251 dots at 96 DPI)
    commands.push(...[0x1B, 0x43, 0x42]); // ESC C 66 - Set page length (66 lines)
    
    // Header: "VISITOR PASS" - Use internal font, bold, large
    commands.push(...[0x1B, 0x45]); // ESC E - Bold on
    commands.push(...[0x1B, 0x57, 0x01]); // ESC W 1 - Double width on
    commands.push(...[0x0A, 0x0A]); // Two line feeds for spacing
    commands.push(...Buffer.from('    VISITOR PASS', 'ascii'));
    commands.push(...[0x0D, 0x0A]); // Carriage return + line feed
    commands.push(...[0x1B, 0x46]); // ESC F - Bold off
    commands.push(...[0x1B, 0x57, 0x00]); // ESC W 0 - Double width off
    
    // Horizontal line using dash characters
    commands.push(...[0x0A]); // Line feed
    commands.push(...Buffer.from('----------------------------------------', 'ascii'));
    commands.push(...[0x0D, 0x0A, 0x0A]); // CR+LF + spacing
    
    // Visitor Name - Bold, normal size
    commands.push(...[0x1B, 0x45]); // Bold on
    commands.push(...Buffer.from(`Name: ${passData.name}`, 'ascii'));
    commands.push(...[0x1B, 0x46]); // Bold off
    commands.push(...[0x0D, 0x0A, 0x0A]); // CR+LF + spacing
    
    // Company
    commands.push(...Buffer.from(`Company: ${passData.company}`, 'ascii'));
    commands.push(...[0x0D, 0x0A, 0x0A]);
    
    // Date and Time on same line
    commands.push(...Buffer.from(`Date: ${passData.date}    Time: ${passData.time}`, 'ascii'));
    commands.push(...[0x0D, 0x0A, 0x0A]);
    
    // Host
    commands.push(...Buffer.from(`Host: ${passData.host}`, 'ascii'));
    commands.push(...[0x0D, 0x0A, 0x0A]);
    
    // QR Code using TEC B-EV4's internal QR code generation (if supported)
    // TEC printers often support Code 128 or QR codes via specific commands
    try {
      // QR Code command sequence for TEC printers (model-specific)
      commands.push(...[0x1B, 0x1D]); // Start graphics/barcode mode
      commands.push(...[0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]); // QR setup
      commands.push(...Buffer.from(passData.qrCode, 'ascii')); // QR data
      commands.push(...[0x1B, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]); // Print QR
    } catch (error) {
      // Fallback: Print QR code as text if native QR not supported
      commands.push(...Buffer.from(`QR: ${passData.qrCode}`, 'ascii'));
      commands.push(...[0x0D, 0x0A]);
    }
    
    // Footer spacing and instructions
    commands.push(...[0x0A, 0x0A]); // Extra spacing
    commands.push(...Buffer.from('Return to Reception', 'ascii'));
    commands.push(...[0x0D, 0x0A]);
    
    // Pass ID in small font
    commands.push(...[0x1B, 0x4D, 0x01]); // ESC M 1 - Select small font
    commands.push(...Buffer.from(`Pass ID: ${passData.passId}`, 'ascii'));
    commands.push(...[0x1B, 0x4D, 0x00]); // ESC M 0 - Back to normal font
    commands.push(...[0x0D, 0x0A, 0x0A, 0x0A]); // Extra spacing before cut
    
    // Cut paper (if supported by B-EV4)
    commands.push(...[0x1B, 0x64, 0x03]); // ESC d 3 - Feed 3 lines
    commands.push(...[0x1D, 0x56, 0x41, 0x03]); // GS V A 3 - Full cut
    
    return Buffer.from(commands);
  }

  /**
   * Send raw commands directly to TEC B-EV4 printer
   */
  async printVisitorPass(passData: ThermalPassData): Promise<{ success: boolean; message: string; method?: string }> {
    const tecCommands = this.generateTecCommands(passData);
    const tempFile = path.join(os.tmpdir(), `tec_thermal_${Date.now()}.prn`);
    
    try {
      // Write raw TEC commands to temporary file
      fs.writeFileSync(tempFile, tecCommands);
      console.log(`🖨️ Generated TEC B-EV4 commands: ${tecCommands.length} bytes`);
      
      // Method 1: Direct raw printing via Windows print command
      try {
        await execAsync(`copy "${tempFile}" "${this.printerName}"`);
        console.log('✅ TEC B-EV4 native printing successful (raw copy)');
        return { 
          success: true, 
          message: `Printed to ${this.printerName} using native TEC commands`,
          method: 'raw_copy'
        };
      } catch (error1) {
        console.log('⚠️ Raw copy failed, trying alternative methods...');
        
        // Method 2: PowerShell raw printing
        try {
          const psCommand = `$content = [System.IO.File]::ReadAllBytes('${tempFile}'); $printer = Get-Printer -Name '${this.printerName}'; Add-Type -AssemblyName System.Drawing; [System.IO.File]::WriteAllBytes('\\\\localhost\\${this.printerName}', $content)`;
          await execAsync(`powershell.exe -Command "${psCommand}"`);
          console.log('✅ TEC B-EV4 native printing successful (PowerShell raw)');
          return { 
            success: true, 
            message: `Printed to ${this.printerName} using PowerShell raw commands`,
            method: 'powershell_raw'
          };
        } catch (error2) {
          // Method 3: Print command with raw flag
          try {
            await execAsync(`print /D:"${this.printerName}" "${tempFile}"`);
            console.log('✅ TEC B-EV4 native printing successful (print command)');
            return { 
              success: true, 
              message: `Printed to ${this.printerName} using Windows print command`,
              method: 'print_command'
            };
          } catch (error3) {
            console.error('❌ All TEC thermal printing methods failed:', { error1, error2, error3 });
            return { 
              success: false, 
              message: `Failed to print to ${this.printerName}: ${error3}` 
            };
          }
        }
      }
    } finally {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFile);
      } catch (error) {
        console.warn('⚠️ Failed to clean up temp file:', error);
      }
    }
  }

  /**
   * Test TEC B-EV4 printer connectivity and capabilities
   */
  async testPrinter(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // Check if printer exists and is online
      const { stdout } = await execAsync(`powershell.exe -Command "Get-Printer -Name '${this.printerName}' | Select-Object Name, PrinterStatus, DriverName"`);
      
      console.log(`🔍 TEC B-EV4 Printer Status:`, stdout);
      
      if (stdout.toLowerCase().includes('normal') || stdout.toLowerCase().includes('idle')) {
        // Send a simple test command
        const testCommands = Buffer.from([
          0x1B, 0x40, // Initialize
          ...Buffer.from('TEC B-EV4 Test Print', 'ascii'),
          0x0D, 0x0A, 0x0A,
          0x1D, 0x56, 0x41, 0x03 // Cut
        ]);
        
        const tempFile = path.join(os.tmpdir(), `tec_test_${Date.now()}.prn`);
        fs.writeFileSync(tempFile, testCommands);
        
        await execAsync(`copy "${tempFile}" "${this.printerName}"`);
        fs.unlinkSync(tempFile);
        
        return {
          success: true,
          message: `TEC B-EV4 printer test successful`,
          details: { status: stdout.trim(), method: 'native_commands' }
        };
      } else {
        return {
          success: false,
          message: `TEC B-EV4 printer not ready: ${stdout}`,
          details: { status: stdout.trim() }
        };
      }
    } catch (error) {
      console.error('❌ TEC B-EV4 test failed:', error);
      return {
        success: false,
        message: `TEC B-EV4 test failed: ${error}`,
        details: { error: String(error) }
      };
    }
  }

  /**
   * Get TEC B-EV4 printer capabilities and status
   */
  async getPrinterInfo(): Promise<any> {
    try {
      const { stdout } = await execAsync(`powershell.exe -Command "Get-Printer -Name '${this.printerName}' | Select-Object *"`);
      return {
        success: true,
        printer: this.printerName,
        info: stdout,
        supportsRawCommands: true,
        nativeFonts: ['Internal Font A', 'Internal Font B'],
        supportedBarcodes: ['Code128', 'QR Code (if supported)', 'Code39'],
        paperSize: '85mm x 66mm thermal',
        commandSet: 'ESC/P with TEC extensions'
      };
    } catch (error) {
      return {
        success: false,
        error: String(error)
      };
    }
  }
}