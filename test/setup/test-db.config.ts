import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getTestDbConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  username: process.env.TEST_DB_USERNAME || 'pos_test_user',
  password: process.env.TEST_DB_PASSWORD || 'pos_test_pass',
  database: process.env.TEST_DB_DATABASE || 'pos_test_db',
  autoLoadEntities: true,
  synchronize: true, // Only for tests - recreates schema
  dropSchema: true,  // Clean between test runs
  logging: false,    // Set to true for debugging
});
