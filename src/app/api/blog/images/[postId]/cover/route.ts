import { getBlogPostCoverImage } from "@/services/blog/blogPosts";

type RouteParams = {
  params: Promise<{ postId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { postId } = await params;
  const image = await getBlogPostCoverImage(postId);

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Buffer.from(image.base64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
