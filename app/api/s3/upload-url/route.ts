import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getPresignedPutUrl, isS3Configured } from "@/lib/s3";

/**
 * POST /api/s3/upload-url
 *
 * Issues a presigned S3 PUT URL so the admin browser can upload a master
 * video directly to the private S3 bucket — no bytes transit our server.
 *
 * Body: { fileName: string; mimeType?: string; }
 *
 * Response:
 *   uploadUrl  — presigned PUT URL (2-hour expiry)
 *   s3Key      — object key inside the bucket (e.g. "videos/<uuid>.mp4")
 *   expiresAt  — ISO timestamp when the URL expires
 */
export async function POST(req: Request) {
  try {
    if (!isS3Configured()) {
      return NextResponse.json(
        {
          error:
            "AWS S3 is not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in your .env file.",
        },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawName: string = (body.fileName as string) || "video.mp4";
    const mimeType: string = (body.mimeType as string) || "video/mp4";

    // Sanitise filename for use in S3 key
    const ext = rawName.split(".").pop()?.toLowerCase() || "mp4";
    const safeExt = ["mp4", "mov", "webm", "avi"].includes(ext) ? ext : "mp4";

    // Store all master videos under a dedicated "videos/" prefix (appears as
    // a folder in the S3 console and Payload CMS media browser).
    const uuid = randomUUID();
    const s3Key = `videos/${uuid}.${safeExt}`;

    const uploadUrl = await getPresignedPutUrl(s3Key, mimeType, 7200);

    const expiresAt = new Date(Date.now() + 7200 * 1000).toISOString();

    return NextResponse.json({ uploadUrl, s3Key, expiresAt });
  } catch (error: any) {
    console.error("[S3 Upload URL]", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate S3 upload URL" },
      { status: 500 }
    );
  }
}
