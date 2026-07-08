import { BlogPostStatus as PrismaBlogPostStatus, type BlogPost } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BlogPostStatus } from "@/lib/blog/blogPostStatus";
import { DEFAULT_COVER_POSITION_Y } from "@/lib/blog/coverImage";
import { getDefaultBlogCoverImage } from "@/lib/blog/defaultBlogCoverImage.server";
import { renderBlogOgImage } from "@/lib/blog/renderBlogOgImage.server";
import {
  assertCoverImageWithinLimit,
  assertInlineImagesWithinLimit,
  stripDataUrlPrefix,
} from "@/lib/blog/imageBase64";
import { sanitizeBlogHtml } from "@/lib/blog/sanitizeBlogHtml";
import { slugifyTitle } from "@/lib/blog/slug";
import {
  blogPostIdSchema,
  blogPostInputSchema,
  type BlogPostInput,
} from "@/lib/validators/blog";

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: PrismaBlogPostStatus;
  publishedAt: Date | null;
  updatedAt: Date;
  hasCoverImage: boolean;
  coverImagePositionY: number;
};

export type PublicBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml: string;
  coverImageMime: string | null;
  hasCoverImage: boolean;
  coverImagePositionY: number;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  hasOgImage: boolean;
  ogImageMime: string | null;
  canonicalPath: string | null;
  noIndex: boolean;
  publishedAt: Date | null;
  authorEmail: string | null;
};

function toSummary(post: BlogPost): BlogPostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    hasCoverImage: Boolean(post.coverImageBase64 && post.coverImageMime),
    coverImagePositionY: post.coverImagePositionY,
  };
}

function toPublicPost(post: BlogPost): PublicBlogPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    contentHtml: post.contentHtml,
    coverImageMime: post.coverImageMime,
    hasCoverImage: Boolean(post.coverImageBase64 && post.coverImageMime),
    coverImagePositionY: post.coverImagePositionY,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    metaKeywords: post.metaKeywords,
    hasOgImage: Boolean(post.ogImageBase64 && post.ogImageMime),
    ogImageMime: post.ogImageMime,
    canonicalPath: post.canonicalPath,
    noIndex: post.noIndex,
    publishedAt: post.publishedAt,
    authorEmail: post.authorEmail,
  };
}

function prepareContentHtml(contentHtml: string) {
  const sanitized = sanitizeBlogHtml(contentHtml);
  assertInlineImagesWithinLimit(sanitized);
  return sanitized;
}

function prepareImageField(
  image: BlogPostInput["coverImage"],
  label: string
): { base64: string | null; mime: string | null } {
  if (!image) {
    return { base64: null, mime: null };
  }

  const base64 = stripDataUrlPrefix(image.base64);
  if (label === "Cover image") {
    assertCoverImageWithinLimit(base64);
  } else {
    assertCoverImageWithinLimit(base64);
  }

  return { base64, mime: image.mime };
}

function buildPublishedAt(status: PrismaBlogPostStatus, existing?: Date | null) {
  if (status === BlogPostStatus.PUBLISHED) {
    return existing ?? new Date();
  }
  return null;
}

export async function listBlogPostsForAdmin(): Promise<BlogPostSummary[]> {
  const posts = await prisma.blogPost.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });
  return posts.map(toSummary);
}

export async function getBlogPostByIdForAdmin(id: string) {
  const parsedId = blogPostIdSchema.parse(id);
  return prisma.blogPost.findUnique({ where: { id: parsedId } });
}

export async function listPublishedBlogPosts(): Promise<BlogPostSummary[]> {
  const posts = await prisma.blogPost.findMany({
    where: { status: BlogPostStatus.PUBLISHED },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });
  return posts.map(toSummary);
}

export async function getPublishedBlogPostBySlug(slug: string) {
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: BlogPostStatus.PUBLISHED },
  });
  return post ? toPublicPost(post) : null;
}

export async function getBlogPostCoverImage(postId: string) {
  const parsedId = blogPostIdSchema.parse(postId);
  const post = await prisma.blogPost.findUnique({
    where: { id: parsedId },
    select: {
      coverImageBase64: true,
      coverImageMime: true,
      status: true,
    },
  });

  if (!post || post.status !== BlogPostStatus.PUBLISHED) {
    return null;
  }

  if (post.coverImageBase64 && post.coverImageMime) {
    return {
      base64: post.coverImageBase64,
      mime: post.coverImageMime,
    };
  }

  return getDefaultBlogCoverImage();
}

