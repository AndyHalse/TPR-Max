#!/usr/bin/env node

/**
 * VisiGate Pro - Deployment Environment Checker
 * 
 * This script checks for all critical environment variables required
 * for successful deployment and identifies missing configurations.
 */

console.log('🔍 VisiGate Pro - Deployment Environment Checker');
console.log('================================================\n');

const criticalVars = [
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL database connection URL',
    crashLevel: 'FATAL',
    defaultValue: null
  },
  {
    name: 'SESSION_SECRET',
    required: true,
    description: 'Session encryption secret (min 32 chars)',
    crashLevel: 'FATAL',
    defaultValue: null
  },
  {
    name: 'NODE_ENV',
    required: true,
    description: 'Application environment (development/production)',
    crashLevel: 'HIGH',
    defaultValue: 'development'
  }
];

const serviceVars = [
  {
    name: 'NEON_API_KEY',
    required: false,
    description: 'Neon API key for database provisioning',
    crashLevel: 'MEDIUM',
    service: 'Database Provisioning'
  },
  {
    name: 'NEON_PROJECT_ID',
    required: false,
    description: 'Neon project ID for database provisioning',
    crashLevel: 'MEDIUM',
    service: 'Database Provisioning'
  },
  {
    name: 'OPENAI_API_KEY',
    required: false,
    description: 'OpenAI API key for AI features',
    crashLevel: 'HIGH',
    service: 'AI Services'
  },
  {
    name: 'GOOGLE_API_KEY',
    required: false,
    description: 'Google Gemini API key for AI features',
    crashLevel: 'MEDIUM',
    service: 'AI Services'
  },
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,
    description: 'Stripe secret key for payments',
    crashLevel: 'MEDIUM',
    service: 'Payment Processing'
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    description: 'Stripe webhook secret for payment events',
    crashLevel: 'MEDIUM',
    service: 'Payment Processing'
  },
  {
    name: 'STRIPE_PROFESSIONAL_PRICE_ID',
    required: false,
    description: 'Stripe price ID for professional plan',
    crashLevel: 'LOW',
    service: 'Payment Processing'
  },
  {
    name: 'SENDGRID_API_KEY',
    required: false,
    description: 'SendGrid API key for email sending',
    crashLevel: 'MEDIUM',
    service: 'Email Services'
  },
  {
    name: 'SENDGRID_FROM_EMAIL',
    required: false,
    description: 'SendGrid from email address',
    crashLevel: 'LOW',
    service: 'Email Services'
  },
  {
    name: 'SMTP_HOST',
    required: false,
    description: 'SMTP server host for email',
    crashLevel: 'MEDIUM',
    service: 'Email Services'
  },
  {
    name: 'SMTP_PORT',
    required: false,
    description: 'SMTP server port',
    crashLevel: 'LOW',
    service: 'Email Services'
  },
  {
    name: 'SMTP_USER',
    required: false,
    description: 'SMTP username',
    crashLevel: 'MEDIUM',
    service: 'Email Services'
  },
  {
    name: 'SMTP_PASS',
    required: false,
    description: 'SMTP password',
    crashLevel: 'MEDIUM',
    service: 'Email Services'
  }
];

const optionalVars = [
  {
    name: 'SALES_EMAIL',
    description: 'Sales contact email',
    defaultValue: 'sales@visigatepro.com'
  },
  {
    name: 'DEV_AUTH_BYPASS',
    description: 'Development authentication bypass',
    defaultValue: 'false'
  },
  {
    name: 'DEV_DATA_BYPASS',
    description: 'Development data bypass',
    defaultValue: 'false'
  }
];

let hasCriticalIssues = false;
let hasServiceIssues = false;
const missingCritical = [];
const missingServices = [];

function checkVariable(varConfig) {
  const value = process.env[varConfig.name];
  const hasValue = value && value.trim() !== '';
  
  return {
    name: varConfig.name,
    hasValue,
    value: hasValue ? (varConfig.name.includes('SECRET') || varConfig.name.includes('KEY') || varConfig.name.includes('PASS') ? '[REDACTED]' : value) : undefined,
    ...varConfig
  };
}

