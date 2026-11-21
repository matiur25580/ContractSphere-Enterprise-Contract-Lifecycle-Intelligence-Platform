import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env.js";
import { HttpError } from "../../common/http-error.js";

const configured = Boolean(env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
const client = configured ? new S3Client({
  region: env.S3_REGION!,
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  forcePathStyle: Boolean(env.S3_ENDPOINT),
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! }
}) : null;

function storage() {
  if (!client || !env.S3_BUCKET) throw new HttpError(503, "Document storage is not configured. Set the S3 environment variables.", "STORAGE_NOT_CONFIGURED");
  return { client, bucket: env.S3_BUCKET };
}
export async function createUploadUrl(input: { objectKey: string; contentType: string; sizeBytes: number }) {
  const { client, bucket } = storage();
  const command = new PutObjectCommand({ Bucket: bucket, Key: input.objectKey, ContentType: input.contentType, ContentLength: input.sizeBytes, ServerSideEncryption: "AES256" });
  return getSignedUrl(client, command, { expiresIn: 300 });
}
export async function inspectStoredObject(objectKey: string) {
  const { client, bucket } = storage();
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? "" };
  } catch {
    throw new HttpError(400, "The uploaded document could not be verified in private storage.", "UPLOAD_NOT_FOUND");
  }
}
export async function createDownloadUrl(objectKey: string) {
  const { client, bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: 60 });
}
