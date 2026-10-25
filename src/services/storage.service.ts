import { env } from '@/config/env';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

interface UploadStreamToS3 {
  stream: Readable;
  key: string;
  mimeType: string;
}

export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

export const ensureBucketExists = async () => {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET_NAME }));
  } catch (_error) {
    try {
      await s3Client.send(
        new CreateBucketCommand({ Bucket: env.S3_BUCKET_NAME }),
      );
      console.log(`[S3 Storage] Created bucket: ${env.S3_BUCKET_NAME}`);
    } catch (error) {
      console.error('[S3 storage] Failed to ensure bucket exists', error);
    }
  }
};

export const uploadToS3 = async ({
  key,
  buffer,
  mimeType,
}: {
  key: string;
  buffer: Buffer;
  mimeType: string;
}) => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
};

export const deleteFromS3 = async (key: string) => {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    }),
  );
};

export const getPresignedDownloadUrl = async (
  key: string,
  expiresInSeconds = 3600,
) => {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

export const uploadStreamToS3 = async ({
  key,
  stream,
  mimeType,
}: UploadStreamToS3) => {
  const parallelUpload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: stream,
      ContentType: mimeType,
    },
  });

  await parallelUpload.done();
};
