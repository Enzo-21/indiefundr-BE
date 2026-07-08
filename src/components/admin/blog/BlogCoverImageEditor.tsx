"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { assertCoverImageWithinLimit } from "@/lib/blog/imageBase64";
import {
  BLOG_COVER_ASPECT_RATIO,
  BLOG_COVER_LABEL,
  coverObjectPosition,
  DEFAULT_COVER_POSITION_Y,
} from "@/lib/blog/coverImage";
import { DEFAULT_BLOG_COVER_PUBLIC_PATH } from "@/lib/blog/defaultBlogImage";
import { cn } from "@/lib/utils";

export type BlogCoverImageValue = {
  base64: string;
  mime: string;
} | null;

type BlogCoverImageEditorProps = {
  image: BlogCoverImageValue;
  positionY: number;
  onImageChange: (value: BlogCoverImageValue) => void;
  onPositionYChange: (value: number) => void;
};

function clampPosition(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function CoverPreview({
  imageUrl,
  positionY,
  label,
  className,
}: {
  imageUrl: string;
  positionY: number;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <div
        className="bg-muted overflow-hidden rounded-md border"
        style={{ aspectRatio: String(BLOG_COVER_ASPECT_RATIO) }}
      >
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full object-cover"
          style={{ objectPosition: coverObjectPosition(positionY) }}
          draggable={false}
        />
      </div>
    </div>
  );
}

export function BlogCoverImageEditor({
  image,
  positionY,
  onImageChange,
  onPositionYChange,
}: BlogCoverImageEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ startY: number; startPosition: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const imageUrl = image?.base64 ?? null;

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file");
    }

    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.split(",")[1] ?? "";
    assertCoverImageWithinLimit(base64);
    onImageChange({ base64: dataUrl, mime: file.type });
    onPositionYChange(DEFAULT_COVER_POSITION_Y);
  }

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragState.current) return;
      const delta = event.clientY - dragState.current.startY;
      const next = clampPosition(dragState.current.startPosition + delta * 0.35);
      onPositionYChange(next);
    },
    [onPositionYChange]
  );

  const endDrag = useCallback(() => {
    dragState.current = null;
    setIsDragging(false);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [handlePointerMove]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageUrl) return;
    event.preventDefault();
    dragState.current = { startY: event.clientY, startPosition: positionY };
    setIsDragging(true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Cover image</p>
          <p className="text-muted-foreground text-xs">
            Recommended cover: {BLOG_COVER_LABEL}. Larger images are OK — adjust the
            visible area below.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            Upload
          </Button>
          {imageUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onImageChange(null);
                onPositionYChange(DEFAULT_COVER_POSITION_Y);
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleFileChange(file).catch((error) => {
            alert(error instanceof Error ? error.message : "Upload failed");
          });
          event.currentTarget.value = "";
        }}
      />

      {imageUrl ? (
        <>
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              Drag the image vertically or use the slider to choose what appears in the
              16:9 frame.
            </p>
            <div
              className={cn(
                "relative overflow-hidden rounded-xl border bg-black/80",
                isDragging ? "cursor-grabbing" : "cursor-grab"
              )}
              style={{ aspectRatio: String(BLOG_COVER_ASPECT_RATIO) }}
              onPointerDown={startDrag}
            >
              <img
                src={imageUrl}
                alt="Cover position editor"
                className="pointer-events-none h-full w-full select-none object-cover"
                style={{ objectPosition: coverObjectPosition(positionY) }}
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-white/70 ring-inset" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover-position-y">Vertical position</Label>
              <input
                id="cover-position-y"
                type="range"
                min={0}
                max={100}
                value={positionY}
                onChange={(event) =>
                  onPositionYChange(clampPosition(Number(event.target.value)))
                }
                className="w-full"
              />
              <p className="text-muted-foreground text-xs">
                {positionY}% — lower values show more of the top; higher values show more
                of the bottom.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CoverPreview
              imageUrl={imageUrl}
              positionY={positionY}
              label="Blog list card preview"
            />
            <CoverPreview
              imageUrl={imageUrl}
              positionY={positionY}
              label="Article header preview"
              className="sm:max-w-md"
            />
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            No custom cover uploaded. The invite promo background will be used on the
            public blog.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CoverPreview
              imageUrl={DEFAULT_BLOG_COVER_PUBLIC_PATH}
              positionY={DEFAULT_COVER_POSITION_Y}
              label="Default blog list preview"
            />
            <CoverPreview
              imageUrl={DEFAULT_BLOG_COVER_PUBLIC_PATH}
              positionY={DEFAULT_COVER_POSITION_Y}
              label="Default article header preview"
              className="sm:max-w-md"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
