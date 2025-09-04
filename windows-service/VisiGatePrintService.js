#!/usr/bin/env node

/**
 * VisiGate Print Service - Windows Service Client
 * Polls the VisiGate server for print jobs and sends them to local thermal printers
 * 
 * This can be compiled to a Windows executable using pkg:
 * pkg VisiGatePrintService.js --targets node18-win-x64 --output VisiGatePrintService.exe
 * 
 * Then wrapped as a Windows service using node-windows or similar
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration (loaded from config.json or environment variables)
class PrintServiceConfig {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    
    try {
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        this.apiEndpoint = config.apiEndpoint || 'https://your-visigate-domain.com';
        this.apiToken = config.apiToken || process.env.VISIGATE_API_TOKEN;
        this.customerId = config.customerId || process.env.VISIGATE_CUSTOMER_ID;
        this.printerName = config.printerName || 'TEC B-EV4 Desktop Printer';
        this.printerType = config.printerType || 'tec';
        this.pollInterval = (config.pollIntervalSeconds || 3) * 1000; // Convert to ms
        this.heartbeatInterval = (config.heartbeatIntervalSeconds || 30) * 1000;
        this.tempDir = config.tempDir || path.join(__dirname, 'temp');
      } else {
        // Use defaults or environment variables
        this.apiEndpoint = process.env.VISIGATE_API_ENDPOINT || 'https://your-visigate-domain.com';
        this.apiToken = process.env.VISIGATE_API_TOKEN || '';
        this.customerId = process.env.VISIGATE_CUSTOMER_ID || '';
        this.printerName = process.env.VISIGATE_PRINTER_NAME || 'TEC B-EV4 Desktop Printer';
        this.printerType = process.env.VISIGATE_PRINTER_TYPE || 'tec';
        this.pollInterval = 3000; // 3 seconds
        this.heartbeatInterval = 30000; // 30 seconds
        this.tempDir = path.join(__dirname, 'temp');
      }
      
      // Ensure temp directory exists
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
      
      // Validate required configuration
      if (!this.apiToken) {
        throw new Error('API Token is required. Set VISIGATE_API_TOKEN environment variable or configure in config.json');
      }
      
      console.log('✅ Configuration loaded successfully');
      console.log(`📍 API Endpoint: ${this.apiEndpoint}`);
      console.log(`🖨️ Printer: ${this.printerName} (${this.printerType})`);
      console.log(`⏱️ Poll interval: ${this.pollInterval / 1000} seconds`);
      
    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      process.exit(1);
    }
  }
}

// Main Print Service Class
class VisiGatePrintService {
  constructor() {
    this.config = new PrintServiceConfig();
    this.isRunning = false;
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.jobQueue = [];
    this.processing = false;
  }

  // Start the service
  async start() {
    console.log('🚀 VisiGate Print Service starting...');
    this.isRunning = true;
    
    // Send initial heartbeat
    await this.sendHeartbeat();
    
    // Start polling for jobs
    this.startPolling();
    
    // Start heartbeat timer
    this.startHeartbeat();
    
    console.log('✅ Service started successfully');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  // Stop the service
  async stop() {
    console.log('🛑 Stopping VisiGate Print Service...');
    this.isRunning = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // Wait for current job to complete
    while (this.processing) {
      await this.sleep(100);
    }
    
    console.log('✅ Service stopped');
    process.exit(0);
  }

  // Start polling for print jobs
  startPolling() {
    if (!this.isRunning) return;
    
    this.pollForJobs().then(() => {
      // Schedule next poll
      this.pollTimer = setTimeout(() => this.startPolling(), this.config.pollInterval);
    }).catch(error => {
      console.error('❌ Poll error:', error.message);
      // Retry after a delay
      this.pollTimer = setTimeout(() => this.startPolling(), this.config.pollInterval * 2);
    });
  }

  // Poll server for pending print jobs
  async pollForJobs() {
    try {
      const url = `${this.config.apiEndpoint}/api/print-service/poll/${this.config.apiToken}`;
      const response = await this.httpGet(url);
      
      if (response.success && response.jobs && response.jobs.length > 0) {
        console.log(`📥 Received ${response.jobs.length} print job(s)`);
        
        // Process jobs sequentially
        for (const job of response.jobs) {
          await this.processJob(job);
        }
      }
    } catch (error) {
      console.error('❌ Failed to poll for jobs:', error.message);
      throw error;
    }
  }

  // Process a single print job
  async processJob(job) {
    this.processing = true;
    console.log(`🖨️ Processing job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
    
    try {
      let success = false;
      let errorMessage = null;
      
      if (job.printerType === 'tec' && job.tcplCommands) {
        // Send TCPL commands to TEC printer
        success = await this.printTCPL(job.tcplCommands, job.id);
      } else if (job.printerType === 'zebra') {
        // Handle Zebra ZPL printing (not implemented yet)
        errorMessage = 'Zebra printing not yet implemented';
      } else {
        // Fallback to raw data printing
        success = await this.printRawData(job.data, job.id);
      }
      
      // Report job status back to server
      await this.reportJobStatus(job.id, success ? 'completed' : 'failed', null, errorMessage);
      
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      await this.reportJobStatus(job.id, 'failed', null, error.message);
    } finally {
      this.processing = false;
    }
  }

  // Print TCPL commands to TEC printer
  async printTCPL(tcplCommands, jobId) {
    try {
      console.log(`📄 Sending TCPL to ${this.config.printerName}`);
      
      // Write TCPL to temp file
      const tempFile = path.join(this.config.tempDir, `job_${jobId}.tcpl`);
      fs.writeFileSync(tempFile, tcplCommands, 'utf8');
      
      // Windows command to send file directly to printer
      // Method 1: Using copy command for USB printers
      const copyCmd = `copy /B "${tempFile}" "${this.config.printerName}" 2>nul`;
      
      try {
        await execAsync(copyCmd, { timeout: 10000 });
        console.log(`✅ TCPL sent via copy command`);
        
        // Clean up temp file
        setTimeout(() => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
        }, 5000);
        
        return true;
      } catch (copyError) {
        console.log(`⚠️ Copy command failed, trying alternate method`);
        
        // Method 2: Using print command
        const printCmd = `print /D:"${this.config.printerName}" "${tempFile}"`;
        
        try {
          await execAsync(printCmd, { timeout: 10000 });
          console.log(`✅ TCPL sent via print command`);
          
          setTimeout(() => {
            try { fs.unlinkSync(tempFile); } catch (e) {}
          }, 5000);
          
          return true;
        } catch (printError) {
          // Method 3: PowerShell printing
          const psCmd = `powershell -Command "Get-Content '${tempFile}' -Raw | Out-Printer -Name '${this.config.printerName}'"`;
          
          try {
            await execAsync(psCmd, { timeout: 10000 });
            console.log(`✅ TCPL sent via PowerShell`);
            
            setTimeout(() => {
              try { fs.unlinkSync(tempFile); } catch (e) {}
            }, 5000);
            
            return true;
          } catch (psError) {
            console.error(`❌ All print methods failed`);
            throw psError;
          }
        }
      }
    } catch (error) {
      console.error(`❌ TCPL print failed:`, error.message);
      return false;
    }
  }

  // Print raw data (fallback method)
  async printRawData(data, jobId) {
    try {
      console.log(`📄 Processing raw print data for job ${jobId}`);
      
      // Convert data to printable format
      const printContent = this.formatPrintData(data);
      
      // Write to temp file
      const tempFile = path.join(this.config.tempDir, `job_${jobId}.txt`);
      fs.writeFileSync(tempFile, printContent, 'utf8');
      
      // Send to printer
      const printCmd = `print /D:"${this.config.printerName}" "${tempFile}"`;
      await execAsync(printCmd, { timeout: 10000 });
      
      // Clean up
      setTimeout(() => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }, 5000);
      
      return true;
    } catch (error) {
      console.error(`❌ Raw print failed:`, error.message);
      return false;
    }
  }

  // Format print data for fallback printing
  formatPrintData(data) {
    const { printData } = data;
    
    let content = '';
    content += '================================\n';
    content += '       VISITOR PASS\n';
    content += '================================\n\n';
    content += `Name: ${printData.visitorName}\n`;
    content += `Company: ${printData.company}\n`;
    content += `Host: ${printData.host}\n`;
    content += `Date: ${printData.date}\n`;
    content += `Time: ${printData.time}\n`;
    content += `Pass ID: ${printData.passId}\n`;
    content += '\n================================\n';
    content += `Valid Until: ${new Date(printData.validUntil).toLocaleString()}\n`;
    content += '================================\n';
    
    return content;
  }

  // Report job status back to server
  async reportJobStatus(jobId, status, resultData, errorMessage) {
    try {
      const url = `${this.config.apiEndpoint}/api/print-service/job-status`;
      const data = {
        jobId,
        status,
        resultData,
        errorMessage
      };
      
      await this.httpPost(url, data);
      console.log(`📊 Reported job ${jobId} status: ${status}`);
    } catch (error) {
      console.error(`❌ Failed to report job status:`, error.message);
    }
  }

  // Start heartbeat timer
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(error => {
        console.error('❌ Heartbeat failed:', error.message);
      });
    }, this.config.heartbeatInterval);
  }

  // Send heartbeat to server
  async sendHeartbeat() {
    try {
      const url = `${this.config.apiEndpoint}/api/print-service/heartbeat`;
      await this.httpPost(url, { apiToken: this.config.apiToken });
      console.log('💓 Heartbeat sent');
    } catch (error) {
      console.error('❌ Heartbeat failed:', error.message);
      throw error;
    }
  }

  // HTTP GET request
  httpGet(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
      client.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  // HTTP POST request
  httpPost(url, data) {
    return new Promise((resolve, reject) => {
      const urlParts = new URL(url);
      const client = url.startsWith('https') ? https : http;
      
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: urlParts.hostname,
        port: urlParts.port || (url.startsWith('https') ? 443 : 80),
        path: urlParts.pathname + urlParts.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = client.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(responseData);
            resolve(jsonData);
          } catch (error) {
            resolve({ success: true }); // Some endpoints might not return JSON
          }
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  // Sleep helper
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
if (require.main === module) {
  const service = new VisiGatePrintService();
  
  service.start().catch(error => {
    console.error('❌ Service failed to start:', error);
    process.exit(1);
  });
  
  // Keep process running
  process.stdin.resume();
}

module.exports = VisiGatePrintService;