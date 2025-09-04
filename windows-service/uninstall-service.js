/**
 * Windows Service Uninstaller Script
 * Removes VisiGate Print Service from Windows services
 */

const path = require('path');
const Service = require('node-windows').Service;

// Create a new service object
const svc = new Service({
  name: 'VisiGate Print Service',
  script: path.join(__dirname, 'VisiGatePrintService.js')
});

// Listen for the "uninstall" event
svc.on('uninstall', () => {
  console.log('✅ VisiGate Print Service has been uninstalled');
  console.log('🗑️ Service removed from Windows services');
});

// Listen for error events
svc.on('error', (error) => {
  console.error('❌ Uninstall error:', error);
});

// Check if service exists
svc.on('doesnotexist', () => {
  console.log('⚠️ Service is not installed');
});

// Uninstall the service
console.log('🗑️ Uninstalling VisiGate Print Service...');
console.log('⚠️ This requires Administrator privileges');
svc.uninstall();