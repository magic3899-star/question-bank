import { useEffect, useId, useRef } from 'react';
import type { Block } from '../../../contracts/index';
import { blocksToEditor, editorHtml, editorToBlocks, replaceParagraphs } from '../lib/rich-text/index';
import type { EditorNode } from '../lib/rich-text/index';
import styles from './RichTextField.module.css';

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
  const generated = useId();
  const fieldId = id ?? generated;
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef('');
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (ref.current && serialized !== emitted.current)
      ref.current.innerHTML = editorHtml(blocksToEditor(value));
  }, [serialized, value]);
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
    change();
  };
  return (
    <div className={styles.field}>
      <span id={`${fieldId}-label`}>{label}</span>
      <div className={styles.toolbar} role="toolbar" aria-label={`${label} 서식`}>
        {(
          [
            ['underline', '밑줄 U'],
            ['bold', '굵게 B'],
            ['italic', '기울임 I'],
            ['superscript', '위첨자'],
            ['subscript', '아래첨자'],
          ] as const
        ).map(([name, title]) => (
          <button
            key={name}
            type="button"
            aria-label={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(name)}
          >
            {title}
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
