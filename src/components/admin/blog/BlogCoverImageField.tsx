"use client";

import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BLOG_COVER_ASPECT_RATIO,
  BLOG_COVER_LABEL,
  coverObjectPosition,
} from "@/lib/blog/coverImage";
import { assertCoverImageWithinLimit } from "@/lib/blog/imageBase64";
import { cn } from "@/lib/utils";

type BlogCoverImageFieldProps = {
  label: string;
  previewUrl: string | null;
  previewPositionY?: number;
  onChange: (value: { base64: string; mime: string } | null) => void;
};

export function BlogCoverImageField({
  label,
  previewUrl,
  previewPositionY = 50,
  onChange,
}: BlogCoverImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file");
    }

    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.split(",")[1] ?? "";
    assertCoverImageWithinLimit(base64);
    onChange({ base64: dataUrl, mime: file.type });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-muted-foreground text-xs">
            Recommended: {BLOG_COVER_LABEL} (same as article header preview).
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
          {previewUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
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
      {previewUrl ? (
        <div
          className={cn("bg-muted max-w-md overflow-hidden rounded-md border")}
          style={{ aspectRatio: String(BLOG_COVER_ASPECT_RATIO) }}
        >
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-full w-full object-cover"
            style={{ objectPosition: coverObjectPosition(previewPositionY) }}
          />
        </div>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
          No image selected
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
