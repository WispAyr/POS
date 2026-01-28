import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '../src/domain/entities';
import { getRepositoryToken } from '@nestjs/typeorm';

async function fixGreenfordCam2() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const siteRepo = app.get<Repository<Site>>(getRepositoryToken(Site));

  const site = await siteRepo.findOne({ where: { id: 'GRN01' } });

  if (!site) {
    console.error('Site GRN01 not found');
    process.exit(1);
  }

  console.log('Current config:', JSON.stringify(site.config, null, 2));

  // Find Greenford_Cam2 and swap the directions
  if (site.config?.cameras) {
    const cam2 = site.config.cameras.find((c: any) => c.id === 'Greenford_Cam2');
    if (cam2) {
      console.log('\nBefore:', cam2);

      // Swap the directions
      const temp = cam2.towardsDirection;
      cam2.towardsDirection = cam2.awayDirection;
      cam2.awayDirection = temp;

      console.log('After:', cam2);

      await siteRepo.save(site);
      console.log('\n✅ Camera configuration updated successfully!');
    } else {
      console.error('Greenford_Cam2 not found in config');
    }
  }

  await app.close();
}

fixGreenfordCam2().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
