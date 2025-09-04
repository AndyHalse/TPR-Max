/**
 * Windows Service Installer Script
 * Installs VisiGate Print Service as a Windows service using node-windows
 */

const path = require('path');
const Service = require('node-windows').Service;

// Create a new service object
const svc = new Service({
  name: 'VisiGate Print Service',
  description: 'VisiGate thermal printer polling service for cloud-to-local printing',
  script: path.join(__dirname, 'VisiGatePrintService.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  workingDirectory: __dirname,
  env: [{
    name: 'NODE_ENV',
    value: 'production'
  }]
});

// Listen for the "install" event
svc.on('install', () => {
  console.log('✅ VisiGate Print Service installed successfully');
  console.log('🚀 Starting service...');
  svc.start();
});

// Listen for the "alreadyinstalled" event
svc.on('alreadyinstalled', () => {
  console.log('⚠️ Service is already installed');
  console.log('💡 Run uninstall-service.js first if you want to reinstall');
});

// Listen for the "start" event
svc.on('start', () => {
  console.log('✅ VisiGate Print Service started successfully');
  console.log('\n📋 Next steps:');
  console.log('1. Copy config.json.example to config.json');
  console.log('2. Edit config.json with your API token and printer settings');
  console.log('3. Restart the service: net stop "VisiGate Print Service" && net start "VisiGate Print Service"');
  console.log('\n📊 Check service status: sc query "VisiGate Print Service"');
  console.log('📁 View logs in: %LOCALAPPDATA%\\VisiGate Print Service\\daemon\\');
});

// Listen for error events
svc.on('error', (error) => {
  console.error('❌ Service error:', error);
});

// Install the service
console.log('📦 Installing VisiGate Print Service...');
console.log('⚠️ This requires Administrator privileges');
svc.install();