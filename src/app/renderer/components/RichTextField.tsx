import { useEffect, useId, useRef, useState } from 'react';
import { Underline, Bold, Italic, Superscript, Subscript } from 'lucide-react';
import type { Block } from '../../../contracts/index';
import { blocksToEditor, editorHtml, editorToBlocks, replaceParagraphs } from '../lib/rich-text/index';
import type { EditorNode } from '../lib/rich-text/index';
import styles from './RichTextField.module.css';

const formats = [
  { name: 'underline', label: '밑줄', shortcut: 'Ctrl+U', icon: Underline },
  { name: 'bold', label: '굵게', shortcut: 'Ctrl+B', icon: Bold },
  { name: 'italic', label: '기울임', shortcut: 'Ctrl+I', icon: Italic },
  { name: 'superscript', label: '위첨자', shortcut: 'Ctrl+Shift+=', icon: Superscript },
  { name: 'subscript', label: '아래첨자', shortcut: 'Ctrl+=', icon: Subscript },
] as const;

function readNodes(node: Node): EditorNode[] {
  return Array.from(node.childNodes).flatMap((child): EditorNode[] => {
    if (child.nodeType === Node.TEXT_NODE) return [{ text: child.textContent ?? '' }];
    if (child instanceof HTMLElement)
      return [{ tag: child.tagName.toLowerCase(), children: readNodes(child) }];
    return [];
  });
}
export function RichTextField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: Block[];
  onChange: (blocks: Block[]) => void;
  id?: string;
}) {
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const generated = useId();
  const fieldId = id ?? generated;
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef('');
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (ref.current && serialized !== emitted.current)
      ref.current.innerHTML = editorHtml(blocksToEditor(value));
  }, [serialized, value]);
  useEffect(() => {
    const selectionChanged = () => {
      if (!ref.current?.contains(document.getSelection()?.anchorNode ?? null)) return;
      setPressed(Object.fromEntries(formats.map(({ name }) => [name, document.queryCommandState(name)])));
    };
    document.addEventListener('selectionchange', selectionChanged);
    return () => document.removeEventListener('selectionchange', selectionChanged);
  }, []);
  const change = () => {
    if (!ref.current) return;
    const paragraphs = editorToBlocks(readNodes(ref.current));
    const blocks = replaceParagraphs(value, paragraphs);
    emitted.current = JSON.stringify(blocks);
    onChange(blocks);
  };
  const command = (name: string) => {
    ref.current?.focus();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(name);
    setPressed(
      Object.fromEntries(formats.map(({ name: format }) => [format, document.queryCommandState(format)])),
    );
    change();
  };
  return (
    <div className={styles.field}>
      <span id={`${fieldId}-label`}>{label}</span>
      <div className={styles.toolbar} role="toolbar" aria-label={`${label} 서식`}>
        {formats.map(({ name, label: title, shortcut, icon: Icon }) => (
          <button
            key={name}
            type="button"
            aria-label={title}
            title={`${title} (${shortcut})`}
            aria-pressed={pressed[name] ?? false}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(name)}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        id={fieldId}
        className={styles.input}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${fieldId}-label`}
        onInput={change}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && ['u', 'b', 'i'].includes(event.key.toLowerCase())) {
            event.preventDefault();
            command(
              ({ u: 'underline', b: 'bold', i: 'italic' } as Record<string, string>)[
                event.key.toLowerCase()
              ]!,
            );
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            (event.code === 'Equal' || event.key === '=' || event.key === '+')
          ) {
            event.preventDefault();
            command(event.shiftKey ? 'superscript' : 'subscript');
          }
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault();
            document.execCommand('insertText', false, '\n');
            change();
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
          change();
        }}
      />
    </div>
  );
}
