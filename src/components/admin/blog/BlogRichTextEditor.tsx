"use client";

import { useEffect } from "react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { BlogImageUploadButton } from "@/components/admin/blog/BlogImageUploadButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BlogRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
};

const EDITOR_CONTENT_CLASS =
  "blog-prose max-w-none min-h-70 px-4 py-3 focus:outline-hidden";

export function BlogRichTextEditor({
  value,
  onChange,
  className,
}: BlogRichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: "Write your article…",
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class: EDITOR_CONTENT_CLASS,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <div className="bg-muted/40 flex flex-wrap gap-1 border-b p-2">
        <Button
          type="button"
          variant={editor?.isActive("bold") ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor?.isActive("italic") ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor?.isActive("heading", { level: 2 }) ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor?.isActive("heading", { level: 3 }) ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor?.isActive("bulletList") ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor?.isActive("orderedList") ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor?.isActive("blockquote") ? "secondary" : "outline"}
          size="sm"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={setLink}>
          <Link2 className="size-4" />
        </Button>
        <BlogImageUploadButton editor={editor} />
      </div>
      <EditorContent editor={editor} className="blog-editor" />
    </div>
  );
}
