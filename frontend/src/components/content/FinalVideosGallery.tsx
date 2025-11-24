"use client";

import { api } from "@/trpc/react";
import { FinalVideoCard } from "./FinalVideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, VideoIcon } from "lucide-react";
import { useState } from "react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

const ITEMS_PER_PAGE = 12;

type FinalVideo = {
  sessionId: string;
  topic: string | null;
  status: string;
  createdAt: Date | null;
  videoUrl: string;
  fileKey: string;
  size: number;
  lastModified: string | null;
};

export function FinalVideosGallery() {
  const [currentPage, setCurrentPage] = useState(1);
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  const { data, isLoading } = api.finalVideos.list.useQuery({
    limit: ITEMS_PER_PAGE,
    offset,
  }) as {
    data:
      | {
          videos: FinalVideo[];
          total: number;
          limit: number;
          offset: number;
        }
      | undefined;
    isLoading: boolean;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.videos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <VideoIcon className="size-12" />
        </EmptyHeader>
        <EmptyTitle>No videos yet</EmptyTitle>
        <EmptyDescription>
          Your completed videos will appear here. Start creating your first
          educational video!
        </EmptyDescription>
      </Empty>
    );
  }

  const totalPages = Math.ceil(data.total / ITEMS_PER_PAGE);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.videos.map((video) => (
          <FinalVideoCard
            key={video.fileKey}
            sessionId={video.sessionId}
            topic={video.topic}
            createdAt={video.createdAt}
            videoUrl={video.videoUrl}
            size={video.size}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {offset + 1}-{Math.min(offset + ITEMS_PER_PAGE, data.total)}{" "}
            of {data.total} videos
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="mr-2 size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
