import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import { MarketingContentProvider } from "@/components/marketing/marketing-content-provider";
import { buildSiteContent } from "@/lib/content";
import {
  createBlogPostMetadata,
  getBlogCoverImageUrl,
} from "@/lib/blog/metadata";
import { coverObjectPosition } from "@/lib/blog/coverImage";
import { getPublishedBlogPostBySlug } from "@/services/blog/blogPosts";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);
  if (!post) {
    return { title: "Article not found" };
  }
  return createBlogPostMetadata(post);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const content = buildSiteContent();
  const publishedLabel = post.publishedAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(post.publishedAt)
    : null;

  return (
    <MarketingContentProvider content={content}>
      <div className="flex min-h-full w-full min-w-0 flex-col">
        <Header />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <div className="space-y-4">
            <Link href="/blog" className="text-primary text-sm font-medium hover:underline">
              ← Back to blog
            </Link>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight">{post.title}</h1>
              {publishedLabel ? (
                <p className="text-muted-foreground text-sm">{publishedLabel}</p>
              ) : null}
              {post.excerpt ? (
                <p className="text-muted-foreground text-lg leading-7">{post.excerpt}</p>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border">
            <img
              src={getBlogCoverImageUrl(post.id)}
              alt={post.title}
              className="aspect-video w-full object-cover"
              style={{ objectPosition: coverObjectPosition(post.coverImagePositionY) }}
            />
          </div>

          <BlogArticleBody html={post.contentHtml} />
        </main>
        <Footer />
      </div>
    </MarketingContentProvider>
  );
}
