// frontend/src/components/RichTextEditor.jsx
import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

/**
 * Strict allowlist sanitizer matching PATHCARE_CONTEXT.md §6.4
 * Allowed tags: b, i, em, strong, u, p, br, ul, ol, li, h4
 * Allowed attributes: NONE
 */
export function sanitizeAllowlistHtml(html) {
  if (!html) return '';

  const ALLOWED_TAGS = new Set([
    'b', 'i', 'em', 'strong', 'u',
    'p', 'br', 'ul', 'ol', 'li', 'h4'
  ]);

  if (typeof window === 'undefined' || !window.DOMParser) {
    // Basic regex fallback if DOMParser is unavailable (e.g. strict SSR)
    return html.replace(/<(?!\/?(b|i|em|strong|u|p|br|ul|ol|li|h4)\b)[^>]*>/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild || doc.body;

  // Pass 1: Strip ALL attributes from every element in the tree
  const allElements = Array.from(container.querySelectorAll('*'));
  for (const el of allElements) {
    while (el.attributes.length > 0) {
      el.removeAttribute(el.attributes[0].name);
    }
  }

  // Pass 2: Remove dangerous tags and unwrap disallowed tags
  for (const el of Array.from(container.querySelectorAll('*'))) {
    if (!el.parentNode) continue;
    const tagName = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      if (['script', 'style', 'iframe', 'object', 'embed'].includes(tagName)) {
        el.remove();
      } else {
        el.replaceWith(...el.childNodes);
      }
    }
  }

  return container.innerHTML;
}

export function RichTextEditor({ value = '', onChange, placeholder: _placeholder = 'Write plain-language summary for the patient...' }) {
  const handleUpdate = useCallback(
    ({ editor }) => {
      const rawHtml = editor.getHTML();
      const sanitized = sanitizeAllowlistHtml(rawHtml);
      if (onChange) {
        onChange(sanitized);
      }
    },
    [onChange]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [4], // strictly H4 per CONTEXT §6.4 allowlist
        },
        codeBlock: false,
        blockquote: false,
        code: false,
        horizontalRule: false,
        strike: false,
        underline: false,
      }),
      Underline,
    ],
    content: value,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'min-h-[140px] p-3 text-[13.5px] leading-relaxed outline-none focus:outline-none rta',
        'data-testid': 'rte-content-area',
      },
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white rte" data-testid="rich-text-editor">
      {/* Prototype-style Toolbar (.rtb) */}
      <div className="flex items-center gap-1 p-2 bg-[#FAFBFD] border-b border-border flex-wrap rtb">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-testid="rte-bold-btn"
          className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
            editor.isActive('bold') ? 'bg-blue100 text-blue700' : 'text-muted hover:bg-gray-100 hover:text-ink'
          }`}
          title="Bold"
        >
          <b>B</b>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-testid="rte-italic-btn"
          className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
            editor.isActive('italic') ? 'bg-blue100 text-blue700' : 'text-muted hover:bg-gray-100 hover:text-ink'
          }`}
          title="Italic"
        >
          <i>I</i>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-testid="rte-underline-btn"
          className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
            editor.isActive('underline') ? 'bg-blue100 text-blue700' : 'text-muted hover:bg-gray-100 hover:text-ink'
          }`}
          title="Underline"
        >
          <u>U</u>
        </button>

        <div className="w-[1px] h-4 bg-border mx-1" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-testid="rte-bullet-btn"
          className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
            editor.isActive('bulletList') ? 'bg-blue100 text-blue700' : 'text-muted hover:bg-gray-100 hover:text-ink'
          }`}
          title="Bullet list"
        >
          • List
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          data-testid="rte-h4-btn"
          className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
            editor.isActive('heading', { level: 4 }) ? 'bg-blue100 text-blue700' : 'text-muted hover:bg-gray-100 hover:text-ink'
          }`}
          title="Clinical heading (H4)"
        >
          Heading
        </button>
      </div>

      {/* Editor Content Area */}
      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextEditor;
