import { FinalVideosGallery } from "@/components/content/FinalVideosGallery";

export default function AssetsPage() {
  return (
    <div className="flex flex-col overflow-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">My Videos</h1>
        <p className="text-muted-foreground text-sm">
          All your completed educational videos
        </p>
      </div>
      <FinalVideosGallery />
    </div>
  );
}
