import { 
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  AbortMultipartUploadCommand, 
  ListMultipartUploadsCommand 
} from '@aws-sdk/client-s3';
import { s3 } from '../../src/features/storage/s3-client.js';
import crypto from 'crypto';

const bucketName = 'jarvis-sandbox-storage';
const key = 'stress-test-multipart-abort.bin';

async function run() {
  console.log('Starting ST-006: S3 Multipart Abort & Cleanup stress test...');
  
  try {
    // 1. Create multipart upload
    console.log('Creating S3 Multipart Upload...');
    const createRes = await s3.send(new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: 'application/octet-stream'
    }));

    const uploadId = createRes.UploadId;
    console.log(`Multipart upload created with ID: ${uploadId}`);

    // 2. Upload first 5MB part
    console.log('Generating 5MB part buffer...');
    const partBuffer = crypto.randomBytes(5 * 1024 * 1024);
    
    console.log('Uploading Part 1...');
    await s3.send(new UploadPartCommand({
      Bucket: bucketName,
      Key: key,
      UploadId: uploadId,
      PartNumber: 1,
      Body: partBuffer
    }));
    console.log('Part 1 uploaded successfully.');

    // 3. Abort the upload mid-transfer
    console.log('Aborting multipart upload to trigger cleanup...');
    await s3.send(new AbortMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      UploadId: uploadId
    }));
    console.log('Multipart upload successfully aborted.');

    // 4. Verify that no pending uploads exist for this key
    console.log('Verifying active multipart uploads list...');
    const listRes = await s3.send(new ListMultipartUploadsCommand({
      Bucket: bucketName
    }));

    const pending = (listRes.Uploads || []).find(u => u.UploadId === uploadId);
    if (!pending) {
      console.log('ST-006 SUCCESS: Incomplete parts cleaned and upload completely purged from MinIO!');
      process.exit(0);
    } else {
      console.error('ST-006 FAILURE: Multipart upload still listed as active after abort!');
      process.exit(1);
    }
  } catch (err) {
    console.error('ST-006 ERROR during multipart lifecycle:', err.message);
    process.exit(1);
  }
}

run();
