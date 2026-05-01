export const mockCustomerId = 'test-customer-001';

export function createTestUser(overrides: Record<string, any> = {}) {
  return {
    id: 'test-user-001',
    customerId: mockCustomerId,
    role: 'staff',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'testuser@example.com',
    ...overrides,
  };
}

export function createAdminUser() {
  return createTestUser({ role: 'admin' });
}
