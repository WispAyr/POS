// E2E test setup
// This file runs before E2E tests

// Ensure test database environment variables are set
if (!process.env.TEST_DB_HOST) {
  process.env.TEST_DB_HOST = 'localhost';
}
if (!process.env.TEST_DB_PORT) {
  process.env.TEST_DB_PORT = '5432';
}
if (!process.env.TEST_DB_USERNAME) {
  process.env.TEST_DB_USERNAME = 'pos_test_user';
}
if (!process.env.TEST_DB_PASSWORD) {
  process.env.TEST_DB_PASSWORD = 'pos_test_pass';
}
if (!process.env.TEST_DB_DATABASE) {
  process.env.TEST_DB_DATABASE = 'pos_test_db';
}

// Set longer timeout for E2E tests
jest.setTimeout(120000);
