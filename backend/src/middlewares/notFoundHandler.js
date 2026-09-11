import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, res, next) {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404, 'RESOURCE_NOT_FOUND'));
}

export default notFoundHandler;
