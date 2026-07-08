import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeBlogHtml } from "./sanitizeBlogHtml";

describe("sanitizeBlogHtml", () => {
  it("keeps allowed formatting tags", () => {
    const html = "<h2>Title</h2><p>Hello <strong>world</strong></p>";
    assert.equal(sanitizeBlogHtml(html), html);
  });

  it("strips scripts and unsafe attributes", () => {
    const html =
      '<p onclick="alert(1)">Hi</p><script>alert("xss")</script><img src="javascript:alert(1)" />';
    const sanitized = sanitizeBlogHtml(html);
    assert.match(sanitized, /<p>Hi<\/p>/);
    assert.doesNotMatch(sanitized, /script/i);
    assert.doesNotMatch(sanitized, /onclick/i);
  });

  it("allows base64 images", () => {
    const html =
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="cover" />';
    assert.equal(sanitizeBlogHtml(html), html);
  });
});
