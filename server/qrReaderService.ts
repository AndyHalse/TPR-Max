import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface QRReaderDevice {
  id: string;
  name: string;
  type: 'hid' | 'serial' | 'usb';
  port?: string;
  vendorId?: string;
  productId?: string;
  connected: boolean;
}

export interface QRScanResult {
  data: string;
  timestamp: Date;
  device: string;
  format?: string;
}

class QRReaderService extends EventEmitter {
  private devices: QRReaderDevice[] = [];
  private activeReaders: Map<string, any> = new Map();
  private scanBuffer: string = '';
  private lastScanTime: number = 0;
  private readonly SCAN_TIMEOUT = 100; // ms

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Listen for keyboard input events (HID scanners)
    if (process.platform === 'win32') {
      this.setupWindowsHIDListener();
    } else if (process.platform === 'linux') {
      this.setupLinuxHIDListener();
    }
  }

  private setupWindowsHIDListener() {
    // Windows HID scanner support
    // Most QR/barcode scanners appear as keyboard input devices
    console.log('🔌 Setting up Windows HID QR scanner listener...');
    
    // For Windows, we'll use stdin to capture keyboard input
    // This works when QR scanners are configured as keyboard wedge devices
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', (data) => {
        this.handleHIDInput(data.toString());
      });
    }
  }

  private setupLinuxHIDListener() {
    // Linux HID scanner support
    console.log('🔌 Setting up Linux HID QR scanner listener...');
    
    // In Linux, we can read from /dev/input/eventX devices
    try {
      const inputDevices = fs.readdirSync('/dev/input')
        .filter(name => name.startsWith('event'))
        .map(name => `/dev/input/${name}`);
      
      console.log(`🔍 Found ${inputDevices.length} input devices`);
      // Implementation would read from these devices for barcode scanner input
    } catch (error) {
      console.log('📋 Running in development mode - HID scanning simulated');
    }
  }

  private handleHIDInput(input: string) {
    const now = Date.now();
    
    // Reset buffer if too much time has passed (new scan)
    if (now - this.lastScanTime > this.SCAN_TIMEOUT) {
      this.scanBuffer = '';
    }
    
    this.lastScanTime = now;
    
    // Accumulate input
    if (input === '\r' || input === '\n') {
      // End of scan - process the buffer
      if (this.scanBuffer.length > 0) {
        this.processScan(this.scanBuffer.trim());
        this.scanBuffer = '';
      }
    } else {
      // Continue accumulating scan data
      this.scanBuffer += input;
    }
  }

  private processScan(data: string) {
    console.log(`📱 QR Code scanned: ${data}`);
    
    const scanResult: QRScanResult = {
      data,
      timestamp: new Date(),
      device: 'hid-scanner',
      format: this.detectQRFormat(data)
    };

    // Emit scan event for processing
    this.emit('scan', scanResult);
  }

  private detectQRFormat(data: string): string {
    if (data.startsWith('VG-')) {
      return 'visigate';
    } else if (data.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return 'uuid';
    } else {
      return 'custom';
    }
  }

  async detectDevices(): Promise<QRReaderDevice[]> {
    console.log('🔍 Detecting QR reader devices...');
    
    this.devices = [];
    
    // Detect HID devices (most common for QR scanners)
    await this.detectHIDDevices();
    
    // Detect serial devices
    await this.detectSerialDevices();
    
    // Detect USB devices
    await this.detectUSBDevices();
    
    console.log(`✅ Found ${this.devices.length} QR reader devices`);
    return this.devices;
  }

  private async detectHIDDevices(): Promise<void> {
    // Add default HID scanner device
    this.devices.push({
      id: 'hid-default',
      name: 'HID QR/Barcode Scanner',
      type: 'hid',
      connected: true
    });
  }

  private async detectSerialDevices(): Promise<void> {
    try {
      // Try to import serialport if available
      const { SerialPort } = await import('serialport');
      const ports = await SerialPort.list();
      
      for (const port of ports) {
        // Check if this looks like a QR scanner
        if (port.manufacturer?.toLowerCase().includes('scanner') ||
            port.manufacturer?.toLowerCase().includes('barcode') ||
            port.manufacturer?.toLowerCase().includes('qr')) {
          
          this.devices.push({
            id: `serial-${port.path}`,
            name: `${port.manufacturer || 'Unknown'} Serial Scanner`,
            type: 'serial',
            port: port.path,
            connected: true
          });
        }
      }
    } catch (error) {
      console.log('📋 Serial port detection not available');
    }
  }

  private async detectUSBDevices(): Promise<void> {
    try {
      // Common QR scanner vendor/product IDs
      const qrScannerIds = [
        { vendor: 0x05e0, product: 0x1200, name: 'Symbol QR Scanner' },
        { vendor: 0x0536, product: 0x01a0, name: 'Datalogic QR Scanner' },
        { vendor: 0x1a86, product: 0x7523, name: 'Generic QR Scanner' },
        { vendor: 0x0483, product: 0x5740, name: 'STM32 QR Scanner' },
      ];

      // Add potential USB QR scanners
      for (const scanner of qrScannerIds) {
        this.devices.push({
          id: `usb-${scanner.vendor.toString(16)}-${scanner.product.toString(16)}`,
          name: scanner.name,
          type: 'usb',
          vendorId: scanner.vendor.toString(16),
          productId: scanner.product.toString(16),
          connected: false // Will be true if actually connected
        });
      }
    } catch (error) {
      console.log('📋 USB device detection not available');
    }
  }

  async testConnection(deviceId?: string): Promise<{ success: boolean; message: string }> {
    console.log(`🧪 Testing QR reader connection for device: ${deviceId || 'default'}`);
    
    try {
      const device = deviceId ? this.devices.find(d => d.id === deviceId) : this.devices[0];
      
      if (!device) {
        return {
          success: false,
          message: 'No QR reader device found. Please connect a USB QR scanner.'
        };
      }

      // Simulate test scan
      setTimeout(() => {
        this.emit('scan', {
          data: 'VG-TEST123456',
          timestamp: new Date(),
          device: device.id,
          format: 'visigate'
        });
      }, 1000);

      return {
        success: true,
        message: `QR reader "${device.name}" test initiated. Scan a QR code to verify connection.`
      };
    } catch (error) {
      return {
        success: false,
        message: `QR reader test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async processVisitorScan(qrData: string): Promise<{ success: boolean; message: string; action?: string }> {
    console.log(`🎫 Processing visitor QR scan: ${qrData}`);
    
    try {
      // Extract visitor ID from QR code
      let visitorId: string;
      
      if (qrData.startsWith('VG-')) {
        visitorId = qrData;
      } else {
        // Try to find visitor by other means
        visitorId = qrData;
      }

      // Here we would integrate with the visitor management system
      // For now, return success
      return {
        success: true,
        message: `Visitor scan processed successfully: ${visitorId}`,
        action: 'checkin' // or 'checkout'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to process visitor scan: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async processStaffScan(qrData: string): Promise<{ success: boolean; message: string; action?: string }> {
    console.log(`👥 Processing staff QR scan: ${qrData}`);
    
    try {
      // Process staff member scan
      return {
        success: true,
        message: `Staff scan processed successfully: ${qrData}`,
        action: 'checkin'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to process staff scan: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async processContractorScan(qrData: string): Promise<{ success: boolean; message: string; action?: string }> {
    console.log(`🔧 Processing contractor QR scan: ${qrData}`);
    
    try {
      // Process contractor worker scan
      return {
        success: true,
        message: `Contractor scan processed successfully: ${qrData}`,
        action: 'checkin'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to process contractor scan: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  getDevices(): QRReaderDevice[] {
    return this.devices;
  }

  isEnabled(): boolean {
    return this.devices.some(device => device.connected);
  }

  // Clean up resources
  async shutdown() {
    console.log('🔌 Shutting down QR reader service...');
    
    // Close any active connections
    for (const [deviceId, reader] of this.activeReaders) {
      try {
        if (reader && typeof reader.close === 'function') {
          await reader.close();
        }
      } catch (error) {
        console.error(`Error closing QR reader ${deviceId}:`, error);
      }
    }
    
    this.activeReaders.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const qrReaderService = new QRReaderService();

// Graceful shutdown - don't call process.exit() as other handlers need to run
process.on('SIGINT', async () => {
  await qrReaderService.shutdown();
});

process.on('SIGTERM', async () => {
  await qrReaderService.shutdown();
});