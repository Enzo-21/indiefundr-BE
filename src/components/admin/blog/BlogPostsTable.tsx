"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BlogPostStatus } from "@/lib/blog/blogPostStatus";
import { toast } from "sonner";
import {
  deleteBlogPostAction,
  publishBlogPostAction,
  unpublishBlogPostAction,
} from "@/actions/admin/blog";
import type { BlogPostSummary } from "@/services/blog/blogPosts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type BlogPostsTableProps = {
  posts: BlogPostSummary[];
};

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function BlogPostsTable({ posts }: BlogPostsTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runAction(action: () => Promise<{ ok: boolean; error?: { msg: string } }>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error?.msg ?? "Action failed");
          return;
        }
        toast.success(success);
        router.refresh();
      } catch {
        toast.error("Action failed. Please try again.");
      }
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No posts yet.
              </TableCell>
            </TableRow>
          ) : (
            posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell className="font-medium">{post.title}</TableCell>
                <TableCell>{post.slug}</TableCell>
                <TableCell>
                  <Badge variant={post.status === BlogPostStatus.PUBLISHED ? "default" : "outline"}>
                    {post.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(post.publishedAt)}</TableCell>
                <TableCell>{formatDate(post.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/blog/${post.id}/edit`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Edit
                    </Link>
                    {post.status === BlogPostStatus.PUBLISHED ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          runAction(
                            () => unpublishBlogPostAction(post.id),
                            "Post unpublished"
                          )
                        }
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          runAction(
                            () => publishBlogPostAction(post.id),
                            "Post published"
                          )
                        }
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Delete "${post.title}"?`)) return;
                        runAction(
                          () => deleteBlogPostAction(post.id),
                          "Post deleted"
                        );
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
