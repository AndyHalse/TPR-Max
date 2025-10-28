# TPR Max - System Architecture

## Database Isolation Architecture

### Overview
TPR Max implements a **true multi-tenant SaaS architecture** with complete database isolation per customer. This ensures maximum data security, privacy, and regulatory compliance.

### Database-Per-Customer Model

#### Production Environment
- Each customer receives their own dedicated PostgreSQL database
- Provisioned automatically via Neon API during customer onboarding
- Database naming convention: `customer_{customerId}`
- Complete physical separation ensures no data leakage between customers
- Independent backup, restore, and scaling per customer

#### Development Environment
- Schema-based isolation within a single PostgreSQL database
- Each customer gets a dedicated schema: `customer_{customerId}`
- Search path configured per connection to enforce isolation
- Simulates production isolation for local development

### Key Benefits

1. **True Data Isolation**
   - No customerId filters needed in queries
   - Complete separation at infrastructure level
   - Impossible for one customer to access another's data
   - GDPR and data sovereignty compliance

2. **Security**
   - Each database has its own connection pool
   - Credentials never shared between customers
   - Independent security policies per customer
   - Automated cleanup of inactive connections

3. **Scalability**
   - Databases can be scaled independently
   - No single point of contention
   - Horizontal scaling by adding new databases
   - Performance isolation (one customer's load doesn't affect others)

4. **Compliance & Regulatory**
   - Data residency requirements easily met
   - Per-customer backup and retention policies
   - Audit trails isolated per customer
   - Easy customer data export for GDPR requests

### Implementation Details

#### Customer Database Service
Location: `server/customerDatabase.ts`

- Manages database connections per customer
- Automatic provisioning for new customers
- Connection pooling with lifecycle management
- Cleanup of unused connections after 10 minutes idle
- Migration runner for schema updates

#### Database Provisioning Service
Location: `server/databaseProvisioningService.ts`

**Production Flow:**
1. Neon API creates new PostgreSQL database
2. Connection string generated: `{baseUrl}/{databaseName}`
3. Complete schema created via SQL migrations
4. Default data seeded (ACS Safety & Security Ltd branding)

**Development Flow:**
1. Creates customer-specific schema in shared database
2. Sets search path for isolation
3. Creates tables within customer schema
4. Seeds default data

#### Schema Definition
Location: `server/isolatedSchema.ts`

- Complete table definitions for customer databases
- No customerId columns (entire DB belongs to one customer)
- Consistent schema across all customer databases
- Version-controlled migrations ensure consistency

### Multi-Tenant Feature (Within Customer Context)

**Important Distinction:**
- **Database isolation** = Separate databases per customer (SaaS architecture)
- **Multi-tenant feature** = Optional feature for customers with multiple companies in the same building

The multi-tenant feature allows a single customer to manage multiple companies within their own isolated database. This is useful for:
- Shared office buildings
- Co-working spaces
- Property management companies
- Organizations with multiple subsidiaries

Data is shared within the customer's database context but separated by company/tenant IDs within that database.

### Security Model

#### Session-Based Tenant Context
```typescript
req.session.userId      // Current user ID
req.session.customerId  // Customer database identifier
req.session.companyName // Customer company name
```

#### Request Flow
1. User authenticates with 3-field login (Company, Username, Password)
2. System looks up customer record in management database
3. Session established with `customerId` context
4. All subsequent requests use `customerId` to route to correct database
5. Middleware `requireAuth` enforces tenant context on every request

#### Database Connection Routing
```typescript
const customerDb = await customerDbService.getCustomerDatabase(req.session.customerId);
// All queries now execute against customer-specific database
const visitors = await customerDb.select().from(visitors);
// No need for .where(eq(customerId, req.session.customerId))
```

### Migration Strategy

#### Migration Runner
Location: `server/migrationRunner.ts`

- Applies schema migrations to all customer databases
- Tracks applied migrations in `schema_version` table per customer
- Idempotent migrations (can be re-run safely)
- Transactional execution with automatic rollback on failure

#### Adding New Migrations
1. Create migration file in `server/migrations/`
2. Register in `migrationRunner.ts`
3. Migrations auto-apply on next customer database access
4. Migrations run independently per customer database

### Default Branding

All new customers are initialized with **ACS Safety & Security Ltd** branding:
- Company Name: "ACS Safety & Security Ltd"
- Theme: Light
- Accent Color: #3b82f6 (blue)
- Background: #f8fafc (light gray)
- Foreground: #1e293b (dark slate)

Customers can fully rebrand through Settings > Company & Branding section.

### Production Readiness

#### Environment Requirements
- `DATABASE_URL` - Management database connection string
- `NEON_API_KEY` - Neon API key for database provisioning (production)
- `NEON_PROJECT_ID` - Neon project ID (production)
- `SESSION_SECRET` - Cryptographically secure session secret (required in production)

#### Production Deployment
- PostgreSQL session store (automatic failover)
- Secure cookies (httpOnly, secure, sameSite: strict)
- CSRF protection on all state-changing operations
- Connection pool management with automatic cleanup
- Graceful shutdown with connection draining

#### Monitoring & Maintenance
- Connection pool metrics per customer
- Migration status tracking
- Database health checks
- Automatic cleanup of inactive pools
- Audit logging per customer database

### File Structure
```
server/
├── customerDatabase.ts           # Customer database service
├── databaseProvisioningService.ts # Database provisioning
├── migrationRunner.ts            # Migration management
├── isolatedSchema.ts             # Customer database schema
├── customerOnboardingService.ts  # New customer setup
└── migrations/                   # Schema migrations
    ├── contractorMigrations.ts
    ├── settingsColumnMigration.ts
    └── ...

shared/
└── schema.ts                     # Management database schema
```

### Testing Database Isolation

```bash
# Create test customer
POST /api/super-admin/dev/create-customer
{
  "customerId": "test-001",
  "companyName": "Test Corp",
  "adminUsername": "admin"
}

# Verify isolation
# 1. Login as Test Corp admin
# 2. Create test data
# 3. Login as different customer
# 4. Verify test data is not visible
```

### Backup & Recovery

Each customer database can be backed up independently:
- Point-in-time recovery per customer
- Customer-specific retention policies
- Export customer data for migration
- Restore individual customer without affecting others

### Summary

TPR Max's database-per-customer architecture provides:
- ✅ Maximum security through physical isolation
- ✅ GDPR and regulatory compliance
- ✅ Independent scaling per customer
- ✅ Simple query logic (no customerId filters)
- ✅ Easy customer onboarding and offboarding
- ✅ Production-ready multi-tenancy

This architecture ensures that TPR Max can scale to thousands of enterprise customers while maintaining the highest standards of data security and privacy.
