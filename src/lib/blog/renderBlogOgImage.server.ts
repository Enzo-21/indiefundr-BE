import sharp from "sharp";
import {
  BLOG_COVER_HEIGHT,
  BLOG_COVER_WIDTH,
} from "@/lib/blog/coverImage";

type RenderedBlogOgImage = {
  base64: string;
  mime: string;
};

export async function renderBlogOgImage(
  base64: string,
  positionY: number
): Promise<RenderedBlogOgImage> {
  const clampedY = Math.min(100, Math.max(0, Math.round(positionY)));
  const input = Buffer.from(base64, "base64");
  const metadata = await sharp(input).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;

  const scale = Math.max(
    BLOG_COVER_WIDTH / imageWidth,
    BLOG_COVER_HEIGHT / imageHeight
  );
  const scaledWidth = Math.round(imageWidth * scale);
  const scaledHeight = Math.round(imageHeight * scale);
  const left = Math.max(0, Math.round((scaledWidth - BLOG_COVER_WIDTH) / 2));
  const top = Math.max(
    0,
    Math.round(((scaledHeight - BLOG_COVER_HEIGHT) * clampedY) / 100)
  );

  const output = await sharp(input)
    .resize(scaledWidth, scaledHeight)
    .extract({
      left,
      top,
      width: BLOG_COVER_WIDTH,
      height: BLOG_COVER_HEIGHT,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return {
    base64: output.toString("base64"),
    mime: "image/jpeg",
  };
}
