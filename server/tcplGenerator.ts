/**
 * TCPL (TEC Command Printer Language) Generator for TEC/Toshiba B-FV4D Printer
 * Generates native printer commands for direct thermal printing
 * Pass size: 95mm x 65mm
 */

export interface TCPLElement {
  id: string;
  type: 'text' | 'qr_code' | 'barcode' | 'line' | 'rectangle' | 'image';
  x: number; // in mm
  y: number; // in mm
  width?: number;
  height?: number;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  rotation?: 0 | 90 | 180 | 270;
  isVariable?: boolean;
  variableType?: string;
}

export interface TCPLPrintData {
  visitorName: string;
  company: string;
  host: string;
  purpose?: string;
  date: string;
  time: string;
  passId: string;
  checkInTime: string;
  checkOutTime?: string;
  customerId: string;
  validUntil: string;
  qrData?: string;
}

export interface TCPLSettings {
  printDensity: number; // 0-15
  printSpeed: number; // 1-10 (1=slow, 10=fast)
  mediaType: 'direct' | 'transfer';
  labelWidth: number; // in mm
  labelHeight: number; // in mm
  darkness: number; // 0-30
  cutterEnabled: boolean;
  backfeedEnabled: boolean;
}

export class TCPLGenerator {
  private readonly DPI = 203; // B-FV4D is 203 DPI
  private readonly MM_TO_DOTS = 8; // 203 DPI / 25.4 mm per inch ≈ 8 dots per mm
  
  /**
   * Generate complete TCPL command sequence for a thermal pass
   */
  generateTCPL(
    elements: TCPLElement[], 
    data: TCPLPrintData, 
    settings: TCPLSettings
  ): string {
    let tcpl = '';
    
    // Initialize printer and clear buffer
    tcpl += this.initializePrinter(settings);
    
    // Set label dimensions
    tcpl += this.setLabelDimensions(settings.labelWidth, settings.labelHeight);
    
    // Process each element
    const processedElements = this.preprocessElements(elements, data);
    for (const element of processedElements) {
      tcpl += this.generateElementCommand(element, data);
    }
    
    // Print and cut command
    tcpl += this.generatePrintCommand(settings);
    
    return tcpl;
  }
  
  /**
   * Initialize printer with settings
   */
  private initializePrinter(settings: TCPLSettings): string {
    let cmd = '';
    
    // Start of job
    cmd += '{I}\n'; // Initialize printer
    cmd += '{S|M|}\n'; // Set to metric units (mm)
    
    // Set print density/darkness
    cmd += `{D${String(settings.darkness).padStart(4, '0')}|}\n`;
    
    // Set print speed (2-10 inches/sec for B-FV4D)
    const speedMap: { [key: number]: string } = {
      1: '0020', 2: '0030', 3: '0040', 4: '0050', 5: '0060',
      6: '0070', 7: '0080', 8: '0090', 9: '0100', 10: '0100'
    };
    cmd += `{S${speedMap[settings.printSpeed] || '0050'}|}\n`;
    
    // Clear image buffer
    cmd += '{C|}\n';
    
    // Set media type
    if (settings.mediaType === 'direct') {
      cmd += '{M|D|}\n'; // Direct thermal
    } else {
      cmd += '{M|T|}\n'; // Thermal transfer
    }
    
    return cmd;
  }
  
  /**
   * Set label dimensions
   */
  private setLabelDimensions(width: number, height: number): string {
    // Convert mm to dots
    const widthDots = Math.round(width * this.MM_TO_DOTS);
    const heightDots = Math.round(height * this.MM_TO_DOTS);
    
    // Format: {D<pitch>,<width>,<height>|}
    return `{D${String(heightDots).padStart(4, '0')},${String(widthDots).padStart(4, '0')},${String(heightDots).padStart(4, '0')}|}\n`;
  }
  
  /**
   * Preprocess elements to resolve variables
   */
  private preprocessElements(elements: TCPLElement[], data: TCPLPrintData): TCPLElement[] {
    return elements.map(element => {
      if (element.isVariable && element.variableType) {
        return {
          ...element,
          content: this.resolveVariable(element.variableType, data)
        };
      }
      return element;
    });
  }
  
