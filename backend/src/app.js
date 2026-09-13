import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import serverConfig from './config/serverConfig.js';
import requestLogger from './middlewares/requestLogger.js';
import { globalRateLimiter } from './middlewares/rateLimiter.js';
import notFoundHandler from './middlewares/notFoundHandler.js';
import errorMiddleware from './middlewares/errorMiddleware.js';
import routes from './routes/index.js';
import { getHealth } from './controllers/healthController.js';

export function createApp() {
  const app = express();

  // Behind the ALB the peer address is the load balancer, so
  // req.ip would be identical for every caller and the per-IP limiter would
  // throttle all users as one bucket. Trusting the proxy makes req.ip the real
  // client address from X-Forwarded-For.
  app.set('trust proxy', serverConfig.trustProxy);

  // Security Headers
  app.use(helmet());

  // CORS Configuration
  app.use(
    cors({
      origin: serverConfig.corsOrigin,
      credentials: true,
    })
  );

  // Parse Cookie header
  app.use(cookieParser());

  // Parse JSON with rawBody preserved for Webhook signature verification (§6.2)
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // URL encoded parser
  app.use(express.urlencoded({ extended: true }));

  // Request logging with PII redaction
  app.use(requestLogger);

  // Global rate limiting, mounted BEFORE the routers so it
  // covers every endpoint. Exempts the payment webhook.
  app.use(globalRateLimiter);

  // Health endpoint root mapping
  app.get('/health', getHealth);

  // API Routes (mounted at /api and /api/v1 for compatibility)
  app.use('/api', routes);
  app.use(serverConfig.apiPrefix, routes);

  // 404 Handler
  app.use(notFoundHandler);

  // Centralized Error Handling
  app.use(errorMiddleware);

  return app;
}

export default createApp;
