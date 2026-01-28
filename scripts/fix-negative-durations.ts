import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function fixNegativeDurations() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('Finding sessions with negative durations...');

  // Find all sessions with negative durations
  const badSessions = await dataSource.query(`
    SELECT id, vrm, "siteId", "startTime", "endTime", "durationMinutes"
    FROM sessions
    WHERE "durationMinutes" < 0
    ORDER BY "startTime" DESC
  `);

  console.log(`Found ${badSessions.length} sessions with negative durations`);

  if (badSessions.length === 0) {
    console.log('No sessions to fix!');
    await app.close();
    return;
  }

  console.log('\nFixing sessions by nullifying endTime (will be recalculated)...');

  // Option 1: Simply clear the bad exit data so sessions become open again
  const result = await dataSource.query(`
    UPDATE sessions
    SET
      "endTime" = NULL,
      "exitMovementId" = NULL,
      "durationMinutes" = NULL,
      status = 'PROVISIONAL'
    WHERE "durationMinutes" < 0
  `);

  console.log(`✓ Cleared exit data for ${result[1]} sessions`);
  console.log('\nNow re-matching sessions with exits in chronological order...');

  // Get all movements ordered by timestamp
  const movements = await dataSource.query(`
    SELECT id, vrm, "siteId", timestamp, direction
    FROM movements
    WHERE direction = 'EXIT'
    ORDER BY timestamp ASC
  `);

  console.log(`Processing ${movements.length} exit movements...`);

  let matched = 0;
  let orphaned = 0;

  for (const movement of movements) {
    // Find the most recent open session for this VRM/site that started BEFORE this exit
    const openSession = await dataSource.query(
      `
      SELECT id, "startTime"
      FROM sessions
      WHERE vrm = $1
        AND "siteId" = $2
        AND "endTime" IS NULL
        AND "startTime" < $3
      ORDER BY "startTime" DESC
      LIMIT 1
    `,
      [movement.vrm, movement.siteId, movement.timestamp],
    );

    if (openSession.length > 0) {
      const session = openSession[0];
      const durationMs =
        new Date(movement.timestamp).getTime() -
        new Date(session.startTime).getTime();
      const durationMinutes = Math.floor(durationMs / 60000);

      // Only match if duration is positive
      if (durationMinutes >= 0) {
        await dataSource.query(
          `
          UPDATE sessions
          SET
            "endTime" = $1,
            "exitMovementId" = $2,
            "durationMinutes" = $3,
            status = 'COMPLETED'
          WHERE id = $4
        `,
          [movement.timestamp, movement.id, durationMinutes, session.id],
        );
        matched++;
      } else {
        orphaned++;
      }
    } else {
      orphaned++;
    }

    if ((matched + orphaned) % 1000 === 0) {
      console.log(
        `Progress: ${matched + orphaned}/${movements.length} (${matched} matched, ${orphaned} orphaned)`,
      );
    }
  }

  console.log('\n=== Fix Complete ===');
  console.log(`Total exits processed: ${movements.length}`);
  console.log(`Sessions matched: ${matched}`);
  console.log(`Orphaned exits: ${orphaned}`);

  // Verify fix
  const stillBad = await dataSource.query(`
    SELECT COUNT(*) as count
    FROM sessions
    WHERE "durationMinutes" < 0
  `);

  console.log(`\nRemaining sessions with negative durations: ${stillBad[0].count}`);

  await app.close();
}

fixNegativeDurations()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
