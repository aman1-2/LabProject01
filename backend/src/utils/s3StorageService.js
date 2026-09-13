import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from './AppError.js';
import logger from './logger.js';

const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'pathcare-reports-private';

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    const hasAwsCreds = Boolean(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      !process.env.AWS_ACCESS_KEY_ID.includes('your_aws')
    );

    if (hasAwsCreds) {
      s3Client = new S3Client({
        region: AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    }
  }
  return s3Client;
}

/**
 * Generate a presigned S3 PUT URL for uploading a private lab report PDF
 * @param {Object} params
 * @param {string} params.bookingId
 * @param {string} params.labCenterId
 * @param {string} [params.contentType='application/pdf']
 * @param {number} [params.expiresIn=900] - 15 minutes TTL
 * @returns {Promise<{ uploadUrl: string, fileKey: string, expiresIn: number }>}
 */
export async function generateReportUploadUrl({ bookingId, labCenterId, contentType = 'application/pdf', expiresIn = 900 }) {
  const timestamp = Date.now();
  const fileKey = `reports/${labCenterId}/${bookingId}/${timestamp}-report.pdf`;
  const client = getS3Client();

  if (client) {
    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn });
      return { uploadUrl, fileKey, expiresIn };
    } catch (err) {
      logger.warn('AWS S3 Presigning failed, falling back to local signed URL', { error: err.message });
    }
  }

  // No fabricated URL. This previously returned a link that LOOKED like an S3
  // presigned URL but carried a home-made HMAC in a home-made format, which S3
  // rejects with 403 every time — so a lab admin saw an upload that always
  // failed and it looked like an S3 outage (CONTEXT §11).
  throw new AppError(
    'Report storage is not configured. Set AWS credentials to enable report uploads.',
    503,
    'STORAGE_UNAVAILABLE'
  );
}

/**
 * Generate a fresh presigned S3 GET URL for patient report download
 * @param {Object} params
 * @param {string} params.fileKey
 * @param {number} [params.expiresIn=900] - 15 minutes TTL
 * @returns {Promise<string>}
 */
export async function generateReportDownloadUrl({ fileKey, expiresIn = 900 }) {
  const client = getS3Client();

  if (client) {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
      });
      return await getSignedUrl(client, command, { expiresIn });
    } catch (err) {
      logger.warn('AWS S3 Get Presigning failed, falling back to local signed URL', { error: err.message });
    }
  }

  // No fabricated URL — a patient must not be handed a download link that 403s
  // on a report the app says is ready.
  throw new AppError(
    'Report storage is not configured. Set AWS credentials to enable report downloads.',
    503,
    'STORAGE_UNAVAILABLE'
  );
}

/**
 * Validate whether a signed URL is currently valid or expired
 * @param {string} urlString
 * @param {number} [currentTimeMs=Date.now()]
 * @returns {boolean}
 */
export function isSignedUrlValid(urlString, currentTimeMs = Date.now()) {
  try {
    const url = new URL(urlString);
    const dateParam = url.searchParams.get('X-Amz-Date');
    const expiresParam = url.searchParams.get('X-Amz-Expires');

    if (!dateParam || !expiresParam) return false;

    const issuedTimeMs = Number(dateParam);
    const ttlSeconds = Number(expiresParam);

    if (isNaN(issuedTimeMs) || isNaN(ttlSeconds)) return false;

    const expirationTimeMs = issuedTimeMs + ttlSeconds * 1000;
    return currentTimeMs <= expirationTimeMs;
  } catch {
    return false;
  }
}

export default {
  generateReportUploadUrl,
  generateReportDownloadUrl,
  isSignedUrlValid,
};
