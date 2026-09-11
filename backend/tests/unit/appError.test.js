import { AppError } from '../../src/utils/AppError.js';

describe('AppError', () => {
  it('should create an instance of AppError with standard defaults', () => {
    const error = new AppError('Something went wrong');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.isOperational).toBe(true);
    expect(error.details).toBeNull();
  });

  it('should create an AppError with custom status code, code, and details', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const error = new AppError('Invalid input', 400, 'VALIDATION_ERROR', details);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
  });
});
