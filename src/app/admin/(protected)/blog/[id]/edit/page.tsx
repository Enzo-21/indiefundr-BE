import { notFound } from "next/navigation";
import { fetchBlogPost } from "@/actions/admin/blog";
import { BlogPostForm } from "@/components/admin/blog/BlogPostForm";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

type AdminBlogEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminBlogEditPage({ params }: AdminBlogEditPageProps) {
  const { id } = await params;
  const result = await fetchBlogPost(id);

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error.msg}</AlertDescription>
      </Alert>
    );
  }

  if (!result.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit blog post</h1>
        <p className="text-sm text-muted-foreground">{result.data.title}</p>
      </div>
      <BlogPostForm mode="edit" post={result.data} />
    </div>
  );
}
