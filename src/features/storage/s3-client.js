import { S3Client } from '@aws-sdk/client-s3';
import config from '../../config.js';

export const s3 = new S3Client({
  region: 'us-east-1', // MinIO default
  endpoint: config.storage.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
  },
});
