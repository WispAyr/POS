/**
 * Reprocess all movements to rebuild sessions
 * Run with: npx ts-node scripts/reprocess-movements.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { SessionService } from '../src/engine/services/session.service';
import { Movement } from '../src/domain/entities';

async function main() {
  console.log('Starting movement reprocessing...');
  
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const dataSource = app.get(DataSource);
  const sessionService = app.get(SessionService);
  const movementRepo = dataSource.getRepository(Movement);

  // Get all processable movements ordered by timestamp
  const movements = await movementRepo.find({
    where: {
      requiresReview: false,
      discarded: false,
    },
    order: { timestamp: 'ASC' },
  });

  console.log(`Found ${movements.length} movements to process`);

  let processed = 0;
  let errors = 0;
  const startTime = Date.now();

  for (const movement of movements) {
    try {
      await sessionService.processMovement(movement);
      processed++;
      
      if (processed % 1000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processed / parseFloat(elapsed)).toFixed(0);
        console.log(`Processed ${processed}/${movements.length} (${rate}/sec)`);
      }
    } catch (err: any) {
      errors++;
      if (errors <= 10) {
        console.error(`Error processing movement ${movement.id}: ${err.message}`);
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nComplete! Processed ${processed} movements in ${totalTime}s (${errors} errors)`);

  // Quick stats
  const sessionCount = await dataSource.query('SELECT COUNT(*) as count FROM sessions');
  const decisionCount = await dataSource.query('SELECT COUNT(*) as count FROM decisions');
  console.log(`Created ${sessionCount[0].count} sessions, ${decisionCount[0].count} decisions`);

  // Check for duplicates
  const duplicates = await dataSource.query(`
    SELECT COUNT(*) as count FROM (
      SELECT vrm, "siteId"
      FROM sessions 
      WHERE "endTime" IS NULL 
      GROUP BY vrm, "siteId" 
      HAVING COUNT(*) > 1
    ) d
  `);
  console.log(`Duplicate open sessions: ${duplicates[0].count}`);

  await app.close();
}

main().catch(console.error);
