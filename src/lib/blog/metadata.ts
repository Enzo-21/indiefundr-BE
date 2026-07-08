import type { Metadata } from "next";
import type { PublicBlogPost } from "@/services/blog/blogPosts";
import { BLOG_COVER_HEIGHT, BLOG_COVER_WIDTH } from "@/lib/blog/coverImage";
import { createSiteMetadata } from "@/lib/marketing/metadata";

export function createBlogPostMetadata(post: PublicBlogPost): Metadata {
  const title = post.metaTitle ?? post.title;
  const description = post.metaDescription ?? post.excerpt ?? undefined;
  const canonicalPath = post.canonicalPath ?? `/blog/${post.slug}`;
  const ogImageUrl = `/api/blog/images/${post.id}/og`;

  return createSiteMetadata({
    title,
    description,
    keywords: post.metaKeywords ?? undefined,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonicalPath,
      publishedTime: post.publishedAt?.toISOString(),
      images: [
        {
          url: ogImageUrl,
          width: BLOG_COVER_WIDTH,
          height: BLOG_COVER_HEIGHT,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    robots: post.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  });
}

export function getBlogCoverImageUrl(postId: string) {
  return `/api/blog/images/${postId}/cover`;
}
