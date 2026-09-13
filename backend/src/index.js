import http from 'node:http';
import createApp from './app.js';
import serverConfig from './config/serverConfig.js';
import { assertSecretsPresent, assertProductionConfig } from './config/secretsConfig.js';
import { connectDB, disconnectDB } from './config/dbConfig.js';
import { closeRedis } from './config/redisConfig.js';
import { initializeSocket } from './sockets/socketServer.js';
import logger from './utils/logger.js';

async function startServer() {
  // Fail fast rather than starting on a guessable key (CONTEXT §11).
  assertSecretsPresent();
  assertProductionConfig();

  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO with Redis Adapter
  initializeSocket(server);

  // Connect Database (non-blocking for resilient local dev)
  try {
    await connectDB();
  } catch (err) {
    logger.warn('Initial DB connection failed — server continuing in degraded mode', {
      error: err.message,
    });
  }

  const { port } = serverConfig;

  server.listen(port, () => {
    logger.info(`PathCare API server running on port ${port}`, {
      env: serverConfig.nodeEnv,
      port,
      apiPrefix: serverConfig.apiPrefix,
    });
  });

  // Graceful Shutdown
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      await closeRedis();
      logger.info('HTTP server and connections closed. Exiting process.');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  logger.error('Failed to start API server', { error: error.message, stack: error.stack });
  process.exit(1);
});
