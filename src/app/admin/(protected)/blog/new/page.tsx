import { BlogPostForm } from "@/components/admin/blog/BlogPostForm";

export default function AdminBlogNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New blog post</h1>
        <p className="text-sm text-muted-foreground">
          Create a draft or publish immediately.
        </p>
      </div>
      <BlogPostForm mode="create" />
    </div>
  );
}
