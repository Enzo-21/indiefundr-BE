"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  createBlogPost,
  deleteBlogPost,
  getBlogPostByIdForAdmin,
  listBlogPostsForAdmin,
  publishBlogPost,
  suggestBlogSlug,
  unpublishBlogPost,
  updateBlogPost,
} from "@/services/blog/blogPosts";

export async function fetchBlogPosts() {
  return withAdminAction(() => listBlogPostsForAdmin());
}

export async function fetchBlogPost(id: string) {
  return withAdminAction(() => getBlogPostByIdForAdmin(id));
}

export async function suggestBlogPostSlug(title: string, excludeId?: string) {
  return withAdminAction(() => suggestBlogSlug(title, excludeId));
}

export async function createBlogPostAction(input: unknown) {
  return withAdminAction(({ createdBy }) =>
    createBlogPost(input, createdBy)
  );
}

export async function updateBlogPostAction(id: string, input: unknown) {
  return withAdminAction(() => updateBlogPost(id, input));
}

export async function deleteBlogPostAction(id: string) {
  return withAdminAction(() => deleteBlogPost(id));
}

export async function publishBlogPostAction(id: string) {
  return withAdminAction(() => publishBlogPost(id));
}

export async function unpublishBlogPostAction(id: string) {
  return withAdminAction(() => unpublishBlogPost(id));
}
