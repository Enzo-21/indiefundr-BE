import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BlogPostStatus } from "@/lib/blog/blogPostStatus";
import { blogPostInputSchema } from "@/lib/validators/blog";

describe("blogPostInputSchema", () => {
  it("accepts a valid blog post payload", () => {
    const result = blogPostInputSchema.safeParse({
      title: "Install on Xiaomi",
      slug: "install-on-xiaomi",
      excerpt: "A short guide",
      contentHtml: "<p>Step one</p>",
      coverImage: {
        base64: "data:image/png;base64,aaaa",
        mime: "image/png",
      },
      coverImagePositionY: 35,
      ogImage: null,
      metaTitle: "Install IndieFundr on Xiaomi",
      metaDescription: "HyperOS and Chrome steps",
      metaKeywords: "xiaomi,pwa,chrome",
      canonicalPath: "/blog/install-on-xiaomi",
      noIndex: false,
      status: BlogPostStatus.DRAFT,
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.coverImagePositionY, 35);
    }
  });

  it("rejects invalid slugs", () => {
    const result = blogPostInputSchema.safeParse({
      title: "Bad slug",
      slug: "Bad Slug",
      contentHtml: "<p>Hi</p>",
      status: BlogPostStatus.DRAFT,
    });

    assert.equal(result.success, false);
  });
});
