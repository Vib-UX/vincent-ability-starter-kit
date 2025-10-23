import { config } from '@dotenvx/dotenvx';
import path from 'path';

// Load test environment variables
if (!process.env['NX_LOAD_DOT_ENV_FILES']) {
  config({ path: path.join(__dirname, './.env.test') });
}

// Set up test environment
process.env.NODE_ENV = 'test';
