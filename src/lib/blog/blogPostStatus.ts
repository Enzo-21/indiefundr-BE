export const BLOG_POST_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export type BlogPostStatusValue = (typeof BLOG_POST_STATUSES)[number];

export const BlogPostStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const satisfies Record<BlogPostStatusValue, BlogPostStatusValue>;
