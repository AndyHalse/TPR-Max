import pkg from './db.js';
const { db } = pkg;
import { customers } from '../shared/schema.js';
import { staff } from './isolatedSchema.js';
import { CustomerDatabaseService } from './customerDatabase.js';
import { eq } from 'drizzle-orm';

const customerDbService = new CustomerDatabaseService();

async function backfillFireMarshalUrls() {
  console.log('🔥 BACKFILLING FIRE MARSHAL URLS FOR ALL CUSTOMERS');
  console.log('=================================================\n');

  try {
    const allCustomers = await db.select().from(customers);
    console.log(`Found ${allCustomers.length} customers\n`);

    let totalBackfilled = 0;

    for (const customer of allCustomers) {
      console.log(`\n📋 Processing: ${customer.companyName} (${customer.id})`);
      
      try {
        const customerDb = await customerDbService.getCustomerDatabase(customer.id);
        
        const allStaff = await customerDb.select().from(staff);
        
        const fireMarshals = allStaff.filter((s: any) => 
          s.isFireMarshal === true ||
          s.department?.toLowerCase().includes('safety') ||
          s.department?.toLowerCase().includes('security')
        );
        
        console.log(`   Found ${fireMarshals.length} Fire Marshals`);
        
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
            
            console.log(`   ✅ Generated URL for ${fm.firstName} ${fm.lastName}: ${urlId}`);
            backfilledCount++;
            totalBackfilled++;
          } else {
            console.log(`   ⏭️  ${fm.firstName} ${fm.lastName} already has URL`);
          }
        }
        
        if (backfilledCount === 0 && fireMarshals.length > 0) {
          console.log(`   ✅ All Fire Marshals already have URLs`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error for ${customer.id}:`, error);
      }
    }
    
    console.log('\n\n✅ BACKFILL COMPLETE');
    console.log(`   Total Fire Marshal URLs generated: ${totalBackfilled}`);
    console.log('=================================================');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

backfillFireMarshalUrls()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
