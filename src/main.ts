import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function freePort(port: number): Promise<void> {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    if (stdout.trim()) {
      const pids = stdout.trim().split('\n');
      console.log(`Found process(es) on port ${port}: ${pids.join(', ')}`);
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`Killed process ${pid}`);
        } catch (error) {
          console.warn(`Failed to kill process ${pid}: ${error}`);
        }
      }
    }
  } catch (error) {
    // Port is free, no process found
  }
}

async function bootstrap() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Free the port before starting
  await freePort(port);

  const app = await NestFactory.create(AppModule);

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor for request/response logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  // CORS configuration - use environment variable for production origins
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : null;

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production' ? allowedOrigins || false : true, // Allow all origins only in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  });

  try {
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    ) {
      console.error(
        `Port ${port} is already in use. Please stop the other process or use a different port.`,
      );
      console.error(`You can find the process using: lsof -i:${port}`);
      process.exit(1);
    }
    throw error;
  }
}
bootstrap();
