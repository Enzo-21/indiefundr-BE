import { z } from "zod";
import { BlogPostStatus, BLOG_POST_STATUSES } from "@/lib/blog/blogPostStatus";
import { DEFAULT_COVER_POSITION_Y } from "@/lib/blog/coverImage";
import { isValidBlogSlug } from "@/lib/blog/slug";

const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 500;
const MAX_META_TITLE_LENGTH = 70;
const MAX_META_DESCRIPTION_LENGTH = 160;
const MAX_META_KEYWORDS_LENGTH = 255;
const MAX_CONTENT_HTML_BYTES = 8 * 1024 * 1024;

const imageFieldSchema = z
  .object({
    base64: z.string().min(1),
    mime: z.string().regex(/^image\//),
  })
  .optional()
  .nullable();

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .refine(isValidBlogSlug, {
    message: "Slug must use lowercase letters, numbers, and hyphens only",
  });

export const blogPostInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  slug: slugSchema,
  excerpt: z
    .string()
    .trim()
    .max(MAX_EXCERPT_LENGTH)
    .optional()
    .nullable()
    .transform((value) => value || null),
  contentHtml: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_CONTENT_HTML_BYTES, {
      message: "Article content is too large",
    }),
  coverImage: imageFieldSchema,
  coverImagePositionY: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(DEFAULT_COVER_POSITION_Y),
  ogImage: imageFieldSchema,
  metaTitle: z
    .string()
    .trim()
    .max(MAX_META_TITLE_LENGTH)
    .optional()
    .nullable()
    .transform((value) => value || null),
  metaDescription: z
    .string()
    .trim()
    .max(MAX_META_DESCRIPTION_LENGTH)
    .optional()
    .nullable()
    .transform((value) => value || null),
  metaKeywords: z
    .string()
    .trim()
    .max(MAX_META_KEYWORDS_LENGTH)
    .optional()
    .nullable()
    .transform((value) => value || null),
  canonicalPath: z
    .string()
    .trim()
    .regex(/^\/[a-z0-9\-\/]*$/i)
    .optional()
    .nullable()
    .transform((value) => value || null),
  noIndex: z.boolean().default(false),
  status: z.enum(BLOG_POST_STATUSES).default(BlogPostStatus.DRAFT),
});

export type BlogPostInput = z.infer<typeof blogPostInputSchema>;

export const blogPostIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
