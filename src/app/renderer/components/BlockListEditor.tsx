import { useRef, useState } from 'react';
import type { AssetData, Block } from '../../../contracts/index';
import { RichTextField } from './RichTextField';
import { Button } from './Button';
import { unwrap } from '../lib/index';
import styles from './BlockListEditor.module.css';

export function BlockListEditor({
  label,
  value,
  onChange,
  onAsset,
  id,
}: {
  id?: string;
  label: string;
  value: Block[];
  onChange: (blocks: Block[]) => void;
  onAsset: (asset: AssetData) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef(value);
  current.current = value;
  const pending = useRef(false);
  const update = (index: number, block: Block) => onChange(value.map((b, i) => (i === index ? block : b)));
  const addImage = async (file: File) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const mime = file.type || (/\.bmp$/iu.test(file.name) ? 'image/bmp' : '');
      if (file.size > 10 * 1024 * 1024) throw new Error('이미지는 10MB 이하로 선택하세요.');
      const asset = await unwrap(
        window.qb.assets.add({ bytes: new Uint8Array(await file.arrayBuffer()), mime }),
      );
      onAsset(asset);
      onChange([...current.current, { type: 'image', assetId: asset.id, alt: file.name }]);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      id={id}
      tabIndex={-1}
      className={styles.editor}
      aria-label={label}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        const file = Array.from(event.dataTransfer.files).find(
          (item) => item.type.startsWith('image/') || /\.bmp$/iu.test(item.name),
        );
        if (file) void addImage(file);
      }}
      onPasteCapture={(event) => {
        const file = Array.from(event.clipboardData.items)
          .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
          ?.getAsFile();
        if (file) {
          event.preventDefault();
          event.stopPropagation();
          void addImage(file);
        }
      }}
    >
      <h3>{label}</h3>
      {!value.length && <p>내용이 없습니다. 문단·보기·표·이미지를 추가하세요.</p>}
      {value.map((block, index) => (
        <div key={index} className={styles.block}>
          <div className={styles.actions}>
            <span>
              {index + 1}.{' '}
              {block.type === 'paragraph' ? '문단' : block.type === 'image' ? '이미지' : '표 / 보기'}
            </span>
            <Button
              disabled={index === 0}
              aria-label={`${label} ${index + 1} 위로`}
              onClick={() => {
                const next = [...value];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                onChange(next);
              }}
            >
              ↑
            </Button>
            <Button
              disabled={index === value.length - 1}
              aria-label={`${label} ${index + 1} 아래로`}
              onClick={() => {
                const next = [...value];
                [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                onChange(next);
              }}
            >
              ↓
            </Button>
            <Button onClick={() => onChange(value.filter((_, i) => i !== index))}>삭제</Button>
          </div>
          {block.type === 'paragraph' ? (
            <RichTextField
              label={`${label} ${index + 1} 문단`}
              value={[block]}
              onChange={(items) => onChange([...value.slice(0, index), ...items, ...value.slice(index + 1)])}
            />
          ) : block.type === 'image' ? (
            <label>
              이미지 설명
              <input
                value={block.alt ?? ''}
                onChange={(e) => update(index, { ...block, alt: e.target.value })}
              />
            </label>
          ) : (
            <>
              <div className={styles.actions}>
                <Button
                  disabled={block.rows.length >= 100}
                  onClick={() =>
                    update(index, { ...block, rows: [...block.rows, block.rows[0]!.map(() => [])] })
                  }
                >
                  행 추가
                </Button>
                <Button
                  disabled={block.rows.length <= 1}
                  onClick={() => update(index, { ...block, rows: block.rows.slice(0, -1) })}
                >
                  마지막 행 삭제
                </Button>
                <Button
                  disabled={block.rows[0]!.length >= 30}
                  onClick={() => update(index, { ...block, rows: block.rows.map((row) => [...row, []]) })}
                >
                  열 추가
                </Button>
                <Button
                  disabled={block.rows[0]!.length <= 1}
                  onClick={() => update(index, { ...block, rows: block.rows.map((row) => row.slice(0, -1)) })}
                >
                  마지막 열 삭제
                </Button>
              </div>
              <table>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c}>
                          <RichTextField
                            label={`${r + 1}행 ${c + 1}열`}
                            value={cell}
                            onChange={(items) =>
                              update(index, {
                                ...block,
                                rows: block.rows.map((a, ri) =>
                                  a.map((b, ci) => (ri === r && ci === c ? items : b)),
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}
      <div className={styles.actions}>
        <Button onClick={() => onChange([...value, { type: 'paragraph', runs: [] }])}>문단 추가</Button>
        <Button onClick={() => onChange([...value, { type: 'table', rows: [[[]]] }])}>보기 상자 추가</Button>
        <Button
          onClick={() =>
            onChange([
              ...value,
              {
                type: 'table',
                rows: [
                  [[], []],
                  [[], []],
                ],
              },
            ])
          }
        >
          표 추가
        </Button>
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          이미지 추가
        </Button>
        <input
          ref={fileInput}
          hidden
          aria-label="이미지 파일 선택"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void addImage(file);
            e.target.value = '';
          }}
        />
      </div>
      <p>이미지는 이 영역에 끌어놓거나 붙여넣을 수 있습니다. PNG·JPG·GIF·WebP·BMP, 10MB 이하.</p>
      {busy && <p role="status">이미지를 확인하고 있습니다…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
