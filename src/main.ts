import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor for request/response logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Enable CORS for frontend dev server
  app.enableCors({
    origin: true, // Allow all origins in development
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;

  // Cleanup port if in use (macOS/Linux)
  if (process.platform !== 'win32') {
    try {
      const { execSync } = require('child_process');
      const pid = execSync(`lsof -t -i:${port}`).toString().trim();
      if (pid) {
        console.log(`Port ${port} is in use by PID ${pid}. Killing...`);
        execSync(`kill -9 ${pid}`);
      }
    } catch (e) {
      // Ignore errors if no process found
    }
  }

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
