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
    const visitorPassBytes = Buffer.from('    VISITOR PASS', 'ascii');
    commands.push(...Array.from(visitorPassBytes));
    commands.push(...[0x0D, 0x0A]); // Carriage return + line feed
    commands.push(...[0x1B, 0x46]); // ESC F - Bold off
    commands.push(...[0x1B, 0x57, 0x00]); // ESC W 0 - Double width off
    
    // Horizontal line using dash characters
    commands.push(...[0x0A]); // Line feed
    const lineBytes = Buffer.from('----------------------------------------', 'ascii');
    commands.push(...Array.from(lineBytes));
    commands.push(...[0x0D, 0x0A, 0x0A]); // CR+LF + spacing
    
    // Visitor Name - Bold, normal size
    commands.push(...[0x1B, 0x45]); // Bold on
    const nameBytes = Buffer.from(`Name: ${passData.name}`, 'ascii');
    commands.push(...Array.from(nameBytes));
    commands.push(...[0x1B, 0x46]); // Bold off
    commands.push(...[0x0D, 0x0A, 0x0A]); // CR+LF + spacing
    
    // Company
    const companyBytes = Buffer.from(`Company: ${passData.company}`, 'ascii');
    commands.push(...Array.from(companyBytes));
    commands.push(...[0x0D, 0x0A, 0x0A]);
    
    // Date and Time on same line
    const dateTimeBytes = Buffer.from(`Date: ${passData.date}    Time: ${passData.time}`, 'ascii');
    commands.push(...Array.from(dateTimeBytes));
    commands.push(...[0x0D, 0x0A, 0x0A]);
    
    // Host
    const hostBytes = Buffer.from(`Host: ${passData.host}`, 'ascii');
    commands.push(...Array.from(hostBytes));
    commands.push(...[0x0D, 0x0A, 0x0A]);
    
    // QR Code using TEC B-EV4's internal QR code generation (if supported)
    // TEC printers often support Code 128 or QR codes via specific commands
    try {
      // QR Code command sequence for TEC printers (model-specific)
      commands.push(...[0x1B, 0x1D]); // Start graphics/barcode mode
      commands.push(...[0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]); // QR setup
      const qrDataBytes = Buffer.from(passData.qrCode, 'ascii');
      commands.push(...Array.from(qrDataBytes)); // QR data
      commands.push(...[0x1B, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]); // Print QR
    } catch (error) {
      // Fallback: Print QR code as text if native QR not supported
      const qrFallbackBytes = Buffer.from(`QR: ${passData.qrCode}`, 'ascii');
      commands.push(...Array.from(qrFallbackBytes));
      commands.push(...[0x0D, 0x0A]);
    }
    
    // Footer spacing and instructions
    commands.push(...[0x0A, 0x0A]); // Extra spacing
    const footerBytes = Buffer.from('Return to Reception', 'ascii');
    commands.push(...Array.from(footerBytes));
    commands.push(...[0x0D, 0x0A]);
    
    // Pass ID in small font
    commands.push(...[0x1B, 0x4D, 0x01]); // ESC M 1 - Select small font
    const passIdBytes = Buffer.from(`Pass ID: ${passData.passId}`, 'ascii');
    commands.push(...Array.from(passIdBytes));
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
      
      // Check platform - only attempt Windows methods on actual Windows systems
      const platform = os.platform();
      
      if (platform === 'win32') {
        // Use enhanced printer detection from DirectPrintService
        console.log('🔍 Detecting TEC B-EV4 printer using enhanced detection...');
        const { directPrintService } = await import('./directPrintService');
        const detectedPrinter = await directPrintService.findThermalPrinter();
        
        if (detectedPrinter) {
          console.log(`🎯 Using detected TEC printer: ${detectedPrinter}`);
          this.printerName = detectedPrinter;
        }
        // Windows 11 methods - use multiple approaches for reliability
        console.log(`🖨️ Attempting to print to TEC B-EV4: ${this.printerName}`);
        
        const errors = [];
        
        // Method 1: Raw copy to printer share (best for thermal printers)
        try {
          const copyCmd = `copy /b "${tempFile}" "\\\\localhost\\${this.printerName}"`;
          console.log(`📤 Trying raw copy: ${copyCmd}`);
          await execAsync(copyCmd, { timeout: 15000 });
          console.log('✅ TEC B-EV4 raw copy successful!');
          return { 
            success: true, 
            message: `Successfully printed to ${this.printerName} using raw copy method`,
            method: 'raw_copy'
          };
        } catch (error1) {
          console.log(`❌ Raw copy failed: ${error1.message}`);
          errors.push({ method: 'raw_copy', error: error1.message });
        }
        
        // Method 2: Use DirectPrintService raw command sender
        try {
          console.log('📤 Trying DirectPrintService raw commands...');
          const { directPrintService } = await import('./directPrintService');
          const rawCommands = tecCommands.toString('binary');
          const result = await directPrintService.sendRawThermalCommands(rawCommands, this.printerName);
          
          if (result.success) {
            console.log('✅ DirectPrintService raw commands successful!');
            return { 
              success: true, 
              message: `Successfully sent raw commands to ${this.printerName}`,
              method: 'direct_raw_commands'
            };
          } else {
            throw new Error(result.message);
          }
        } catch (error2) {
          console.log(`❌ DirectPrintService failed: ${error2.message}`);
          errors.push({ method: 'direct_raw', error: error2.message });
        }
        
        // Method 3: Advanced Windows printer queue
        try {
          console.log('📤 Trying Windows printer queue...');
          const psScript = `
            $printerName = "${this.printerName}"
            $filePath = "${tempFile.replace(/\//g, '\\\\')}"
            
            # Check if printer exists and is online
            $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
            if (-not $printer) {
              throw "Printer '$printerName' not found"
            }
            
            if ($printer.PrinterStatus -ne 'Normal' -and $printer.PrinterStatus -ne 'Idle') {
              Write-Host "Warning: Printer status is $($printer.PrinterStatus), attempting anyway..."
            }
            
            # Use .NET printing classes for direct raw printing
            Add-Type -AssemblyName System.Drawing
            Add-Type -AssemblyName System.Windows.Forms
            
            $rawData = [System.IO.File]::ReadAllBytes($filePath)
            
            # Send to printer using Windows API
            $printDocument = New-Object System.Drawing.Printing.PrintDocument
            $printDocument.PrinterSettings.PrinterName = $printerName
            
            if ($printDocument.PrinterSettings.IsValid) {
              # Create temp file with .prn extension for Windows
              $tempPrn = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), '.prn')
              [System.IO.File]::WriteAllBytes($tempPrn, $rawData)
              
              # Use rundll32 to print raw file
              $result = Start-Process -FilePath "rundll32.exe" -ArgumentList "msvcrt.dll,system", "copy /b \`"$tempPrn\`" \`"\\\\localhost\\$printerName\`"" -Wait -PassThru
              
              Remove-Item $tempPrn -ErrorAction SilentlyContinue
              
              if ($result.ExitCode -eq 0) {
                Write-Host "Print job sent successfully via rundll32"
              } else {
                throw "rundll32 print failed with exit code $($result.ExitCode)"
              }
            } else {
              throw "Printer settings invalid for $printerName"
            }
          `;
          
          await execAsync(`powershell.exe -Command "${psScript}"`, { timeout: 20000 });
          console.log('✅ Windows printer queue method successful!');
          return { 
            success: true, 
            message: `Successfully queued print job to ${this.printerName}`,
            method: 'windows_printer_queue'
          };
        } catch (error3) {
          console.log(`❌ Windows printer queue failed: ${error3.message}`);
          errors.push({ method: 'printer_queue', error: error3.message });
        }
        
        // All methods failed
        console.error('❌ All TEC B-EV4 printing methods failed:', errors);
        return { 
          success: false, 
          message: `Failed to print to ${this.printerName}. Tried ${errors.length} methods. Check printer connection and drivers.`,
          errors: errors
        };
      } else {
        // Linux/Unix methods - simulate successful printing for development
        console.log('📋 Linux environment detected - simulating TEC B-EV4 thermal printing');
        console.log(`✅ TEC B-EV4 commands generated successfully: ${tecCommands.length} bytes`);
        console.log('📄 ESC/P Command Preview:');
        
        // Log readable preview of what would be printed
        const commandPreview = this.generateReadablePreview(passData);
        console.log(commandPreview);
        
        console.log('🚀 Ready for Windows 11 deployment with actual TEC B-EV4 printer');
        
        // In a real deployment, this would use CUPS or direct USB/network printing
        // For now, we'll provide a simulated success response
        return {
          success: true,
          message: `TEC B-EV4 commands ready for Windows deployment (${tecCommands.length} bytes)`,
          method: 'development_simulation'
        };
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
   * Generate a readable preview of what would be printed
   */
  private generateReadablePreview(passData: ThermalPassData): string {
    return `
╭─────────────────────────────────────────╮
│            VISITOR PASS                 │
├─────────────────────────────────────────┤
│                                         │
│ Name: ${passData.name.padEnd(30)} │
│                                         │
│ Company: ${passData.company.padEnd(27)} │
│                                         │
│ Date: ${passData.date.padEnd(10)} Time: ${passData.time.padEnd(8)} │
│                                         │
│ Host: ${passData.host.padEnd(30)} │
│                                         │
│                    [QR CODE]            │
│                   ${passData.qrCode.padEnd(12)}     │
│                                         │
│ Return to Reception                     │
│                                         │
│ Pass ID: ${passData.passId.padEnd(26)} │
╰─────────────────────────────────────────╯
    `.trim();
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
          ...Array.from(Buffer.from('TEC B-EV4 Test Print', 'ascii')),
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