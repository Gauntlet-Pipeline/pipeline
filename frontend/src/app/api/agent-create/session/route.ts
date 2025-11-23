import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { videoSessions, conversationMessages } from "@/server/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("sessionId required", { status: 400 });
  }

  try {
    // Load session data
    const [sessionData] = await db
      .select()
      .from(videoSessions)
      .where(eq(videoSessions.id, sessionId))
      .limit(1);

    if (!sessionData || sessionData.userId !== session.user.id) {
      return new Response("Session not found", { status: 404 });
    }

    // Load conversation messages directly from database to preserve parts
    const dbMessages = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.sessionId, sessionId))
      .orderBy(asc(conversationMessages.createdAt));

    return Response.json({
      session: {
        id: sessionData.id,
        status: sessionData.status,
        extractedFacts: sessionData.extractedFacts,
        confirmedFacts: sessionData.confirmedFacts,
        generatedScript: sessionData.generatedScript,
        topic: sessionData.topic,
        childAge: sessionData.childAge,
        childInterest: sessionData.childInterest,
      },
      messages: dbMessages.map((m) => ({
        role: m.role,
        content: m.content,
        id: m.id,
        parts: m.parts ?? undefined, // Include parts if they exist (for file attachments)
      })),
    });
  } catch (error) {
    console.error("Error loading session:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to load session",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
