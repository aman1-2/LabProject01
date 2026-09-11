import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

// Express identifies an error handler by arity 4, so the fourth parameter must
// remain even though it is unused.
export function errorMiddleware(err, req, res, _next) {
  let error = err;

  // Log error with context
  logger.error('Unhandled or operational error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  // Handle Mongoose / MongoDB Duplicate Key Error (11000)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    error = new AppError(
      `Duplicate field value entered: ${fields.join(', ')}. Please use unique values.`,
      409,
      'DUPLICATE_KEY_ERROR',
      err.keyValue
    );
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    error = new AppError(
      `Database validation failed: ${messages.join(', ')}`,
      400,
      'VALIDATION_ERROR',
      err.errors
    );
  }

  // Handle Zod Validation Error
  if (err.name === 'ZodError') {
    error = new AppError('Validation failed', 400, 'VALIDATION_ERROR', err.issues);
  }

  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.isOperational
    ? error.message
    : 'An unexpected internal server error occurred';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV !== 'production' && error.details ? { details: error.details } : {}),
    },
  });
}

export default errorMiddleware;
