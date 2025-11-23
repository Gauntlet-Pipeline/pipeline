import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { videoSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { uploadPdfToS3, uploadImageToS3 } from "@/server/services/pdf-storage";

export const runtime = "nodejs";
export const maxDuration = 60; // PDF processing can take time

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const formData = await req.formData();
    const pdfFile = formData.get("pdf") as File;
    let sessionId = formData.get("sessionId") as string;
    const extractedText = formData.get("extractedText") as string;
    const imageCount = parseInt(formData.get("imageCount") as string) || 0;

    if (!pdfFile) {
      return new Response("Missing PDF file", { status: 400 });
    }

    // If no sessionId provided, create a new session
    if (!sessionId) {
      const { nanoid } = await import("nanoid");
      sessionId = nanoid();
      await db.insert(videoSessions).values({
        id: sessionId,
        userId: session.user.id,
        status: "created",
      });
    } else {
      // Verify session belongs to user
      const [sessionData] = await db
        .select()
        .from(videoSessions)
        .where(eq(videoSessions.id, sessionId))
        .limit(1);

      if (!sessionData || sessionData.userId !== session.user.id) {
        return new Response("Session not found", { status: 404 });
      }
    }

    // 1. Upload original PDF to S3
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const pdfUrl = await uploadPdfToS3(
      pdfBuffer,
      sessionId,
      pdfFile.name,
      session.user.id,
    );

    // 2. Upload pre-extracted images from client
    const imageUrls: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      const imageBlob = formData.get(`image_${i}`) as File;
      if (imageBlob) {
        const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

        // Extract page number from filename (e.g., "page_1_img_0.png")
        const regex = /page_(\d+)_img_(\d+)/;
        const match = regex.exec(imageBlob.name);
        const pageNumber = match?.[1] ? parseInt(match[1]) : i + 1;
        const imageIndex = match?.[2] ? parseInt(match[2]) : 0;

        const imageUrl = await uploadImageToS3(
          new Blob([imageBuffer]),
          sessionId,
          session.user.id,
          imageIndex,
          pageNumber,
        );
        imageUrls.push(imageUrl);
      }
    }

    // 3. Save extracted text to session
    await db
      .update(videoSessions)
      .set({
        sourceMaterials: {
          text: extractedText,
          extractedAt: new Date().toISOString(),
          filename: pdfFile.name,
          pdfUrl,
          imageUrls,
          numPages: imageCount > 0 ? imageCount : 0,
        },
        updatedAt: new Date(),
      })
      .where(eq(videoSessions.id, sessionId));

    return Response.json({
      success: true,
      sessionId,
      pdfUrl,
      imageCount: imageUrls.length,
      imageUrls,
    });
  } catch (error) {
    console.error("Error uploading PDF:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
