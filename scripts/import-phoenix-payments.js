const fs = require('fs');
const { Client } = require('pg');
const { randomUUID } = require('crypto');

const TWIN_PROVIDER_ID = 'b0f7f359-853c-4f9d-a011-54fc2cc8eadd';
const TAP2PARK_PROVIDER_ID = '6bdf01c3-3713-4912-bc90-4cfd47b1d8d3';

// Site code mapping
const SITE_MAPPING = {
  '102': 'KCS01',
  'KCS01': 'KCS01',
  '0': 'KCS01',  // Legacy unmapped
  '': 'KCS01'
};

async function importPayments() {
  const client = new Client({ database: 'pos_db' });
  await client.connect();

  // Read exported payments
  const rawData = fs.readFileSync('/tmp/phoenix_payments.json', 'utf-8');
  const payments = JSON.parse(rawData.trim());

  console.log(`Found ${payments.length} payments to import`);

  let imported = 0;
  let skipped = 0;

  for (const p of payments) {
    try {
      // Map site code
      let siteId = SITE_MAPPING[p.site_id_text] || SITE_MAPPING[p.location_code] || 'KCS01';
      
      // Determine provider
      const providerId = p.source === 'twin' ? TWIN_PROVIDER_ID : TAP2PARK_PROVIDER_ID;
      
      // Skip if already exists
      const existing = await client.query(
        `SELECT id FROM payments WHERE "externalReference" = $1 AND source = $2`,
        [p.payment_id, p.source.toUpperCase()]
      );
      
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      await client.query(`
        INSERT INTO payments (
          id, "siteId", vrm, amount, "startTime", "expiryTime", 
          source, "externalReference", "rawData", "providerId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        randomUUID(),
        siteId,
        p.plate_number || 'UNKNOWN',
        p.amount || 0,
        new Date(p.start_date),
        new Date(p.end_date),
        p.source.toUpperCase(),
        p.payment_id,
        JSON.stringify(p),
        providerId
      ]);
      
      imported++;
      
      if (imported % 100 === 0) {
        console.log(`Imported ${imported}...`);
      }
    } catch (err) {
      console.error(`Error importing ${p.payment_id}:`, err.message);
      skipped++;
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);
  
  // Show summary by source
  const summary = await client.query(`
    SELECT source, COUNT(*) as count, SUM(amount) as total 
    FROM payments 
    GROUP BY source
  `);
  console.log('\nPayment summary:');
  for (const row of summary.rows) {
    console.log(`  ${row.source}: ${row.count} payments, £${parseFloat(row.total).toFixed(2)}`);
  }

  await client.end();
}

importPayments().catch(console.error);
