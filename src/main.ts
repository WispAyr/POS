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

  const port = process.env.PORT ?? 3000;

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
