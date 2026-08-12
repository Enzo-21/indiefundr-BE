"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type BlogPost } from "@prisma/client";
import { toast } from "sonner";
import {
  createBlogPostAction,
  suggestBlogPostSlug,
  updateBlogPostAction,
} from "@/actions/admin/blog";
import { BlogCoverImageEditor } from "@/components/admin/blog/BlogCoverImageEditor";
import { BlogCoverImageField } from "@/components/admin/blog/BlogCoverImageField";
import { BlogRichTextEditor } from "@/components/admin/blog/BlogRichTextEditor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BlogPostStatus, type BlogPostStatusValue } from "@/lib/blog/blogPostStatus";
import { DEFAULT_COVER_POSITION_Y } from "@/lib/blog/coverImage";
import { DEFAULT_BLOG_COVER_PUBLIC_PATH } from "@/lib/blog/defaultBlogImage";
import { toDataUrl } from "@/lib/blog/imageBase64";

type ImageValue = { base64: string; mime: string } | null;

type BlogPostFormProps = {
  mode: "create" | "edit";
  post?: BlogPost;
};

export function BlogPostForm({ mode, post }: BlogPostFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post?.slug));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [contentHtml, setContentHtml] = useState(post?.contentHtml ?? "<p></p>");
  const [coverImage, setCoverImage] = useState<ImageValue>(
    post?.coverImageBase64 && post.coverImageMime
      ? { base64: toDataUrl(post.coverImageMime, post.coverImageBase64), mime: post.coverImageMime }
      : null
  );
  const [coverImagePositionY, setCoverImagePositionY] = useState(
    post?.coverImagePositionY ?? DEFAULT_COVER_POSITION_Y
  );
  const [ogImage, setOgImage] = useState<ImageValue>(
    post?.ogImageBase64 && post.ogImageMime
      ? { base64: toDataUrl(post.ogImageMime, post.ogImageBase64), mime: post.ogImageMime }
      : null
  );
  const [metaTitle, setMetaTitle] = useState(post?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? "");
  const [metaKeywords, setMetaKeywords] = useState(post?.metaKeywords ?? "");
  const [canonicalPath, setCanonicalPath] = useState(post?.canonicalPath ?? "");
  const [noIndex, setNoIndex] = useState(post?.noIndex ?? false);
  const [status, setStatus] = useState<BlogPostStatusValue>(
    post?.status ?? BlogPostStatus.DRAFT
  );

  const ogPreview =
    ogImage?.base64 ?? coverImage?.base64 ?? DEFAULT_BLOG_COVER_PUBLIC_PATH;
  const ogPreviewPositionY = ogImage
    ? DEFAULT_COVER_POSITION_Y
    : coverImagePositionY;

  const payload = useMemo(
    () => ({
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      contentHtml,
      coverImage,
      coverImagePositionY,
      ogImage,
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      metaKeywords: metaKeywords.trim() || null,
      canonicalPath: canonicalPath.trim() || null,
      noIndex,
      status,
    }),
    [
      title,
      slug,
      excerpt,
      contentHtml,
      coverImage,
      coverImagePositionY,
      ogImage,
      metaTitle,
      metaDescription,
      metaKeywords,
      canonicalPath,
      noIndex,
      status,
    ]
  );

  async function handleSuggestSlug() {
    const result = await suggestBlogPostSlug(
      title.trim() || "post",
      post?.id
    );
    if (!result.ok) {
      toast.error(result.error.msg);
      return;
    }
    setSlug(result.data);
  }

  function handleTitleBlur() {
    if (slugTouched || !title.trim()) return;
    void suggestBlogPostSlug(title.trim()).then((result) => {
      if (result.ok) {
        setSlug(result.data);
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result =
          mode === "create"
            ? await createBlogPostAction(payload)
            : await updateBlogPostAction(post!.id, payload);

        if (!result.ok) {
          toast.error(result.error.msg ?? "Failed to save post");
          return;
        }

        if (mode === "create" && result.data.slug !== payload.slug.trim()) {
          toast.info(
            `Slug adjusted to "${result.data.slug}" because the original was taken.`
          );
        }

        const published = result.data.status === BlogPostStatus.PUBLISHED;
        if (mode === "create") {
          toast.success(published ? "Post published" : "Post created");
          router.push("/admin/blog");
          router.refresh();
          return;
        }

        toast.success(published ? "Post published" : "Post updated");
        router.refresh();
      } catch {
        toast.error("Failed to save post. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Article</CardTitle>
          <CardDescription>Title, slug, excerpt, and body content.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={handleTitleBlur}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                  required
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void handleSuggestSlug()}>
                Suggest
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Public URL: /blog/{slug || "your-slug"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              rows={3}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <BlogRichTextEditor value={contentHtml} onChange={setContentHtml} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>Cover and optional Open Graph image (stored as base64 in MongoDB).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <BlogCoverImageEditor
            image={coverImage}
            positionY={coverImagePositionY}
            onImageChange={setCoverImage}
            onPositionYChange={setCoverImagePositionY}
          />
          <BlogCoverImageField
            label="OG image"
            previewUrl={ogPreview}
            previewPositionY={ogPreviewPositionY}
            onChange={setOgImage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
          <CardDescription>Search and social metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metaTitle">Meta title</Label>
            <Input
              id="metaTitle"
              value={metaTitle}
              onChange={(event) => setMetaTitle(event.target.value)}
              placeholder={title || "Defaults to article title"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaDescription">Meta description</Label>
            <textarea
              id="metaDescription"
              value={metaDescription}
              onChange={(event) => setMetaDescription(event.target.value)}
              rows={3}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaKeywords">Meta keywords</Label>
            <Input
              id="metaKeywords"
              value={metaKeywords}
              onChange={(event) => setMetaKeywords(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="canonicalPath">Canonical path</Label>
            <Input
              id="canonicalPath"
              value={canonicalPath}
              onChange={(event) => setCanonicalPath(event.target.value)}
              placeholder={`/blog/${slug || "your-slug"}`}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <p className="text-sm font-medium">No index</p>
              <p className="text-muted-foreground text-xs">
                Prevent search engines from indexing this article.
              </p>
            </div>
            <Switch checked={noIndex} onCheckedChange={setNoIndex} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publishing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as BlogPostStatusValue)
              }
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value={BlogPostStatus.DRAFT}>Draft</option>
              <option value={BlogPostStatus.PUBLISHED}>Published</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create post" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/admin/blog")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
