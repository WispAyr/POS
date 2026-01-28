import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { Movement } from '../src/domain/entities';
import { getRepositoryToken } from '@nestjs/typeorm';

async function flipDirections() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const movementRepo = app.get<Repository<Movement>>(getRepositoryToken(Movement));

  console.log('Finding Greenford_Cam2 movements...');

  // Find all movements with Greenford_Cam2
  const movements = await movementRepo
    .createQueryBuilder('movement')
    .where("movement.cameraIds LIKE :cameraId", { cameraId: '%Greenford_Cam2%' })
    .getMany();

  console.log(`Found ${movements.length} movements to update`);

  let updated = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < movements.length; i += BATCH_SIZE) {
    const batch = movements.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (movement) => {
        // Flip the direction
        if (movement.direction === 'ENTRY') {
          movement.direction = 'EXIT';
          updated++;
        } else if (movement.direction === 'EXIT') {
          movement.direction = 'ENTRY';
          updated++;
        }
        await movementRepo.save(movement);
      })
    );

    if ((i + BATCH_SIZE) % 1000 === 0) {
      console.log(`Progress: ${i + BATCH_SIZE}/${movements.length}`);
    }
  }

  console.log(`\n✅ Updated ${updated} movements`);

  await app.close();
}

flipDirections().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
