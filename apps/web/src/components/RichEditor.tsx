import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorText } from '../lib/api';
import { cx } from './ui';

function ToolButton({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        'rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700',
        active && 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, uploadPath }: { editor: Editor; uploadPath: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const i = 'h-4 w-4';

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Adresse du lien (vide pour retirer)', prev ?? 'https://');
    if (href === null) return;
    if (href === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(uploadPath, file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (e) {
      window.alert(errorText(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800/60">
      <ToolButton title="Titre" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className={i} />
      </ToolButton>
      <ToolButton title="Sous-titre" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className={i} />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-600" />
      <ToolButton title="Gras" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className={i} />
      </ToolButton>
      <ToolButton title="Italique" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className={i} />
      </ToolButton>
      <ToolButton title="Barré" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className={i} />
      </ToolButton>
      <ToolButton title="Lien" active={editor.isActive('link')} onClick={setLink}>
        <Link2 className={i} />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-600" />
      <ToolButton title="Liste à puces" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className={i} />
      </ToolButton>
      <ToolButton title="Liste numérotée" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className={i} />
      </ToolButton>
      <ToolButton title="Citation" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className={i} />
      </ToolButton>
      <ToolButton title="Séparateur" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className={i} />
      </ToolButton>
      <ToolButton title={uploading ? 'Envoi…' : 'Image'} onClick={() => fileRef.current?.click()}>
        <ImagePlus className={cx(i, uploading && 'animate-pulse')} />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-600" />
      <ToolButton title="Annuler" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className={i} />
      </ToolButton>
      <ToolButton title="Rétablir" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className={i} />
      </ToolButton>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  );
}

export function RichEditor({
  value,
  onChange,
  uploadPath = 'admin/site/upload',
}: {
  value: string;
  onChange: (html: string) => void;
  uploadPath?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false, autolink: true }), Image],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Contenu chargé après coup (ex. ouverture d'une page existante).
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value, false);
  }, [editor, value]);

  if (!editor) return null;
  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-accent dark:bg-slate-900 dark:ring-slate-700">
      <Toolbar editor={editor} uploadPath={uploadPath} />
      <EditorContent editor={editor} className="prose-cms" />
    </div>
  );
}
