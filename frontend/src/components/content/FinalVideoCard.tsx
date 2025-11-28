"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Film, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatBytes } from "./utils";
import { format } from "date-fns";

interface FinalVideoCardProps {
  sessionId: string;
  topic: string | null;
  createdAt: Date | null;
  videoUrl: string;
  size: number;
}

export function FinalVideoCard({
  sessionId,
  topic,
  createdAt,
  videoUrl,
  size,
}: FinalVideoCardProps) {
  const router = useRouter();

  return (
    <Card className="overflow-hidden py-0">
      <div className="bg-muted/50 relative aspect-video">
        <video
          src={videoUrl}
          controls
          preload="metadata"
          className="h-full w-full object-cover"
        >
          Your browser does not support the video tag.
        </video>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold">
            {topic ?? "Untitled Video"}
          </h3>
          {createdAt && (
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <Calendar className="size-3" />
              <span>{format(new Date(createdAt), "PPP")}</span>
            </div>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            {formatBytes(size)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() =>
              router.push(
                `/dashboard/editing/${sessionId}?videoUrl=${encodeURIComponent(videoUrl)}&autoEdit=true`,
              )
            }
          >
            <Film className="mr-2 size-4" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(videoUrl, "_blank")}
          >
            <ExternalLink className="mr-2 size-4" />
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const link = document.createElement("a");
              link.href = videoUrl;
              link.download = `${topic ?? "video"}.mp4`;
              link.click();
            }}
          >
            <Download className="mr-2 size-4" />
            Download
          </Button>
        </div>
      </div>
    </Card>
  );
}
