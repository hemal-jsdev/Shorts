/**
 * lib/s3.ts
 *
 * Centralised AWS S3 helpers for the Shorts CMS.
 *
 * Responsibilities:
 *   - Upload a Buffer to S3 (multipart-aware)
 *   - Generate a short-lived presigned GET URL (for Cloudflare Stream /copy API)
 *   - Generate a short-lived presigned PUT URL (for browser-direct uploads)
 *   - Delete an S3 object
 *
 * All objects are stored PRIVATE. Access is only via presigned URLs.
 */

import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Client Singleton ─────────────────────────────────────────────────────────

function buildS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  const endpoint = process.env.AWS_S3_ENDPOINT?.trim() || undefined;

  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_client) _client = buildS3Client();
  return _client;
}

export function getS3Bucket(): string {
  return process.env.AWS_S3_BUCKET || '';
}

/** Returns true when all required env vars are present and look real */
export function isS3Configured(): boolean {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET } = process.env;
  return Boolean(
    AWS_ACCESS_KEY_ID &&
      !AWS_ACCESS_KEY_ID.includes('your_') &&
      AWS_SECRET_ACCESS_KEY &&
      !AWS_SECRET_ACCESS_KEY.includes('your_') &&
      AWS_S3_BUCKET &&
      !AWS_S3_BUCKET.includes('your-')
  );
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface S3UploadResult {
  s3Uri: string;   // s3://<bucket>/<key>
  key: string;     // object key within the bucket
  s3Url: string;   // non-signed HTTPS URL (private — use presigned to read)
  bucket: string;
}

/**
 * Upload a Buffer to S3 using multipart so large files work reliably.
 * @param key      S3 object key, e.g. "videos/abc123.mp4"
 * @param body     Raw video buffer
 * @param mimeType Content-Type, defaults to "video/mp4"
 * @param onProgress Optional 0-100 callback
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  mimeType = 'video/mp4',
  onProgress?: (pct: number) => void
): Promise<S3UploadResult> {
  const client = getS3Client();
  const bucket = getS3Bucket();
  if (!bucket) throw new Error('AWS_S3_BUCKET environment variable is not set.');

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    },
    partSize: 5 * 1024 * 1024,
    queueSize: 4,
  });

  upload.on('httpUploadProgress', (progress) => {
    if (onProgress && progress.total && progress.loaded) {
      onProgress(Math.min(99, Math.round((progress.loaded / progress.total) * 100)));
    }
  });

  await upload.done();
  onProgress?.(100);

  const region = process.env.AWS_REGION || 'us-east-1';
  const endpoint = process.env.AWS_S3_ENDPOINT?.trim();
  const s3Url = endpoint
    ? `${endpoint}/${bucket}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return { s3Uri: `s3://${bucket}/${key}`, key, s3Url, bucket };
}

// ─── Presigned GET (read) ─────────────────────────────────────────────────────

/**
 * Generate a time-limited presigned URL for reading a private S3 object.
 * Used by Cloudflare Stream /stream/copy to pull the master video.
 * @param key          S3 object key
 * @param expiresInSec How long the URL is valid (default 2 hours)
 */
export async function getPresignedGetUrl(
  key: string,
  expiresInSec = 7200
): Promise<string> {
  const client = getS3Client();
  const bucket = getS3Bucket();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

// ─── Presigned PUT (browser-direct write) ─────────────────────────────────────

/**
 * Generate a presigned PUT URL so the admin browser can upload directly to S3.
 * @param key          S3 object key
 * @param mimeType     video/mp4 | video/quicktime | video/webm
 * @param expiresInSec How long the URL is valid (default 2 hours)
 */
export async function getPresignedPutUrl(
  key: string,
  mimeType = 'video/mp4',
  expiresInSec = 7200
): Promise<string> {
  const client = getS3Client();
  const bucket = getS3Bucket();
  if (!bucket) throw new Error('AWS_S3_BUCKET environment variable is not set.');
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType });
  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/** Delete an object from S3. Safe to call even if it does not exist. */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: getS3Bucket(), Key: key }));
  } catch (err: any) {
    if (err?.Code !== 'NoSuchKey') throw err;
  }
}

// ─── Exists ───────────────────────────────────────────────────────────────────

/** Returns true if an object exists in S3 */
export async function existsInS3(key: string): Promise<boolean> {
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: getS3Bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}
