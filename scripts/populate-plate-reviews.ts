import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '.env') });

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'noc',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'pos_db',
});

async function main() {
  await dataSource.initialize();
  console.log('Database connected');

  // Get all UNKNOWN movements
  const movements = await dataSource.query(`
    SELECT id, vrm, "siteId", timestamp, images, "cameraIds", direction, "rawData"
    FROM movements
    WHERE vrm = 'UNKNOWN' OR vrm IS NULL OR vrm = ''
  `);

  console.log(`Found ${movements.length} UNKNOWN movements`);

  let created = 0;
  let skipped = 0;

  for (const movement of movements) {
    // Check if review already exists
    const existing = await dataSource.query(
      `SELECT id FROM plate_reviews WHERE "movementId" = $1`,
      [movement.id]
    );

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Create plate review
    const images = movement.images ? JSON.stringify(movement.images) : null;
    const metadata = JSON.stringify({
      cameraIds: movement.cameraIds,
      direction: movement.direction,
      rawData: movement.rawData,
    });
    const suspicionReasons = JSON.stringify(['UNKNOWN_PLATE', 'Unable to read plate']);

    await dataSource.query(
      `INSERT INTO plate_reviews
       ("movementId", "originalVrm", "normalizedVrm", "siteId", timestamp, "suspicionReasons", "validationStatus", "reviewStatus", images, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'INVALID', 'PENDING', $7, $8)`,
      [
        movement.id,
        movement.vrm || 'UNKNOWN',
        movement.vrm || 'UNKNOWN',
        movement.siteId,
        movement.timestamp,
        suspicionReasons,
        images,
        metadata,
      ]
    );
    created++;
  }

  console.log(`Created ${created} plate reviews, skipped ${skipped} existing`);

  // Also mark these movements as requiring review
  const result = await dataSource.query(`
    UPDATE movements
    SET "requiresReview" = true
    WHERE vrm = 'UNKNOWN' OR vrm IS NULL OR vrm = ''
  `);
  console.log(`Marked movements as requiring review`);

  await dataSource.destroy();
  console.log('Done');
}

main().catch(console.error);
