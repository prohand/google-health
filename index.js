// -----------------------------------------------------------------------------
// Entry point of the Google Health integration for Gladys Assistant.
//
// This file only starts things: the SDK client, the application
// (src/app.js, which registers every handler) and the connection.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them itself: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const app = createApp(gladys);

// Handlers are registered before connect(): the first messages of Gladys
// arrive as soon as the socket opens.
app.register();

// SIGTERM/SIGINT: stop reading, disconnect cleanly, exit with code 0.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the Google Health integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
