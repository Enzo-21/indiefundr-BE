import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BLOG_COVER_MIME,
  DEFAULT_BLOG_COVER_PUBLIC_PATH,
} from "./defaultBlogImage";
import { getDefaultBlogCoverImage } from "./defaultBlogCoverImage.server";

describe("defaultBlogImage", () => {
  it("exposes the invite promo asset path", () => {
    assert.equal(
      DEFAULT_BLOG_COVER_PUBLIC_PATH,
      "/images/invite-earn-promo-bg.png"
    );
  });

  it("loads the default cover image from public assets", () => {
    const image = getDefaultBlogCoverImage();
    assert.equal(image.mime, DEFAULT_BLOG_COVER_MIME);
    assert.ok(image.base64.length > 0);
  });
});
