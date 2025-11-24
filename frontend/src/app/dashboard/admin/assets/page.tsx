import { ContentGallery } from "@/components/content/ContentGallery";
import { auth } from "@/server/auth";
import { UserRole } from "@/types";
import { redirect } from "next/navigation";

export default async function AdminAssetsPage() {
  const session = await auth();

  // Check if user is admin
  if (!session?.user || session.user.role !== UserRole.ADMIN) {
    redirect("/dashboard/assets");
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">All Assets (Admin)</h1>
        <p className="text-muted-foreground text-sm">
          Browse and manage all generated assets including images, videos,
          audio, and final videos
        </p>
      </div>
      <ContentGallery />
    </div>
  );
}