export async function getBlogPostOgImage(postId: string) {
  const parsedId = blogPostIdSchema.parse(postId);
  const post = await prisma.blogPost.findUnique({
    where: { id: parsedId },
    select: {
      ogImageBase64: true,
      ogImageMime: true,
      coverImageBase64: true,
      coverImageMime: true,
      coverImagePositionY: true,
      status: true,
    },
  });

  if (!post || post.status !== BlogPostStatus.PUBLISHED) {
    return null;
  }

  let sourceBase64: string;
  let positionY = DEFAULT_COVER_POSITION_Y;

  if (post.ogImageBase64 && post.ogImageMime) {
    sourceBase64 = post.ogImageBase64;
  } else if (post.coverImageBase64 && post.coverImageMime) {
    sourceBase64 = post.coverImageBase64;
    positionY = post.coverImagePositionY;
  } else {
    sourceBase64 = getDefaultBlogCoverImage().base64;
  }

  return renderBlogOgImage(sourceBase64, positionY);
}

export async function isBlogSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (!existing) return true;
  return excludeId ? existing.id === excludeId : false;
}

export async function suggestBlogSlug(title: string, excludeId?: string) {
  const base = slugifyTitle(title) || "post";
  let candidate = base;
  let suffix = 2;

  while (!(await isBlogSlugAvailable(candidate, excludeId))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function createBlogPost(
  input: unknown,
  authorEmail: string
) {
  const data = blogPostInputSchema.parse(input);
  const contentHtml = prepareContentHtml(data.contentHtml);
  const cover = prepareImageField(data.coverImage, "Cover image");
  const og = prepareImageField(data.ogImage, "OG image");

  const available = await isBlogSlugAvailable(data.slug);
  if (!available) {
    throw new Error("Slug is already in use");
  }

  return prisma.blogPost.create({
    data: {
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      contentHtml,
      coverImageBase64: cover.base64,
      coverImageMime: cover.mime,
      coverImagePositionY: data.coverImagePositionY,
      ogImageBase64: og.base64,
      ogImageMime: og.mime,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      metaKeywords: data.metaKeywords,
      canonicalPath: data.canonicalPath,
      noIndex: data.noIndex,
      status: data.status,
      publishedAt: buildPublishedAt(data.status),
      authorEmail,
    },
  });
}

export async function updateBlogPost(id: string, input: unknown) {
  const parsedId = blogPostIdSchema.parse(id);
  const existing = await prisma.blogPost.findUnique({ where: { id: parsedId } });
  if (!existing) {
    throw new Error("Blog post not found");
  }

  const data = blogPostInputSchema.parse(input);
  const contentHtml = prepareContentHtml(data.contentHtml);
  const cover = prepareImageField(data.coverImage, "Cover image");
  const og = prepareImageField(data.ogImage, "OG image");

  const available = await isBlogSlugAvailable(data.slug, parsedId);
  if (!available) {
    throw new Error("Slug is already in use");
  }

  return prisma.blogPost.update({
    where: { id: parsedId },
    data: {
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      contentHtml,
      coverImageBase64: cover.base64,
      coverImageMime: cover.mime,
      coverImagePositionY: data.coverImagePositionY,
      ogImageBase64: og.base64,
      ogImageMime: og.mime,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      metaKeywords: data.metaKeywords,
      canonicalPath: data.canonicalPath,
      noIndex: data.noIndex,
      status: data.status,
      publishedAt: buildPublishedAt(data.status, existing.publishedAt),
    },
  });
}

export async function deleteBlogPost(id: string) {
  const parsedId = blogPostIdSchema.parse(id);
  const existing = await prisma.blogPost.findUnique({ where: { id: parsedId } });
  if (!existing) {
    throw new Error("Blog post not found");
  }
  await prisma.blogPost.delete({ where: { id: parsedId } });
}

export async function publishBlogPost(id: string) {
  const parsedId = blogPostIdSchema.parse(id);
  const existing = await prisma.blogPost.findUnique({ where: { id: parsedId } });
  if (!existing) {
    throw new Error("Blog post not found");
  }

  return prisma.blogPost.update({
    where: { id: parsedId },
    data: {
      status: BlogPostStatus.PUBLISHED,
      publishedAt: existing.publishedAt ?? new Date(),
    },
  });
}

export async function unpublishBlogPost(id: string) {
  const parsedId = blogPostIdSchema.parse(id);
  const existing = await prisma.blogPost.findUnique({ where: { id: parsedId } });
  if (!existing) {
    throw new Error("Blog post not found");
  }

  return prisma.blogPost.update({
    where: { id: parsedId },
    data: {
      status: BlogPostStatus.DRAFT,
    },
  });
}
