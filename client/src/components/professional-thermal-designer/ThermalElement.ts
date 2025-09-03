// Professional Thermal Pass Element Types
// Designed for industry-standard thermal printers (TEC/Toshiba B-FV4D, Zebra ZT230/ZT410)

export interface ThermalElementBase {
  id: string;
  type: 'text' | 'qr_code' | 'image' | 'line' | 'rectangle' | 'barcode';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  visible: boolean;
  locked: boolean;
  layer: number; // Z-index for layering
}

export interface TextElement extends ThermalElementBase {
  type: 'text';
  contentType: 'fixed' | 'variable';
  
  // Fixed content
  fixedContent?: string;
  
  // Variable content
  variableSource?: 'visitor_name' | 'visitor_company' | 'visitor_phone' | 'visitor_email' | 
                   'host_name' | 'purpose' | 'date' | 'time' | 'check_in_time' | 
                   'visitor_id' | 'badge_number' | 'expiry_date' | 'custom_field';
  customFieldName?: string;
  
  // Formatting
  fontFamily: 'arial' | 'helvetica' | 'courier' | 'times' | 'thermal_default';
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  alignment: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  letterSpacing: number;
  
  // Styling
  textColor: string;
  backgroundColor?: string;
  border?: {
    enabled: boolean;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    color: string;
  };
  
  // Text wrapping and truncation
  wordWrap: boolean;
  textOverflow: 'clip' | 'ellipsis' | 'break';
  maxLines?: number;
  
  // Thermal printer specific
  thermalIntensity: number; // 1-10 for print darkness
  printQuality: 'draft' | 'normal' | 'high';
}

export interface QRCodeElement extends ThermalElementBase {
  type: 'qr_code';
  
  // Data source configuration
  dataType: 'visitor_data' | 'check_in_url' | 'custom_json' | 'fixed_text';
  
  // Visitor data configuration
  includeFields: {
    visitor_id: boolean;
    visitor_name: boolean;
    company: boolean;
    check_in_time: boolean;
    expiry_time: boolean;
    host: boolean;
    purpose: boolean;
    phone: boolean;
    email: boolean;
    custom_fields: boolean;
  };
  
  // QR Code formatting
  errorCorrection: 'L' | 'M' | 'Q' | 'H'; // Low, Medium, Quartile, High
  quietZone: number; // Border around QR code
  moduleSize: number; // Size of individual QR modules
  
  // Custom data
  customData?: string;
  fixedText?: string;
  
  // Thermal printer specific
  printMethod: 'bitmap' | 'native_qr'; // Use printer's built-in QR or bitmap
  thermalIntensity: number;
}

export interface ImageElement extends ThermalElementBase {
  type: 'image';
  
  // Image source
  imageType: 'company_logo' | 'uploaded_image' | 'url' | 'placeholder';
  imageUrl?: string;
  uploadedImageId?: string;
  
  // Image processing
  scaling: 'fit' | 'fill' | 'stretch' | 'original';
  alignment: 'top-left' | 'top-center' | 'top-right' | 
             'center-left' | 'center' | 'center-right' |
             'bottom-left' | 'bottom-center' | 'bottom-right';
  
  // Image effects
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  invert: boolean;
  
  // Border and styling
  border?: {
    enabled: boolean;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    color: string;
  };
  
  // Thermal printer specific
  dithering: 'none' | 'floyd_steinberg' | 'ordered' | 'threshold';
  thermalIntensity: number;
  printQuality: 'draft' | 'normal' | 'high';
}

export interface LineElement extends ThermalElementBase {
  type: 'line';
  
  // Line properties
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
  color: string;
  
  // Line type
  lineType: 'horizontal' | 'vertical' | 'diagonal';
  
  // Thermal printer specific
  thermalIntensity: number;
}

export interface RectangleElement extends ThermalElementBase {
  type: 'rectangle';
  
  // Rectangle properties
  borderWidth: number;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  borderColor: string;
  fillColor?: string;
  cornerRadius: number;
  
  // Thermal printer specific
  thermalIntensity: number;
  filled: boolean;
}

export interface BarcodeElement extends ThermalElementBase {
  type: 'barcode';
  
  // Barcode data
  dataType: 'visitor_id' | 'badge_number' | 'custom_field' | 'fixed_text';
  fixedText?: string;
  customFieldName?: string;
  
  // Barcode type
  barcodeType: 'code128' | 'code39' | 'ean13' | 'ean8' | 'upc' | 'interleaved2of5';
  
  // Barcode formatting
  showText: boolean;
  textPosition: 'above' | 'below';
  barHeight: number;
  narrowBarWidth: number;
  wideBarWidth: number;
  
  // Thermal printer specific
  thermalIntensity: number;
  printQuality: 'draft' | 'normal' | 'high';
}

export type ThermalElement = TextElement | QRCodeElement | ImageElement | LineElement | RectangleElement | BarcodeElement;

// Professional thermal pass template
export interface ThermalPassTemplate {
  id: string;
  name: string;
  description: string;
  category: 'visitor' | 'contractor' | 'staff' | 'temporary' | 'custom';
  
  // Pass dimensions (in pixels at 203 DPI for thermal printers)
  width: number;  // Default: 361px (95mm)
  height: number; // Default: 247px (65mm)
  
  // Template settings
  backgroundColor: string;
  borderEnabled: boolean;
  borderWidth: number;
  borderColor: string;
  
  // Elements
  elements: ThermalElement[];
  
  // Printer compatibility
  compatiblePrinters: ('tec_b_fv4d' | 'zebra_zt230' | 'zebra_zt410' | 'generic_epl' | 'generic_zpl')[];
  
  // Template metadata
  createdAt: string;
  updatedAt: string;
  version: string;
  isReadOnly: boolean;
}

// Professional print settings
export interface ThermalPrintSettings {
  printerType: 'tec' | 'zebra' | 'generic';
  printerModel: string;
  connectionType: 'usb' | 'network' | 'serial' | 'bluetooth';
  
  // Print quality settings
  printSpeed: number; // inches per second
  printDensity: number; // 1-30 for darkness
  printMethod: 'direct_thermal' | 'thermal_transfer';
  
  // Paper settings
  paperWidth: number; // in mm
  paperHeight: number; // in mm
  paperType: 'continuous' | 'die_cut' | 'black_mark';
  
  // Advanced settings
  calibration: {
    xOffset: number;
    yOffset: number;
    rotation: number;
  };
  
  // Error handling
  errorHandling: {
    retryCount: number;
    timeoutMs: number;
    fallbackToBitmap: boolean;
  };
}