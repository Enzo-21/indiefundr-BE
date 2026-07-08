import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidBlogSlug, slugifyTitle } from "./slug";

describe("blog slug helpers", () => {
  it("slugifies titles with accents and punctuation", () => {
    assert.equal(
      slugifyTitle("Cómo instalar IndieFundr en Xiaomi / Redmi"),
      "como-instalar-indiefundr-en-xiaomi-redmi"
    );
  });

  it("validates slug format", () => {
    assert.equal(isValidBlogSlug("instalar-indiefundr-xiaomi"), true);
    assert.equal(isValidBlogSlug("Invalid_Slug"), false);
    assert.equal(isValidBlogSlug("slug--with--double"), false);
  });
});
