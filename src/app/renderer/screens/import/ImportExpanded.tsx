import { useMemo } from 'react';
import type { ImportItem, ImportPatch, ImportReview } from '../../../shared/index';
import { PreviewFrame } from '../../components/index';
import { ImportItemEditor } from './ImportItemEditor';
import styles from './ImportExpanded.module.css';
export function ImportExpanded({
  item,
  assets,
  disabled,
  update,
  onReady,
}: {
  item: ImportItem;
  assets: ImportReview['assets'];
  disabled: boolean;
  update: (patch: Omit<ImportPatch, 'index'>) => void;
  onReady: () => void;
}) {
  const detail = useMemo(() => ({ question: item.draft, assets }), [item.draft, assets]);
  return (
    <div className={styles.expanded}>
      <div className={styles.preview}>
        <PreviewFrame detail={detail} onReady={onReady} />
      </div>
      <ImportItemEditor item={item} disabled={disabled} update={update} />
    </div>
  );
}
