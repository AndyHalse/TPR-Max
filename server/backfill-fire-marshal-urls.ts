import pkg from './db.js';
const { db } = pkg;
import { customers } from '../shared/schema.js';
import { staff } from './isolatedSchema.js';
import { CustomerDatabaseService } from './customerDatabase.js';
import { eq } from 'drizzle-orm';
import { logger } from './utils/logger';

const customerDbService = new CustomerDatabaseService();

async function backfillFireMarshalUrls() {
  logger.info('🔥 BACKFILLING FIRE MARSHAL URLS FOR ALL CUSTOMERS');
  logger.info('=================================================\n');

  try {
    const allCustomers = await db.select().from(customers);
    logger.info(`Found ${allCustomers.length} customers\n`);

    let totalBackfilled = 0;

    for (const customer of allCustomers) {
      logger.info(`\n📋 Processing: ${customer.companyName} (${customer.id})`);
      
      try {
        const customerDb = await customerDbService.getCustomerDatabase(customer.id);
        
        const allStaff = await customerDb.select().from(staff);
        
        const fireMarshals = allStaff.filter((s: any) => 
          s.isFireMarshal === true ||
          s.department?.toLowerCase().includes('safety') ||
          s.department?.toLowerCase().includes('security')
        );
        
        logger.info(`   Found ${fireMarshals.length} Fire Marshals`);
        
        let backfilledCount = 0;
        for (const fm of fireMarshals) {
          if (!fm.fireMarshalUrlId) {
            const urlId = Math.random().toString(36).substring(2, 14);
            
            await customerDb
              .update(staff)
              .set({ 
                fireMarshalUrlId: urlId,
                isFireMarshal: true 
              })
              .where(eq(staff.id, fm.id));
            
            logger.info(`   ✅ Generated URL for ${fm.firstName} ${fm.lastName}: ${urlId}`);
            backfilledCount++;
            totalBackfilled++;
          } else {
            logger.info(`   ⏭️  ${fm.firstName} ${fm.lastName} already has URL`);
          }
        }
        
        if (backfilledCount === 0 && fireMarshals.length > 0) {
          logger.info(`   ✅ All Fire Marshals already have URLs`);
        }
        
      } catch (error) {
        logger.error(`   ❌ Error for ${customer.id}:`, error);
      }
    }
    
    logger.info('\n\n✅ BACKFILL COMPLETE');
    logger.info(`   Total Fire Marshal URLs generated: ${totalBackfilled}`);
    logger.info('=================================================');
    
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    throw error;
  }
}

backfillFireMarshalUrls()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Failed:', err);
    process.exit(1);
  });
