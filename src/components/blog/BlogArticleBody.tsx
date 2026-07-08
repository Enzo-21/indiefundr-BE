import { sanitizeBlogHtml } from "@/lib/blog/sanitizeBlogHtml";

type BlogArticleBodyProps = {
  html: string;
};

export function BlogArticleBody({ html }: BlogArticleBodyProps) {
  const safeHtml = sanitizeBlogHtml(html);

  return (
    <article
      className="blog-prose max-w-none text-base leading-7"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
