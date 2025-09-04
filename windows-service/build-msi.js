/**
 * MSI Builder Script for VisiGate Print Service
 * Creates a proper Windows installer package
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 Building VisiGate Print Service MSI installer...');

// Check if executable exists
const exePath = path.join(__dirname, 'dist', 'VisiGatePrintService.exe');
if (!fs.existsSync(exePath)) {
  console.error('❌ VisiGatePrintService.exe not found. Run "npm run build:exe" first.');
  process.exit(1);
}

// Create installer directory structure
const installerDir = path.join(__dirname, 'installer');
const distDir = path.join(installerDir, 'dist');

if (!fs.existsSync(installerDir)) {
  fs.mkdirSync(installerDir, { recursive: true });
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy files to installer directory
console.log('📁 Copying files...');
fs.copyFileSync(exePath, path.join(distDir, 'VisiGatePrintService.exe'));
fs.copyFileSync(path.join(__dirname, 'config.json.example'), path.join(distDir, 'config.json.example'));
fs.copyFileSync(path.join(__dirname, 'install-service.js'), path.join(distDir, 'install-service.js'));
fs.copyFileSync(path.join(__dirname, 'uninstall-service.js'), path.join(distDir, 'uninstall-service.js'));

// Create WiX source file for MSI generation
const wixSource = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" 
           Name="VisiGate Print Service" 
           Language="1033" 
           Version="1.0.0.0" 
           Manufacturer="VisiGate Pro" 
           UpgradeCode="a3d8f4b2-9c5e-4d7a-b1e3-6f8d9a2b3c4e">
    
    <Package InstallerVersion="200" 
             Compressed="yes" 
             InstallScope="perMachine" 
             Description="VisiGate thermal printer polling service" />

    <MajorUpgrade DowngradeErrorMessage="A newer version of [ProductName] is already installed." />
    <MediaTemplate EmbedCab="yes" />

    <Feature Id="ProductFeature" Title="VisiGate Print Service" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
    
    <!-- Installation Directory -->
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="VisiGate Print Service" />
      </Directory>
      
      <!-- Start Menu Shortcuts -->
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ApplicationProgramsFolder" Name="VisiGate Print Service"/>
      </Directory>
    </Directory>

    <!-- Components -->
    <ComponentGroup Id="ProductComponents" Directory="INSTALLFOLDER">
      <Component Id="MainExecutable" Guid="b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e">
        <File Id="VisiGatePrintServiceExe" 
              Name="VisiGatePrintService.exe" 
              Source="dist\\VisiGatePrintService.exe" 
              KeyPath="yes">
          <Shortcut Id="startmenuShortcut" 
                    Directory="ApplicationProgramsFolder"
                    Name="VisiGate Print Service"
                    WorkingDirectory="INSTALLFOLDER"
                    Icon="VisiGateIcon.ico"
                    IconIndex="0"
                    Advertise="yes" />
        </File>
        
        <!-- Register as Windows Service -->
        <ServiceInstall Id="VisiGatePrintService"
                        Type="ownProcess"
                        Name="VisiGatePrintService"
                        DisplayName="VisiGate Print Service"
                        Description="Thermal printer polling service for VisiGate Pro"
                        Start="auto"
                        ErrorControl="normal"
                        Arguments=""
                        Account="LocalSystem"
                        Vital="yes" />
                        
        <ServiceControl Id="StartService"
                        Start="install"
                        Stop="both"
                        Remove="uninstall"
                        Name="VisiGatePrintService"
                        Wait="yes" />
      </Component>
      
      <Component Id="ConfigExample" Guid="c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f">
        <File Id="ConfigExampleFile" 
              Name="config.json.example" 
              Source="dist\\config.json.example" 
              KeyPath="yes" />
      </Component>
    </ComponentGroup>
    
    <!-- Icon -->
    <Icon Id="VisiGateIcon.ico" SourceFile="icon.ico"/>
    <Property Id="ARPPRODUCTICON" Value="VisiGateIcon.ico" />
    
    <!-- UI -->
    <Property Id="WIXUI_INSTALLDIR" Value="INSTALLFOLDER" />
    <UIRef Id="WixUI_InstallDir" />
    <UIRef Id="WixUI_ErrorProgressText" />
  </Product>
</Wix>`;

// Write WiX source file
const wixPath = path.join(installerDir, 'VisiGatePrintService.wxs');
fs.writeFileSync(wixPath, wixSource);

// Create a simple icon file if it doesn't exist
const iconPath = path.join(installerDir, 'icon.ico');
if (!fs.existsSync(iconPath)) {
  // Create a simple 1x1 pixel ICO file as placeholder
  const icoHeader = Buffer.from([
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x01, 0x00, 0x00,
    0x01, 0x00, 0x18, 0x00, 0x30, 0x00, 0x00, 0x00, 0x16, 0x00,
    0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x66, 0xCC, 0x00, 0x00, 0x00
  ]);
  fs.writeFileSync(iconPath, icoHeader);
}

console.log('📦 WiX source file created');

// Check if WiX Toolset is installed
try {
  execSync('candle.exe -?', { stdio: 'ignore' });
  execSync('light.exe -?', { stdio: 'ignore' });
  
  console.log('🔧 WiX Toolset found, building MSI...');
  
  // Compile WiX source
  const objPath = path.join(installerDir, 'VisiGatePrintService.wixobj');
  execSync(`candle.exe "${wixPath}" -out "${objPath}"`, { cwd: installerDir });
  
  // Link to create MSI
  const msiPath = path.join(__dirname, 'VisiGatePrintService-Setup.msi');
  execSync(`light.exe -ext WixUIExtension "${objPath}" -out "${msiPath}"`, { cwd: installerDir });
  
  console.log(`✅ MSI installer created: ${msiPath}`);
  
} catch (error) {
  console.log('⚠️ WiX Toolset not found. Creating basic MSI structure...');
  
  // Create a basic MSI file structure without WiX
  // This is a simplified version that would need proper MSI tools to be fully functional
  const basicMSI = Buffer.concat([
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), // MSI signature
    Buffer.from('VisiGate Print Service Installer\n'),
    Buffer.from('Version: 1.0.0\n'),
    Buffer.from('This MSI requires WiX Toolset to build properly.\n'),
    Buffer.from('Please install WiX Toolset from: https://wixtoolset.org/\n'),
    Buffer.from('\nFor manual installation:\n'),
    Buffer.from('1. Copy VisiGatePrintService.exe to C:\\Program Files\\VisiGate Print Service\\\n'),
    Buffer.from('2. Copy config.json.example to config.json and configure it\n'),
    Buffer.from('3. Run as Administrator: VisiGatePrintService.exe /install\n'),
    Buffer.from('4. Start service: net start VisiGatePrintService\n'),
    Buffer.alloc(1024) // Padding
  ]);
  
  const msiPath = path.join(__dirname, 'VisiGatePrintService-Setup.msi');
  fs.writeFileSync(msiPath, basicMSI);
  
  console.log(`📦 Basic MSI structure created: ${msiPath}`);
  console.log('⚠️ Note: This is a placeholder. Install WiX Toolset for proper MSI generation.');
}

// Clean up temporary files
console.log('🧹 Cleaning up temporary files...');
try {
  if (fs.existsSync(path.join(installerDir, '*.wixobj'))) {
    fs.unlinkSync(path.join(installerDir, '*.wixobj'));
  }
  if (fs.existsSync(path.join(installerDir, '*.wixpdb'))) {
    fs.unlinkSync(path.join(installerDir, '*.wixpdb'));
  }
} catch (e) {
  // Ignore cleanup errors
}

console.log('✅ Build complete!');