import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_BLOG_COVER_MIME,
  type DefaultBlogCoverImage,
} from "@/lib/blog/defaultBlogImage";

let cachedDefaultCover: DefaultBlogCoverImage | null = null;

export function getDefaultBlogCoverImage(): DefaultBlogCoverImage {
  if (!cachedDefaultCover) {
    const filePath = path.join(
      process.cwd(),
      "public",
      "images",
      "invite-earn-promo-bg.png"
    );
    const buffer = readFileSync(filePath);
    cachedDefaultCover = {
      base64: buffer.toString("base64"),
      mime: DEFAULT_BLOG_COVER_MIME,
    };
  }

  return cachedDefaultCover;
}
