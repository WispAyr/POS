import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PlateValidationService } from '../src/plate-review/services/plate-validation.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const plateValidationService = app.get(PlateValidationService);

  console.log('Seeding validation rules...');
  await plateValidationService.seedDefaultRules();
  console.log('Validation rules seeded successfully!');

  await app.close();
}

bootstrap().catch(error => {
  console.error('Error seeding validation rules:', error);
  process.exit(1);
});
