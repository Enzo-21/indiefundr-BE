"use client";

import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { estimateBase64Bytes } from "@/lib/blog/imageBase64";

type BlogImageUploadButtonProps = {
  editor: Editor | null;
};

export function BlogImageUploadButton({ editor }: BlogImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(file: File | null) {
    if (!file || !editor) return;
    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file");
    }

    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.split(",")[1] ?? "";
    if (estimateBase64Bytes(base64) > 500 * 1024) {
      throw new Error("Each inline image must be 500 KB or smaller");
    }

    editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={!editor}
      >
        <ImagePlus className="size-4" />
        Image
      </Button>
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
    </>
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