  /**
   * Generate TCPL command for individual element
   */
  private generateElementCommand(element: TCPLElement, data: TCPLPrintData): string {
    switch (element.type) {
      case 'text':
        return this.generateTextCommand(element);
      case 'qr_code':
        return this.generateQRCommand(element, data);
      case 'barcode':
        return this.generateBarcodeCommand(element);
      case 'line':
        return this.generateLineCommand(element);
      case 'rectangle':
        return this.generateRectangleCommand(element);
      case 'image':
        return this.generateImageCommand(element);
      default:
        return '';
    }
  }
  
  /**
   * Generate text printing command
   */
  private generateTextCommand(element: TCPLElement): string {
    let cmd = '';
    
    // Convert position from mm to dots
    const x = Math.round(element.x * this.MM_TO_DOTS);
    const y = Math.round(element.y * this.MM_TO_DOTS);
    
    // Position command
    cmd += `{A${String(x).padStart(4, '0')},${String(y).padStart(4, '0')}|}\n`;
    
    // Font selection based on size
    const fontCode = this.getFontCode(element.fontSize || 12, element.fontWeight === 'bold');
    
    // Rotation
    const rotationMap: { [key: number]: string } = {
      0: '00', 90: '01', 180: '02', 270: '03'
    };
    const rotation = rotationMap[element.rotation || 0] || '00';
    
    // Text alignment
    const alignMap = { 'left': 'L', 'center': 'C', 'right': 'R' };
    const alignment = alignMap[element.alignment || 'left'] || 'L';
    
    // Print text command
    // Format: {PC<font>;<position>,<rotation>,<magnification>,<alignment>,<data>|}
    cmd += `{PC${fontCode};${String(x).padStart(4, '0')},${String(y).padStart(4, '0')},${rotation},01,${alignment},00,B|${element.content || ''}|}\n`;
    
    return cmd;
  }
  
  /**
   * Generate QR code command
   */
  private generateQRCommand(element: TCPLElement, data: TCPLPrintData): string {
    const x = Math.round(element.x * this.MM_TO_DOTS);
    const y = Math.round(element.y * this.MM_TO_DOTS);
    
    // Generate unique QR data for this visitor and day
    const qrContent = element.content || this.generateQRData(data);
    
    // QR Code parameters
    const moduleSize = '05'; // Module size (1-16)
    const errorCorrection = 'M'; // Error correction level (L/M/Q/H)
    
    // TCPL QR code command
    // Format: {XR;<x>,<y>,<error>,<module>,<mode>,<rotation>,<model>|<data>|}
    return `{XR;${String(x).padStart(4, '0')},${String(y).padStart(4, '0')},${errorCorrection},${moduleSize},A,00,1|${qrContent}|}\n`;
  }
  
  /**
   * Generate barcode command
   */
  private generateBarcodeCommand(element: TCPLElement): string {
    const x = Math.round(element.x * this.MM_TO_DOTS);
    const y = Math.round(element.y * this.MM_TO_DOTS);
    const height = element.height ? Math.round(element.height * this.MM_TO_DOTS) : 50;
    
    // Barcode type: Code 128
    // Format: {XB<type>;<x>,<y>,<height>,<narrow>,<wide>,<rotation>,<text>|<data>|}
    return `{XB01;${String(x).padStart(4, '0')},${String(y).padStart(4, '0')},${String(height).padStart(3, '0')},02,06,00,B|${element.content || ''}|}\n`;
  }
  
  /**
   * Generate line command
   */
  private generateLineCommand(element: TCPLElement): string {
    const x1 = Math.round(element.x * this.MM_TO_DOTS);
    const y1 = Math.round(element.y * this.MM_TO_DOTS);
    const x2 = Math.round((element.x + (element.width || 50)) * this.MM_TO_DOTS);
    const y2 = Math.round((element.y + (element.height || 0)) * this.MM_TO_DOTS);
    
    // Line command
    // Format: {LC;<x1>,<y1>,<x2>,<y2>,<thickness>|}
    return `{LC;${String(x1).padStart(4, '0')},${String(y1).padStart(4, '0')},${String(x2).padStart(4, '0')},${String(y2).padStart(4, '0')},02|}\n`;
  }
  
