// Global test setup
// This file runs before all tests

// Increase timeout for integration/E2E tests
jest.setTimeout(30000);

// Suppress console logs in tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
