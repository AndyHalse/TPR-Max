/**
 * Comprehensive Validation Tests for VisiGate Pro
 * This test suite validates backend logic, UX functionality, and UI components
 * to ensure the system works correctly for potential customers.
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:5000',
  timeout: 10000,
  retryAttempts: 3,
};

// Mock data for testing
const mockData = {
  staff: {
    name: 'Test User',
    department: 'Engineering',
    employeeId: 'TEST001'
  },
  visitor: {
    name: 'John Visitor',
    company: 'Test Corp',
    purpose: 'Business Meeting',
    carRegistration: 'ABC123'
  },
  preBooking: {
    visitorName: 'Pre Booked Visitor',
    company: 'Future Corp',
    purpose: 'Scheduled Meeting',
    visitDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    hostStaffId: null
  }
};

describe('VisiGate Pro - Comprehensive Validation Tests', () => {
  
  describe('Backend API Validation', () => {
    
    describe('Staff Management API', () => {
      
      it('should validate staff creation with required fields', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockData.staff)
        });
        
        expect(response.status).toBe(200);
        const staff = await response.json();
        expect(staff).toHaveProperty('id');
        expect(staff.name).toBe(mockData.staff.name);
        expect(staff.department).toBe(mockData.staff.department);
        expect(staff.employeeId).toBe(mockData.staff.employeeId);
      });
      
      it('should reject staff creation with missing required fields', async () => {
        const invalidData = { name: 'Incomplete User' }; // Missing department and employeeId
        
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidData)
        });
        
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error).toHaveProperty('error');
      });
      
      it('should retrieve all staff members', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`);
        
        expect(response.status).toBe(200);
        const staff = await response.json();
        expect(Array.isArray(staff)).toBe(true);
        expect(staff.length).toBeGreaterThan(0);
      });
      
    });
    
    describe('Visitor Management API', () => {
      
      it('should validate visitor check-in with all required fields', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockData.visitor)
        });
        
        expect(response.status).toBe(200);
        const visitor = await response.json();
        expect(visitor).toHaveProperty('id');
        expect(visitor).toHaveProperty('qrCode');
        expect(visitor.name).toBe(mockData.visitor.name);
        expect(visitor.company).toBe(mockData.visitor.company);
        expect(visitor.isCheckedIn).toBe(true);
        expect(visitor.checkedOutAt).toBeNull();
      });
      
      it('should retrieve current visitors only', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/current`);
        
        expect(response.status).toBe(200);
        const visitors = await response.json();
        expect(Array.isArray(visitors)).toBe(true);
        
        // All returned visitors should be checked in
        visitors.forEach(visitor => {
          expect(visitor.isCheckedIn).toBe(true);
          expect(visitor.checkedOutAt).toBeNull();
        });
      });
      
      it('should validate visitor checkout functionality', async () => {
        // First create a visitor
        const createResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockData.visitor)
        });
        
        const visitor = await createResponse.json();
        
        // Then check them out
        const checkoutResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/${visitor.id}/checkout`, {
          method: 'POST'
        });
        
        expect(checkoutResponse.status).toBe(200);
        const checkedOutVisitor = await checkoutResponse.json();
        expect(checkedOutVisitor.isCheckedIn).toBe(false);
        expect(checkedOutVisitor.checkedOutAt).not.toBeNull();
      });
      
    });
    
    describe('Emergency Muster API', () => {
      
      it('should provide muster list with all personnel', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/muster`);
        
        expect(response.status).toBe(200);
        const musterList = await response.json();
        expect(Array.isArray(musterList)).toBe(true);
        
        // Validate muster list structure
        musterList.forEach(person => {
          expect(person).toHaveProperty('id');
          expect(person).toHaveProperty('name');
          expect(person).toHaveProperty('type');
          expect(person).toHaveProperty('checkedInAt');
          expect(person).toHaveProperty('location');
          expect(person).toHaveProperty('accounted');
          expect(['staff', 'visitor']).toContain(person.type);
        });
      });
      
    });
    
    describe('Statistics and Analytics API', () => {
      
      it('should provide accurate visitor statistics', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/stats`);
        
        expect(response.status).toBe(200);
        const stats = await response.json();
        expect(stats).toHaveProperty('currentVisitors');
        expect(stats).toHaveProperty('todayCheckins');
        expect(stats).toHaveProperty('staffOnSite');
        expect(stats).toHaveProperty('avgVisitDuration');
        
        // Validate data types
        expect(typeof stats.currentVisitors).toBe('number');
        expect(typeof stats.todayCheckins).toBe('number');
        expect(typeof stats.staffOnSite).toBe('number');
        expect(typeof stats.avgVisitDuration).toBe('string');
      });
      
      it('should provide recent activity with proper structure', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/activity/recent`);
        
        expect(response.status).toBe(200);
        const activities = await response.json();
        expect(Array.isArray(activities)).toBe(true);
        
        // Validate activity structure
        activities.forEach(activity => {
          expect(activity).toHaveProperty('id');
          expect(activity).toHaveProperty('type');
          expect(activity).toHaveProperty('name');
          expect(activity).toHaveProperty('timestamp');
          expect(['checkin', 'checkout', 'staff_added', 'prebooking']).toContain(activity.type);
        });
      });
      
    });
    
    describe('Pre-booking System API', () => {
      
      it('should create pre-booking with valid data', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/prebookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockData.preBooking)
        });
        
        expect(response.status).toBe(200);
        const booking = await response.json();
        expect(booking).toHaveProperty('id');
        expect(booking).toHaveProperty('qrCode');
        expect(booking.visitorName).toBe(mockData.preBooking.visitorName);
        expect(booking.company).toBe(mockData.preBooking.company);
      });
      
      it('should retrieve upcoming bookings', async () => {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/prebookings/upcoming`);
        
        expect(response.status).toBe(200);
        const bookings = await response.json();
        expect(Array.isArray(bookings)).toBe(true);
        
        // All bookings should be in the future
        bookings.forEach(booking => {
          const visitDate = new Date(booking.visitDate);
          const now = new Date();
          expect(visitDate >= now).toBe(true);
        });
      });
      
    });
    
  });
  
  describe('Data Validation and Business Logic', () => {
    
    it('should enforce unique employee IDs', async () => {
      // Create first staff member
      await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'First User',
          department: 'IT',
          employeeId: 'UNIQUE001'
        })
      });
      
      // Try to create second staff member with same employee ID
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Second User',
          department: 'HR',
          employeeId: 'UNIQUE001'
        })
      });
      
      // Should fail due to duplicate employee ID
      expect(response.status).toBe(400);
    });
    
    it('should generate unique QR codes for visitors', async () => {
      const qrCodes = new Set();
      
      // Create multiple visitors
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...mockData.visitor,
            name: `Visitor ${i}`
          })
        });
        
        const visitor = await response.json();
        expect(qrCodes.has(visitor.qrCode)).toBe(false);
        qrCodes.add(visitor.qrCode);
      }
      
      expect(qrCodes.size).toBe(5);
    });
    
    it('should calculate visit duration correctly', async () => {
      // Create a visitor
      const createResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockData.visitor)
      });
      
      const visitor = await createResponse.json();
      const checkinTime = new Date(visitor.checkedInAt);
      
      // Wait a moment, then check out
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkoutResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/${visitor.id}/checkout`, {
        method: 'POST'
      });
      
      const checkedOutVisitor = await checkoutResponse.json();
      const checkoutTime = new Date(checkedOutVisitor.checkedOutAt);
      
      // Verify checkout time is after checkin time
      expect(checkoutTime > checkinTime).toBe(true);
    });
    
  });
  
  describe('Security and Access Control', () => {
    
    it('should reject malformed JSON requests', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      expect(response.status).toBe(400);
    });
    
    it('should validate QR code lookup security', async () => {
      // Try to access visitor by invalid QR code
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/qr/invalid-qr-code`);
      
      expect(response.status).toBe(404);
    });
    
    it('should protect against SQL injection attempts', async () => {
      const maliciousData = {
        name: "'; DROP TABLE visitors; --",
        department: 'Engineering',
        employeeId: 'HACK001'
      };
      
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maliciousData)
      });
      
      // Should either succeed normally or fail validation, but not crash
      expect([200, 400].includes(response.status)).toBe(true);
    });
    
  });
  
  describe('Performance and Scalability', () => {
    
    it('should handle multiple concurrent requests', async () => {
      const promises = [];
      
      // Create 10 concurrent requests
      for (let i = 0; i < 10; i++) {
        promises.push(
          fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...mockData.visitor,
              name: `Concurrent Visitor ${i}`
            })
          })
        );
      }
      
      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
    
    it('should respond to API calls within acceptable time limits', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/stats`);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // 2 seconds max
    });
    
  });
  
  describe('Error Handling and Resilience', () => {
    
    it('should handle non-existent resource requests gracefully', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff/non-existent-id`);
      
      expect(response.status).toBe(404);
    });
    
    it('should provide meaningful error messages', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' })
      });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error).toHaveProperty('error');
      expect(typeof error.error).toBe('string');
    });
    
    it('should maintain data consistency during errors', async () => {
      // Get initial staff count
      const initialResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`);
      const initialStaff = await initialResponse.json();
      const initialCount = initialStaff.length;
      
      // Attempt invalid operation
      await fetch(`${TEST_CONFIG.baseUrl}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' })
      });
      
      // Verify data consistency
      const finalResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/staff`);
      const finalStaff = await finalResponse.json();
      
      expect(finalStaff.length).toBe(initialCount);
    });
    
  });
  
  describe('Integration Testing', () => {
    
    it('should complete full visitor workflow (checkin -> checkout)', async () => {
      // 1. Create visitor
      const createResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockData.visitor)
      });
      
      expect(createResponse.status).toBe(200);
      const visitor = await createResponse.json();
      
      // 2. Verify visitor appears in current visitors
      const currentResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/current`);
      const currentVisitors = await currentResponse.json();
      
      const foundVisitor = currentVisitors.find(v => v.id === visitor.id);
      expect(foundVisitor).toBeDefined();
      expect(foundVisitor.isCheckedIn).toBe(true);
      
      // 3. Check out visitor
      const checkoutResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/${visitor.id}/checkout`, {
        method: 'POST'
      });
      
      expect(checkoutResponse.status).toBe(200);
      
      // 4. Verify visitor no longer in current visitors
      const finalCurrentResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors/current`);
      const finalCurrentVisitors = await finalCurrentResponse.json();
      
      const notFoundVisitor = finalCurrentVisitors.find(v => v.id === visitor.id);
      expect(notFoundVisitor).toBeUndefined();
    });
    
    it('should update statistics after visitor operations', async () => {
      // Get initial stats
      const initialStatsResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/stats`);
      const initialStats = await initialStatsResponse.json();
      
      // Create visitor
      const createResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/visitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockData.visitor)
      });
      
      const visitor = await createResponse.json();
      
      // Get updated stats
      const updatedStatsResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/stats`);
      const updatedStats = await updatedStatsResponse.json();
      
      // Stats should reflect the new visitor
      expect(updatedStats.currentVisitors).toBe(initialStats.currentVisitors + 1);
      expect(updatedStats.todayCheckins).toBe(initialStats.todayCheckins + 1);
    });
    
  });
  
});

// Test runner configuration
module.exports = {
  testEnvironment: 'node',
  testTimeout: TEST_CONFIG.timeout,
  setupFilesAfterEnv: [],
  globalSetup: undefined,
  globalTeardown: undefined,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
};