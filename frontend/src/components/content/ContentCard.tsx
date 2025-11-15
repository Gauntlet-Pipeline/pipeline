"use client";

import { Card } from "@/components/ui/card";
import { ContentActions } from "./ContentActions";
import type { FileInfo } from "@/types/storage";
import { AssetType } from "@/types/storage";
import Image from "next/image";
import { formatBytes, getAssetTypeFromKey } from "./utils";

interface ContentCardProps {
  file: FileInfo;
  onDelete: () => Promise<void>;
  isDeleting?: boolean;
}

export function ContentCard({
  file,
  onDelete,
  isDeleting = false,
}: ContentCardProps) {
  const assetType = getAssetTypeFromKey(file.key);
  const isImage = file.content_type.startsWith("image/");
  const isVideo = file.content_type.startsWith("video/");
  const isAudio = file.content_type.startsWith("audio/");
  const isFinal = assetType === AssetType.FINAL;

  const fileName = file.key.split("/").pop() ?? "unknown";

  return (
    <Card className="overflow-hidden">
      <div className="bg-muted relative aspect-video">
        {isImage && (
          <Image
            src={file.presigned_url}
            alt={fileName}
            fill
            className="object-cover"
            unoptimized
          />
        )}
        {isVideo && (
          <video
            src={file.presigned_url}
            controls
            className="h-full w-full object-cover"
          />
        )}
        {isAudio && (
          <div className="flex h-full items-center justify-center">
            <audio src={file.presigned_url} controls className="w-full" />
          </div>
        )}
        {!isImage && !isVideo && !isAudio && (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <span>Preview not available</span>
          </div>
        )}
        {isFinal && (
          <div className="bg-primary text-primary-foreground absolute top-2 right-2 rounded px-2 py-1 text-xs font-semibold">
            Final
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <p className="truncate text-sm font-medium" title={fileName}>
            {fileName}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatBytes(file.size)}
          </p>
        </div>
        <ContentActions
          presignedUrl={file.presigned_url}
          fileName={fileName}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      </div>
    </Card>
  );
}