function printResults(title, variables, isCritical = false) {
  console.log(`\n📋 ${title}`);
  console.log('=' .repeat(title.length + 4));
  
  variables.forEach(varInfo => {
    const status = varInfo.hasValue ? '✅' : '❌';
    const value = varInfo.hasValue ? ` (${varInfo.value || varInfo.defaultValue || 'Set'})` : '';
    const level = varInfo.crashLevel ? ` [${varInfo.crashLevel}]` : '';
    const service = varInfo.service ? ` (${varInfo.service})` : '';
    
    console.log(`${status} ${varInfo.name}${level}${service}${value}`);
    console.log(`   ${varInfo.description}`);
    
    if (!varInfo.hasValue && varInfo.required) {
      if (isCritical) {
        missingCritical.push(varInfo);
        hasCriticalIssues = true;
      } else {
        missingServices.push(varInfo);
        hasServiceIssues = true;
      }
    }
  });
}

// Check critical variables
const criticalResults = criticalVars.map(checkVariable);
printResults('Critical Environment Variables', criticalResults, true);

// Check service variables
const serviceResults = serviceVars.map(checkVariable);
printResults('Service Configuration Variables', serviceResults);

// Check optional variables
const optionalResults = optionalVars.map(checkVariable);
printResults('Optional Variables', optionalResults);

// Summary
console.log('\n📊 DEPLOYMENT READINESS SUMMARY');
console.log('===============================');

if (hasCriticalIssues) {
  console.log('🔥 CRITICAL: Application will crash on startup!');
  console.log('Missing critical variables:');
  missingCritical.forEach(v => console.log(`   - ${v.name}: ${v.description}`));
  console.log('\n🚨 IMMEDIATE ACTION REQUIRED: Configure missing critical variables before deployment.');
} else {
  console.log('✅ CRITICAL: All critical variables are configured');
}

if (hasServiceIssues) {
  console.log('\n⚠️  SERVICES: Some services will be disabled');
  const serviceGroups = {};
  missingServices.forEach(v => {
    if (!serviceGroups[v.service]) serviceGroups[v.service] = [];
    serviceGroups[v.service].push(v.name);
  });
  
  Object.keys(serviceGroups).forEach(service => {
    console.log(`   ${service}: ${serviceGroups[service].join(', ')}`);
  });
} else {
  console.log('✅ SERVICES: All service variables are configured');
}

// Environment-specific checks
const nodeEnv = process.env.NODE_ENV || 'development';
console.log(`\n🏗️  ENVIRONMENT: ${nodeEnv.toUpperCase()}`);

if (nodeEnv === 'production') {
  const prodSpecific = [
    'SESSION_SECRET',
    'DATABASE_URL',
    'NEON_API_KEY'
  ];
  
  const missingProd = prodSpecific.filter(varName => !process.env[varName]);
  if (missingProd.length > 0) {
    console.log('🔥 PRODUCTION DEPLOYMENT WILL FAIL!');
    console.log('Missing production-required variables:', missingProd.join(', '));
  } else {
    console.log('✅ Production requirements met');
  }
}

// Specific known issues
console.log('\n🔍 KNOWN DEPLOYMENT ISSUES');
console.log('==========================');

// Check for authentication issue (based on logs)
if (!process.env.SESSION_SECRET) {
  console.log('🔥 AUTH CRASH: SESSION_SECRET missing - will cause process.exit(1) in production');
}

if (!process.env.DATABASE_URL) {
  console.log('🔥 DB CRASH: DATABASE_URL missing - will throw "DATABASE_URL must be set" error');
}

if (!process.env.OPENAI_API_KEY) {
  console.log('🔥 AI CRASH: OPENAI_API_KEY missing - will throw "OPENAI_API_KEY environment variable is required"');
}

// Exit code
const exitCode = hasCriticalIssues ? 1 : 0;
console.log(`\n🎯 DEPLOYMENT READINESS: ${hasCriticalIssues ? 'NOT READY' : 'READY'}`);
console.log(`Exit code: ${exitCode}`);

process.exit(exitCode);