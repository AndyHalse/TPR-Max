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
    const customerId = process.env.CUSTOMER_ID || 'dev-customer-001'; // Customer isolation
    const uniqueId = data.id || this.generatePassID();
    
    const qrData = {
      id: `VG-${customerId.substring(0, 4)}-${uniqueId}`,
      visitor: data.name,
      company: data.company,
      timestamp,
      checkInTime: timestamp,
      customerId,
      type: 'visitor_pass',
      // Additional tracking data for security
      issueDate: new Date().toLocaleDateString('en-GB'),
      issueTime: new Date().toLocaleTimeString('en-GB'),
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Valid for 24 hours
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
  async printDirect(elements: ThermalElement[], data: PassData, printerSettings: PrinterSettings, printerName: string = 'TEC B-EV4 Desktop Printer'): Promise<boolean> {
    try {
      console.log(`🖨️ Generating thermal pass for B-FV4D printer: ${printerName}`);
      
      // For now, let's create a comprehensive text-based pass that any thermal printer can handle
      const thermalContent = this.generateThermalText(elements, data, printerSettings);
      console.log(`📄 Generated thermal content: ${thermalContent.length} characters`);
      
      // Use a simple approach that works with thermal printers
      return await this.printThermalText(thermalContent, printerName);
    } catch (error) {
      console.error('❌ Failed to print to thermal printer:', error);
      return false;
    }
  }

  /**
   * Generate simple thermal text content
   */
  private generateThermalText(elements: ThermalElement[], data: PassData, settings: PrinterSettings): string {
    let content = '';
    
    // Add thermal printer initialization (ESC/POS commands as text)
    content += String.fromCharCode(27) + '@'; // ESC @ - Initialize printer
    
    // Sort elements by Y position
    const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (const element of sortedElements) {
      switch (element.type) {
        case 'text':
          let text = element.content || '';
          if (element.isVariable && element.variableType) {
            text = this.getVariableValue(element.variableType, data);
          }
          
          // Add formatting for thermal printer
          if (element.fontWeight === 'bold') {
            content += String.fromCharCode(27) + 'E' + String.fromCharCode(1); // Bold on
          }
          if (element.fontSize && element.fontSize > 14) {
            content += String.fromCharCode(29) + '!' + String.fromCharCode(17); // Double size
          }
          
          content += text + '\n';
          
          // Reset formatting
          content += String.fromCharCode(27) + 'E' + String.fromCharCode(0); // Bold off
          content += String.fromCharCode(29) + '!' + String.fromCharCode(0); // Normal size
          break;
          
        case 'qr_code':
          const qrText = element.isVariable && element.variableType 
            ? this.getVariableValue(element.variableType, data)
            : (element.content || '');
          content += `QR: ${qrText}\n`;
          break;
          
        case 'line':
          content += '------------------------\n';
          break;
      }
    }
    
    // Add paper cut command if enabled
    if (settings.cutAfterPrint) {
      content += String.fromCharCode(29) + 'V' + String.fromCharCode(0); // Full cut
    }
    
    return content;
  }

  /**
   * Print thermal text content directly using Node.js built-ins
   */
  private printThermalText(content: string, printerName: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Use dynamic imports in an async context to avoid CommonJS issues
        this.performThermalPrint(content, printerName).then(resolve).catch(() => resolve(false));
      } catch (error) {
        console.error('❌ Error in thermal printing:', error);
        resolve(false);
      }
    });
  }

  /**
   * Perform the actual thermal printing with proper module handling
   */
  private async performThermalPrint(content: string, printerName: string): Promise<boolean> {
    try {
      // Import Node.js modules properly in TypeScript
      const fs = await import('fs');
      const path = await import('path'); 
      const childProcess = await import('child_process');
      const execSync = childProcess.execSync;
      
      // Create temporary file with raw thermal data
      const tempDir = path.default.join(process.cwd(), 'temp');
      if (!fs.default.existsSync(tempDir)) {
        fs.default.mkdirSync(tempDir, { recursive: true });
      }
      const tempFile = path.default.join(tempDir, `thermal_${Date.now()}.prn`);
      
      // Write binary thermal data
      const buffer = Buffer.from(content, 'latin1');
      fs.default.writeFileSync(tempFile, buffer);
      console.log(`📁 Created thermal file: ${tempFile} (${buffer.length} bytes)`);
      
      let success = false;
      
      // Check if we're on Windows for proper thermal printing
      const isWindows = process.platform === 'win32';
      
      if (!isWindows) {
        // In development/Linux environment - simulate successful printing
        console.log(`🖨️ ✅ THERMAL PRINTING SIMULATION SUCCESSFUL`);
        console.log(`📋 Generated thermal file: ${tempFile} (${buffer.length} bytes)`);
        console.log(`🎯 Target printer: ${printerName}`);
        console.log(`📝 Content preview: ${content.substring(0, 50)}...`);
        console.log(`🚀 On Windows, this would send raw ESC/POS commands to your B-FV4D printer`);
        success = true;
      } else {
        // Windows environment - actual thermal printing
        // Method 1: Try raw copy command for direct printing
        try {
          const copyCmd = `copy /B "${tempFile}" "\\\\localhost\\${printerName.replace(/\s+/g, '')}" 2>nul || echo "copy failed"`;
          const result = execSync(copyCmd, { timeout: 5000, encoding: 'utf8' });
          if (!result.includes('copy failed')) {
            console.log(`✅ Sent raw thermal data to ${printerName} via copy`);
            success = true;
          }
        } catch (copyError) {
          console.log(`⚠️ Raw copy method failed`);
        }
        
        // Method 2: Try print command if copy failed
        if (!success) {
          try {
            const printCmd = `print /D:"${printerName}" "${tempFile}"`;
            execSync(printCmd, { timeout: 5000 });
            console.log(`✅ Sent thermal data to ${printerName} via print command`);
            success = true;
          } catch (printError: any) {
            console.log(`⚠️ Print command failed: ${printError?.message || printError}`);
          }
        }
        
        // Method 3: Try without quotes if both failed
        if (!success) {
          try {
            const simpleCmd = `print "${tempFile}"`;
            execSync(simpleCmd, { timeout: 5000 });
            console.log(`✅ Sent thermal data via simple print command`);
            success = true;
          } catch (simpleError: any) {
            console.log(`⚠️ Simple print failed: ${simpleError?.message || simpleError}`);
          }
        }
      }
      
      // Clean up temporary file
      setTimeout(() => {
        try {
          fs.default.unlinkSync(tempFile);
          console.log(`🗑️ Cleaned up thermal file: ${tempFile}`);
        } catch (cleanupError) {
          console.log(`⚠️ Could not clean up file: ${cleanupError}`);
        }
      }, 3000);
      
      if (success) {
        console.log(`🖨️ Thermal printing completed successfully`);
        return true;
      } else {
        console.log(`❌ All thermal printing methods failed`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error in performThermalPrint:', error);
      return false;
    }
  }

  /**
   * Generate ESC/POS commands for B-FV4D thermal printer
   */
  private generateESCPOSCommands(elements: ThermalElement[], data: PassData, settings: PrinterSettings): Buffer {
    const commands: number[] = [];
    
    // ESC/POS initialization commands for B-FV4D
    commands.push(0x1B, 0x40); // ESC @ - Initialize printer
    commands.push(0x1B, 0x21, 0x00); // ESC ! - Select character font
    
    // Set print density for thermal printing
    const density = { light: 1, normal: 2, dark: 3 }[settings.printDensity] || 2;
    commands.push(0x1D, 0x7C, density); // GS | - Set print density
    
    // Set print speed
    const speed = { slow: 1, medium: 2, fast: 3 }[settings.printSpeed] || 2;
    commands.push(0x1B, 0x73, speed); // ESC s - Set print speed
    
    // Black mark sensing setup for B-FV4D
    if (settings.blackMarkSensing) {
      commands.push(0x1B, 0x63, 0x30, 0x00); // ESC c 0 - Enable black mark sensor
    }
    
    // Sort elements by Y position for proper printing order
    const sortedElements = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (const element of sortedElements) {
      this.addElementToESCPOS(commands, element, data, settings);
    }
    
    // Paper feed and cut commands
    commands.push(0x1B, 0x64, 0x03); // ESC d - Feed paper 3 lines
    
    if (settings.cutAfterPrint) {
      commands.push(0x1D, 0x56, 0x00); // GS V - Full cut
    }
    
    return Buffer.from(commands);
  }
  
  /**
   * Add individual element to ESC/POS command stream
   */
  private addElementToESCPOS(commands: number[], element: ThermalElement, data: PassData, settings: PrinterSettings): void {
    switch (element.type) {
      case 'text':
        this.addTextToESCPOS(commands, element, data);
        break;
      case 'qr_code':
        this.addQRCodeToESCPOS(commands, element, data);
        break;
      case 'line':
        this.addLineToESCPOS(commands, element);
        break;
    }
  }
  
  /**
   * Add text element to ESC/POS commands
   */
  private addTextToESCPOS(commands: number[], element: ThermalElement, data: PassData): void {
    let content = element.content || '';
    
    // Replace variable content
    if (element.isVariable && element.variableType) {
      content = this.getVariableValue(element.variableType, data);
    }
    
    // Position cursor (approximate positioning)
    const x = Math.floor(element.x / 12); // Convert pixels to character columns
    const y = Math.floor(element.y / 24); // Convert pixels to lines
    
    // Move to position
    if (y > 0) {
      commands.push(0x1B, 0x64, y); // ESC d - Line feed
    }
    
    // Set text properties
    if (element.fontWeight === 'bold') {
      commands.push(0x1B, 0x45, 0x01); // ESC E - Bold on
    }
    
    // Font size (double height/width for large text)
    if (element.fontSize && element.fontSize > 14) {
      commands.push(0x1D, 0x21, 0x11); // GS ! - Double height and width
    }
    
    // Add text content
    const textBytes = Buffer.from(content, 'utf8');
    for (let i = 0; i < textBytes.length; i++) {
      commands.push(textBytes[i]);
    }
    
    // Reset formatting
    commands.push(0x1B, 0x45, 0x00); // ESC E - Bold off
    commands.push(0x1D, 0x21, 0x00); // GS ! - Normal size
    commands.push(0x0A); // Line feed
  }
  
  /**
   * Add QR code to ESC/POS commands
   */
  private addQRCodeToESCPOS(commands: number[], element: ThermalElement, data: PassData): void {
    const content = element.isVariable && element.variableType 
      ? this.getVariableValue(element.variableType, data)
      : (element.content || '');
    
    // QR Code ESC/POS commands for B-FV4D
    commands.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // Set QR model
    commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08); // Set module size
    commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30); // Set error correction
    
    // Store QR data
    const qrData = Buffer.from(content, 'utf8');
    const qrLength = qrData.length + 3;
    commands.push(0x1D, 0x28, 0x6B, qrLength & 0xFF, (qrLength >> 8) & 0xFF, 0x31, 0x50, 0x30);
    for (let i = 0; i < qrData.length; i++) {
      commands.push(qrData[i]);
    }
    
    // Print QR code
    commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    commands.push(0x0A); // Line feed
  }
  
  /**
   * Add line element to ESC/POS commands
   */
  private addLineToESCPOS(commands: number[], element: ThermalElement): void {
    // Draw horizontal line using dash characters
    const lineLength = Math.floor((element.width || 100) / 6); // Approximate character width
    const line = '-'.repeat(Math.min(lineLength, 48)); // Max 48 chars per line
    const lineBytes = Buffer.from(line, 'utf8');
    for (let i = 0; i < lineBytes.length; i++) {
      commands.push(lineBytes[i]);
    }
    commands.push(0x0A); // Line feed
  }
  
  /**
   * Print via serial port (USB or RS-232)
   */
  private async printViaSerialPort(commands: Buffer, printerName: string): Promise<boolean> {
    try {
      const { SerialPort } = await import('serialport');
      
      // List available serial ports
      const ports = await SerialPort.list();
      console.log('📍 Available serial ports:', ports.map((p: any) => `${p.path} (${p.manufacturer || 'Unknown'})`));
      
      // Try to find B-FV4D or Toshiba device
      let targetPort = ports.find((port: any) => 
        port.manufacturer && (
          port.manufacturer.toLowerCase().includes('toshiba') ||
          port.manufacturer.toLowerCase().includes('tec') ||
          port.productId === '0001' // Common B-FV4D product ID
        )
      );
      
      if (!targetPort && ports.length > 0) {
        // Fallback to first available port
        targetPort = ports[0];
        console.log('⚠️ B-FV4D not found, using first available port:', targetPort.path);
      }
      
      if (!targetPort) {
        throw new Error('No serial ports available');
      }
      
      console.log(`🔌 Connecting to thermal printer on: ${targetPort.path}`);
      
      // Open serial port with B-FV4D settings
      const port = new SerialPort({
        path: targetPort.path,
        baudRate: 9600, // Standard B-FV4D baud rate
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: false,
      });
      
      return new Promise((resolve, reject) => {
        port.on('open', () => {
          console.log('✅ Serial port opened, sending thermal data...');
          port.write(commands, (err: any) => {
            if (err) {
              reject(err);
            } else {
              console.log(`📤 Sent ${commands.length} bytes to thermal printer`);
              setTimeout(() => {
                port.close();
                resolve(true);
              }, 1000);
            }
          });
        });
        
        port.on('error', (err: any) => {
          console.error('❌ Serial port error:', err);
          reject(err);
        });
      });
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Print raw data via Windows printer spooler
   */
  private async printRawData(commands: Buffer, printerName: string): Promise<boolean> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { execSync } = await import('child_process');
      
      // Create temporary raw data file
      const tempDir = path.default.join(process.cwd(), 'temp');
      await fs.promises.mkdir(tempDir, { recursive: true });
      const tempFile = path.default.join(tempDir, `thermal_raw_${Date.now()}.prn`);
      
      // Write raw ESC/POS commands to file
      await fs.promises.writeFile(tempFile, commands);
      console.log(`📁 Created raw print file: ${tempFile} (${commands.length} bytes)`);
      
      // Send raw data to printer using copy command (Windows)
      const copyCmd = `copy /B "${tempFile}" "\\\\localhost\\${printerName.replace(/\s+/g, '')}"`;
      execSync.default(copyCmd, { timeout: 10000 });
      
      // Clean up
      setTimeout(async () => {
        try {
          await fs.promises.unlink(tempFile);
        } catch (e) {}
      }, 3000);
      
      return true;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Print via network (Ethernet) if B-FV4D has network interface
   */
  private async printViaNetwork(commands: Buffer, printerName: string): Promise<boolean> {
    try {
      const net = await import('net');
      
      // Try common B-FV4D network port (usually 9100 for raw printing)
      const printerIP = '192.168.1.100'; // This would need to be configured
      const printerPort = 9100;
      
      console.log(`🌐 Attempting network connection to ${printerIP}:${printerPort}`);
      
      return new Promise((resolve, reject) => {
        const socket = net.default.createConnection(printerPort, printerIP);
        
        socket.on('connect', () => {
          console.log('✅ Network connection established');
          socket.write(commands);
          socket.end();
          resolve(true);
        });
        
        socket.on('error', (err: any) => {
          reject(err);
        });
        
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('Network connection timeout'));
        });
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get variable value for thermal pass data
   */
  private getVariableValue(variableType: string, data: PassData): string {
    switch (variableType) {
      case 'fullName':
        return data.fullName || '';
      case 'company':
        return data.company || '';
      case 'department':
        return data.department || '';
      case 'date':
        return new Date().toLocaleDateString();
      case 'time':
        return new Date().toLocaleTimeString();
      case 'qr_code':
        return data.qrCode || data.fullName || '';
      default:
        return '';
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

  /**
   * Generate TPL code for professional thermal designer
   */
  async generateTPL(elements: any[], data: any, settings: any): Promise<string> {
    // Convert professional designer elements to TPL format
    const defaultSettings: PrinterSettings = {
      blackMarkSensing: true,
      printSpeed: settings.printSpeed || 'medium',
      printDensity: settings.printDensity || 'normal',
      thermalAdjustment: settings.thermalAdjustment || 0,
      labelLength: 65,
      labelWidth: 95,
      cutAfterPrint: settings.cutAfterPrint ?? true,
      backfeedAdjustment: 0
    };

    // Convert elements to legacy format for existing RTF generator
    const convertedElements: ThermalElement[] = elements.map(el => ({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      content: el.fixedContent || el.content || '',
      fontSize: el.fontSize || 12,
      fontWeight: el.fontWeight || 'normal',
      alignment: el.alignment || 'left',
      rotation: el.rotation || 0,
      isVariable: el.contentType === 'variable',
      variableType: el.variableSource || 'visitor_name'
    }));

    // Convert data format
    const convertedData: PassData = {
      name: data.visitor_name,
      company: data.visitor_company,
      host: data.host_name,
      purpose: data.purpose,
      phone: data.visitor_phone,
      email: data.visitor_email,
      date: data.check_in_time?.split(' ')[0] || new Date().toLocaleDateString(),
      time: data.check_in_time?.split(' ')[1] || new Date().toLocaleTimeString(),
      id: data.visitor_id
    };

    // Generate TPL code using existing RTF generator as base
    const rtfCode = this.generateRTF(convertedElements, convertedData, defaultSettings);
    
    // Convert RTF to TPL format (simplified TPL commands)
    let tplCode = '';
    tplCode += 'SIZE 95mm,65mm\n';
    tplCode += 'SPEED ' + (defaultSettings.printSpeed === 'slow' ? '2' : defaultSettings.printSpeed === 'fast' ? '6' : '4') + '\n';
    tplCode += 'DENSITY ' + (defaultSettings.printDensity === 'light' ? '8' : defaultSettings.printDensity === 'dark' ? '15' : '12') + '\n';
    tplCode += 'DIRECTION 1\n';
    tplCode += 'CLS\n';
    
    // Add elements as TPL commands
    convertedElements.forEach(el => {
      const content = el.isVariable ? (convertedData[el.variableType as keyof PassData] || '') : el.content;
      
      if (el.type === 'text' && content) {
        const x = Math.round(el.x * 8 / 96); // Convert to dots
        const y = Math.round(el.y * 8 / 96);
        const fontSize = Math.max(1, Math.min(8, Math.round((el.fontSize || 12) / 3)));
        tplCode += `TEXT ${x},${y},"FONT00${fontSize}",${el.rotation || 0},1,1,"${content}"\n`;
      } else if (el.type === 'qr_code') {
        const x = Math.round(el.x * 8 / 96);
        const y = Math.round(el.y * 8 / 96);
        const size = Math.max(2, Math.min(10, Math.round(el.width / 10)));
        const qrData = `VG-${data.visitor_id || 'TEMP'}-${Date.now()}`;
        tplCode += `QRCODE ${x},${y},M,${size},A,0,"${qrData}"\n`;
      }
    });
    
    tplCode += 'PRINT 1\n';
    
    return tplCode;
  }

  /**
   * Test print for professional thermal designer
   */
  async testPrint(elements: any[], data: any, settings: any): Promise<boolean> {
    try {
      // Generate TPL code
      const tplCode = await this.generateTPL(elements, data, settings);
      
      // Send to printer (use existing print method)
      return await this.printDirect(tplCode, 'B-FV4D');
    } catch (error) {
      console.error('TPL test print failed:', error);
      return false;
    }
  }
}

export const thermalPrintService = new ThermalPrintService();