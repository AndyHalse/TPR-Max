#!/usr/bin/env tsx

/**
 * MIGRATION RUNNER SCRIPT
 * 
 * This script runs all registered migrations across all customer databases.
 * It should be run whenever new migrations are added to ensure all customer
 * databases are updated with the latest schema.
 */

import { CustomerDatabaseService } from './customerDatabase';
import { createMigrationRunner } from './migrationRunner';

async function runAllMigrations() {
  console.log('🚀 Starting migration process for all customer databases...');
  
  try {
    // Get customer database service instance
    const customerDbService = CustomerDatabaseService.getInstance();
    
    // Create migration runner with all registered migrations
    const migrationRunner = createMigrationRunner(customerDbService);
    
    // Display registered migrations
    const migrations = migrationRunner.getMigrations();
    console.log(`\n📋 Found ${migrations.length} registered migrations:`);
    migrations.forEach(migration => {
      console.log(`  - ${migration.version}: ${migration.description}`);
    });
    
    // Run migrations for all customers
    console.log('\n🔄 Running migrations across all customer databases...');
    await migrationRunner.runMigrationsForAllCustomers();
    
    console.log('\n🎉 Migration process completed successfully!');
    
    // Close all database connections
    await customerDbService.closeAllConnections();
    
  } catch (error) {
    console.error('\n❌ Migration process failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
// Note: In ES modules, we need to check import.meta.url instead of require.main
runAllMigrations()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });

export { runAllMigrations };