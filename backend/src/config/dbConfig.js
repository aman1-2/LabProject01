import mongoose from 'mongoose';
import logger from '../utils/logger.js';

let isConnecting = false;

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (isConnecting) {
    return mongoose.connection;
  }

  if (!uri) {
    logger.warn('MONGODB_URI is not set. Database connection skipped.');
    return null;
  }

  try {
    isConnecting = true;
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== 'production',
    });
    logger.info('MongoDB connected successfully');
    return mongoose.connection;
  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message });
    throw error;
  } finally {
    isConnecting = false;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

export default { connectDB, disconnectDB, isDBConnected };
