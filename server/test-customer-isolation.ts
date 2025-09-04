import { databaseService } from './databaseService';
import { simpleDatabaseService } from './simpleDatabaseService';
import { storage } from './storage';

// Test Customer Isolation for Multi-Tenant Architecture
async function testCustomerIsolation() {
  console.log('\n🧪 STARTING COMPREHENSIVE CUSTOMER ISOLATION TEST\n');
  console.log('=' . repeat(60));
  
  const testResults: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];
  
  // Test 1: Check if customer contexts are properly isolated
  try {
    console.log('\n📋 Test 1: Customer Context Isolation');
    const context1 = simpleDatabaseService.createCustomerContext('Andy');
    const context2 = simpleDatabaseService.createCustomerContext('Emma');
    
    if (context1.customerId !== context2.customerId) {
      testResults.push({
        test: 'Customer Context Creation',
        status: 'PASS',
        details: `Andy: ${context1.customerId}, Emma: ${context2.customerId}`
      });
    } else {
      testResults.push({
        test: 'Customer Context Creation',
        status: 'FAIL',
        details: 'Same customerId for different users!'
      });
    }
  } catch (error) {
    testResults.push({
      test: 'Customer Context Creation',
      status: 'FAIL',
      details: String(error)
    });
  }
  
  // Test 2: Verify visitor isolation between customers
  try {
    console.log('\n📋 Test 2: Visitor Data Isolation');
    const andyContext = simpleDatabaseService.createCustomerContext('Andy');
    const emmaContext = simpleDatabaseService.createCustomerContext('Emma');
    
    // Create test visitor for Andy
    const andyVisitor = await databaseService.createVisitor(andyContext, {
      firstName: 'Test',
      lastName: 'Visitor Andy',
      company: 'Andy Company',
      email: 'test.andy@test.com',
      hostName: 'Andy Host',
      department: 'Test Dept',
      purpose: 'Testing',
      customerId: andyContext.customerId
    });
    
    // Create test visitor for Emma
    const emmaVisitor = await databaseService.createVisitor(emmaContext, {
      firstName: 'Test',
      lastName: 'Visitor Emma',
      company: 'Emma Company',
      email: 'test.emma@test.com',
      hostName: 'Emma Host',
      department: 'Test Dept',
      purpose: 'Testing',
      customerId: emmaContext.customerId
    });
    
    // Get visitors for each customer
    const andyVisitors = await databaseService.getAllVisitors(andyContext);
    const emmaVisitors = await databaseService.getAllVisitors(emmaContext);
    
    // Check isolation
    const andyHasEmmaVisitor = andyVisitors.some(v => v.email === 'test.emma@test.com');
    const emmaHasAndyVisitor = emmaVisitors.some(v => v.email === 'test.andy@test.com');
    
    if (!andyHasEmmaVisitor && !emmaHasAndyVisitor) {
      testResults.push({
        test: 'Visitor Data Isolation',
        status: 'PASS',
        details: `Andy sees ${andyVisitors.length} visitors, Emma sees ${emmaVisitors.length} visitors`
      });
    } else {
      testResults.push({
        test: 'Visitor Data Isolation',
        status: 'FAIL',
        details: 'Cross-customer data leak detected!'
      });
    }
    
    // Cleanup test visitors
    if (andyVisitor) await databaseService.deleteVisitor(andyContext, andyVisitor.id);
    if (emmaVisitor) await databaseService.deleteVisitor(emmaContext, emmaVisitor.id);
    
  } catch (error) {
    testResults.push({
      test: 'Visitor Data Isolation',
      status: 'FAIL',
      details: String(error)
    });
  }
  
  // Test 3: Check staff isolation
  try {
    console.log('\n📋 Test 3: Staff Data Isolation');
    const andyContext = simpleDatabaseService.createCustomerContext('Andy');
    const emmaContext = simpleDatabaseService.createCustomerContext('Emma');
    
    // Create test staff for each customer
    const andyStaff = await databaseService.createStaff(andyContext, {
      firstName: 'Andy',
      lastName: 'Staff Test',
      email: 'andy.staff@test.com',
      department: 'Andy Dept',
      phoneNumber: '111-111-1111',
      employeeId: 'ANDY001',
      customerId: andyContext.customerId
    });
    
    const emmaStaff = await databaseService.createStaff(emmaContext, {
      firstName: 'Emma',
      lastName: 'Staff Test',
      email: 'emma.staff@test.com',
      department: 'Emma Dept',
      phoneNumber: '222-222-2222',
      employeeId: 'EMMA001',
      customerId: emmaContext.customerId
    });
    
    // Get staff for each customer
    const andyStaffList = await databaseService.getAllStaff(andyContext);
    const emmaStaffList = await databaseService.getAllStaff(emmaContext);
    
    // Check isolation
    const andyHasEmmaStaff = andyStaffList.some(s => s.email === 'emma.staff@test.com');
    const emmaHasAndyStaff = emmaStaffList.some(s => s.email === 'andy.staff@test.com');
    
    if (!andyHasEmmaStaff && !emmaHasAndyStaff) {
      testResults.push({
        test: 'Staff Data Isolation',
        status: 'PASS',
        details: `Andy has ${andyStaffList.length} staff, Emma has ${emmaStaffList.length} staff`
      });
    } else {
      testResults.push({
        test: 'Staff Data Isolation',
        status: 'FAIL',
        details: 'Cross-customer staff data leak detected!'
      });
    }
    
    // Cleanup
    if (andyStaff) await databaseService.deleteStaff(andyContext, andyStaff.id);
    if (emmaStaff) await databaseService.deleteStaff(emmaContext, emmaStaff.id);
    
  } catch (error) {
    testResults.push({
      test: 'Staff Data Isolation',
      status: 'FAIL',
      details: String(error)
    });
  }
  
  // Test 4: Check company settings isolation
  try {
    console.log('\n📋 Test 4: Company Settings Isolation');
    const andyContext = simpleDatabaseService.createCustomerContext('Andy');
    const emmaContext = simpleDatabaseService.createCustomerContext('Emma');
    
    // Update settings for Andy
    await databaseService.updateCompanySettings(andyContext, {
      companyName: 'Andy Test Company',
      customerId: andyContext.customerId
    });
    
    // Update settings for Emma
    await databaseService.updateCompanySettings(emmaContext, {
      companyName: 'Emma Test Company',
      customerId: emmaContext.customerId
    });
    
    // Get settings for each
    const andySettings = await databaseService.getCompanySettings(andyContext);
    const emmaSettings = await databaseService.getCompanySettings(emmaContext);
    
    if (andySettings?.companyName === 'Andy Test Company' && 
        emmaSettings?.companyName === 'Emma Test Company') {
      testResults.push({
        test: 'Company Settings Isolation',
        status: 'PASS',
        details: 'Each customer has their own isolated settings'
      });
    } else {
      testResults.push({
        test: 'Company Settings Isolation',
        status: 'FAIL',
        details: 'Settings are not properly isolated!'
      });
    }
  } catch (error) {
    testResults.push({
      test: 'Company Settings Isolation',
      status: 'FAIL',
      details: String(error)
    });
  }
  
  // Test 5: Check for routes using legacy storage without context
  try {
    console.log('\n📋 Test 5: Legacy Storage Usage Check');
    const { readFile } = await import('fs/promises');
    const routesContent = await readFile('./server/routes.ts', 'utf-8');
    
    // Check for direct storage usage without customer context
    const legacyPatterns = [
      'storage.getAllVisitors()',
      'storage.getAllStaff()',
      'storage.getCompanySettings()',
      'storage.getAllDepartments()',
      'storage.createVisitor(',
      'storage.createStaff(',
      'storage.updateCompanySettings('
    ];
    
    const foundLegacyUsage: string[] = [];
    for (const pattern of legacyPatterns) {
      if (routesContent.includes(pattern)) {
        foundLegacyUsage.push(pattern);
      }
    }
    
    if (foundLegacyUsage.length > 0) {
      testResults.push({
        test: 'Legacy Storage Usage',
        status: 'FAIL',
        details: `Found ${foundLegacyUsage.length} legacy storage calls: ${foundLegacyUsage.join(', ')}`
      });
    } else {
      testResults.push({
        test: 'Legacy Storage Usage',
        status: 'PASS',
        details: 'No direct legacy storage usage found'
      });
    }
  } catch (error) {
    testResults.push({
      test: 'Legacy Storage Usage',
      status: 'FAIL',
      details: String(error)
    });
  }
  
  // Test 6: Database connection isolation
  try {
    console.log('\n📋 Test 6: Database Connection Isolation');
    const { customerDbService } = await import('./customerDbService');
    
    const andyDb = await customerDbService.getCustomerDatabase('dev-customer-001');
    const emmaDb = await customerDbService.getCustomerDatabase('dev-customer-002');
    
    // These should be different database connections
    if (andyDb !== emmaDb) {
      testResults.push({
        test: 'Database Connection Isolation',
        status: 'PASS',
        details: 'Each customer has separate database connection'
      });
    } else {
      testResults.push({
        test: 'Database Connection Isolation',
        status: 'FAIL',
        details: 'Customers sharing same database connection!'
      });
    }
  } catch (error) {
    testResults.push({
      test: 'Database Connection Isolation',
      status: 'FAIL',
      details: String(error)
    });
  }
  
  // Print results
  console.log('\n' + '=' . repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('=' . repeat(60) + '\n');
  
  let passCount = 0;
  let failCount = 0;
  
  for (const result of testResults) {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${result.test}: ${result.status}`);
    console.log(`   Details: ${result.details}\n`);
    
    if (result.status === 'PASS') passCount++;
    else failCount++;
  }
  
  console.log('=' . repeat(60));
  console.log(`TOTAL: ${passCount} PASSED, ${failCount} FAILED`);
  
  if (failCount > 0) {
    console.log('\n⚠️  WARNING: Customer isolation issues detected!');
    console.log('Each customer should have their own SQL database for complete isolation.');
  } else {
    console.log('\n✅ All customer isolation tests passed!');
  }
  
  return { passed: passCount, failed: failCount, results: testResults };
}

// Run the test if this file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  testCustomerIsolation()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testCustomerIsolation };