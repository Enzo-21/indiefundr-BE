import Link from "next/link";
import { fetchBlogPosts } from "@/actions/admin/blog";
import { BlogPostsTable } from "@/components/admin/blog/BlogPostsTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const result = await fetchBlogPosts();

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error.msg}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
          <p className="text-sm text-muted-foreground">
            Manage marketing articles and SEO pages.
          </p>
        </div>
        <Link href="/admin/blog/new" className={cn(buttonVariants())}>
          New post
        </Link>
      </div>

      <BlogPostsTable posts={result.data} />
    </div>
  );
}