  /**
   * Generate rectangle command
   */
  private generateRectangleCommand(element: TCPLElement): string {
    const x = Math.round(element.x * this.MM_TO_DOTS);
    const y = Math.round(element.y * this.MM_TO_DOTS);
    const width = Math.round((element.width || 50) * this.MM_TO_DOTS);
    const height = Math.round((element.height || 30) * this.MM_TO_DOTS);
    
    // Rectangle command (outline)
    // Format: {LR;<x>,<y>,<width>,<height>,<thickness>,<rounding>|}
    return `{LR;${String(x).padStart(4, '0')},${String(y).padStart(4, '0')},${String(width).padStart(4, '0')},${String(height).padStart(4, '0')},02,00|}\n`;
  }
  
  /**
   * Generate image/logo command
   */
  private generateImageCommand(element: TCPLElement): string {
    const x = Math.round(element.x * this.MM_TO_DOTS);
    const y = Math.round(element.y * this.MM_TO_DOTS);
    
    // For pre-stored logos in printer memory
    // Format: {IG;<x>,<y>,<logo_number>|}
    return `{IG;${String(x).padStart(4, '0')},${String(y).padStart(4, '0')},001|}\n`;
  }
  
  /**
   * Generate print and cut command
   */
  private generatePrintCommand(settings: TCPLSettings): string {
    let cmd = '';
    
    // Issue/print command with quantity
    cmd += '{XS;I,0001,0002C0001|}\n'; // Print 1 label
    
    // Cut command if enabled
    if (settings.cutterEnabled) {
      cmd += '{XS;C,0001|}\n'; // Cut after print
    }
    
    // Backfeed if enabled
    if (settings.backfeedEnabled) {
      cmd += '{XS;B,0020|}\n'; // Backfeed 20 dots
    }
    
    return cmd;
  }
  
  /**
   * Get font code based on size
   */
  private getFontCode(fontSize: number, bold: boolean): string {
    // B-FV4D font codes (examples)
    if (fontSize <= 8) return bold ? '002' : '001';
    if (fontSize <= 10) return bold ? '004' : '003';
    if (fontSize <= 12) return bold ? '006' : '005';
    if (fontSize <= 14) return bold ? '008' : '007';
    if (fontSize <= 18) return bold ? '010' : '009';
    if (fontSize <= 24) return bold ? '012' : '011';
    return bold ? '014' : '013'; // Large
  }
  
  /**
   * Resolve variable content
   */
  private resolveVariable(variableType: string, data: TCPLPrintData): string {
    const variableMap: { [key: string]: string } = {
      'visitor_name': data.visitorName,
      'company': data.company,
      'host': data.host,
      'purpose': data.purpose || '',
      'date': data.date,
      'time': data.time,
      'pass_id': data.passId,
      'checkin_time': data.checkInTime,
      'checkout_time': data.checkOutTime || '',
      'valid_until': data.validUntil
    };
    
    return variableMap[variableType] || '';
  }
  
  /**
   * Generate unique QR data for visitor
   */
  private generateQRData(data: TCPLPrintData): string {
    const qrPayload = {
      id: `VG-${data.customerId}-${data.passId}`,
      visitor: data.visitorName,
      company: data.company,
      host: data.host,
      checkIn: data.checkInTime,
      validUntil: data.validUntil,
      date: data.date,
      customerId: data.customerId,
      type: 'visitor_pass'
    };
    
    return JSON.stringify(qrPayload);
  }
  
  /**
   * Convert design elements from pixels to TCPL elements
   */
  convertFromDesigner(designElements: any[], passWidth: number, passHeight: number): TCPLElement[] {
    return designElements.map(element => {
      // Convert from pixel coordinates to mm
      // Designer uses 361x247 pixels for 95x65mm
      const xRatio = 95 / passWidth;
      const yRatio = 65 / passHeight;
      
      return {
        id: element.id,
        type: element.type,
        x: Math.round(element.x * xRatio),
        y: Math.round(element.y * yRatio),
        width: element.width ? Math.round(element.width * xRatio) : undefined,
        height: element.height ? Math.round(element.height * yRatio) : undefined,
        content: element.fixedContent || element.content,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        alignment: element.alignment,
        rotation: element.rotation || 0,
        isVariable: element.contentType === 'variable',
        variableType: element.variableSource
      };
    });
  }
}

export default TCPLGenerator;