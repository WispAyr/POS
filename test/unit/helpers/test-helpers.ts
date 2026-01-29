import { TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Creates a test NestJS application from a testing module
 */
export const createTestApp = async (
  module: TestingModule,
): Promise<INestApplication> => {
  const app = module.createNestApplication();
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.init();
  return app;
};

/**
 * Closes a test application
 */
export const closeTestApp = async (app: INestApplication): Promise<void> => {
  await app.close();
};

/**
 * Creates a supertest request instance for the app
 */
export const makeRequest = (app: INestApplication) =>
  request(app.getHttpServer());

/**
 * Waits for a specified number of milliseconds
 */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates a date that is N minutes in the past
 */
export const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60 * 1000);

/**
 * Creates a date that is N minutes in the future
 */
export const minutesFromNow = (minutes: number): Date =>
  new Date(Date.now() + minutes * 60 * 1000);

/**
 * Normalizes a VRM (Vehicle Registration Mark)
 */
export const normalizeVrm = (vrm: string): string =>
  vrm.toUpperCase().replace(/\s/g, '');
