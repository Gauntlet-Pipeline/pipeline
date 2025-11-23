import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { nanoid } from "nanoid";
import { db } from "@/server/db";
import { videoAssets } from "@/server/db/schema";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        "AWS credentials not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME in .env",
      );
    }

    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Upload PDF file to S3 and save reference in videoAssets
 */
export async function uploadPdfToS3(
  file: Buffer,
  sessionId: string,
  filename: string,
  userId: string,
): Promise<string> {
  if (!env.S3_BUCKET_NAME) {
    throw new Error("S3_BUCKET_NAME not configured");
  }

  const client = getS3Client();
  const key = `users/${userId}/${sessionId}/pdfs/${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: "application/pdf",
    }),
  );

  const s3Url = `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;

  // Save reference in videoAssets
  await db.insert(videoAssets).values({
    id: nanoid(),
    sessionId,
    assetType: "source_pdf",
    url: s3Url,
    metadata: {
      filename,
      uploadedAt: new Date().toISOString(),
      s3Key: key,
    },
  });

  return s3Url;
}

/**
 * Upload extracted image to S3 and save reference in videoAssets
 */
export async function uploadImageToS3(
  imageBlob: Blob,
  sessionId: string,
  userId: string,
  imageIndex: number,
  pageNumber: number,
): Promise<string> {
  if (!env.S3_BUCKET_NAME) {
    throw new Error("S3_BUCKET_NAME not configured");
  }

  const client = getS3Client();
  const key = `users/${userId}/${sessionId}/pdf-images/page_${pageNumber}_img_${imageIndex}.png`;
  const buffer = Buffer.from(await imageBlob.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    }),
  );

  const s3Url = `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;

  // Save reference in videoAssets
  await db.insert(videoAssets).values({
    id: nanoid(),
    sessionId,
    assetType: "pdf_extracted_image",
    url: s3Url,
    metadata: {
      pageNumber,
      imageIndex,
      extractedAt: new Date().toISOString(),
      s3Key: key,
    },
  });

  return s3Url;
}


