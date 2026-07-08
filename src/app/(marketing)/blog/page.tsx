import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { MarketingContentProvider } from "@/components/marketing/marketing-content-provider";
import { buildSiteContent } from "@/lib/content";
import { createSiteMetadata } from "@/lib/marketing/metadata";
import { listPublishedBlogPosts } from "@/services/blog/blogPosts";

export const metadata: Metadata = createSiteMetadata({
  title: "Blog",
  description: "Guides, updates, and product help from IndieFundr.",
  alternates: {
    canonical: "/blog",
  },
});

export default async function BlogIndexPage() {
  const posts = await listPublishedBlogPosts();
  const content = buildSiteContent();

  return (
    <MarketingContentProvider content={content}>
      <div className="flex min-h-full w-full min-w-0 flex-col">
        <Header />
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">Blog</h1>
            <p className="text-muted-foreground max-w-2xl text-lg">
              Guides, updates, and product help from the IndieFundr team.
            </p>
          </div>

          {posts.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed px-6 py-12 text-center">
              No articles published yet.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {posts.map((post) => (
                <BlogPostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </main>
        <Footer />
      </div>
    </MarketingContentProvider>
  );
}
