import Link from "next/link";
import type { BlogPostSummary } from "@/services/blog/blogPosts";
import { coverObjectPosition } from "@/lib/blog/coverImage";
import { getBlogCoverImageUrl } from "@/lib/blog/metadata";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type BlogPostCardProps = {
  post: BlogPostSummary;
};

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(value);
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="overflow-hidden pt-0 transition-shadow duration-300 group-hover:shadow-md">
        <div className="bg-muted aspect-video w-full overflow-hidden">
          <img
            src={getBlogCoverImageUrl(post.id)}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            style={{ objectPosition: coverObjectPosition(post.coverImagePositionY) }}
          />
        </div>
        <CardHeader>
          <CardTitle className="text-xl group-hover:underline">{post.title}</CardTitle>
          {post.publishedAt ? (
            <CardDescription>{formatDate(post.publishedAt)}</CardDescription>
          ) : null}
        </CardHeader>
        {post.excerpt ? (
          <CardContent>
            <p className="text-muted-foreground text-sm leading-6">{post.excerpt}</p>
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}
