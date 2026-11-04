import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ImportAnalyzeProgress,
  ImportCommitResult,
  ImportOptions,
  ImportPatch,
  ImportReview,
} from '../../../shared/index';
import { unwrap } from '../../lib/index';
import { editedReview } from './review';

export function useImport() {
  const [options, setOptions] = useState<ImportOptions>({
    subject: '',
    includeGrades: ['A'],
    requireObjective: true,
    dedupeByPassage: true,
    lockChoicesOnReference: true,
  });
  const [review, setReview] = useState<ImportReview>();
  const [patches, setPatches] = useState<Record<number, ImportPatch>>({});
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ImportAnalyzeProgress>();
  const [saved, setSaved] = useState<{ batchId: string; result: ImportCommitResult }>();
  const batchRef = useRef<string | undefined>(undefined);
  const active = useRef(true);
  const working = useRef(false);
  useEffect(() => window.qb.import.onProgress(setProgress), []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (batchRef.current) void window.qb.import.discard(batchRef.current);
    };
  }, []);
  const edited = useMemo(() => (review ? editedReview(review, patches) : undefined), [review, patches]);
  const analyze = async (paths: string[]) => {
    if (!paths.length || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setProgress(undefined);
    setFiles(paths.map((p) => p.split(/[\\/]/u).at(-1) ?? p));
    try {
      if (batchRef.current) await unwrap(window.qb.import.discard(batchRef.current));
      batchRef.current = undefined;
      setReview(undefined);
      const next = await unwrap(window.qb.import.analyze({ paths, options }));
      if (!active.current) {
        void window.qb.import.discard(next.batchId);
        return;
      }
      batchRef.current = next.batchId;
      setReview(next);
      setPatches({});
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      working.current = false;
      if (active.current) {
        setBusy(false);
        setProgress(undefined);
      }
    }
  };
  const acceptCapture = (next: ImportReview) => {
    batchRef.current = next.batchId;
    setReview(next);
    setPatches({});
  };
  const commit = async () => {
    if (!review || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await unwrap(
        window.qb.import.commit({ batchId: review.batchId, patches: Object.values(patches) }),
      );
      batchRef.current = undefined;
      setSaved({ batchId: review.batchId, result });
      setReview(undefined);
      setPatches({});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const discard = async () => {
    if (working.current) return;
    try {
      if (batchRef.current) await unwrap(window.qb.import.discard(batchRef.current));
      batchRef.current = undefined;
      setReview(undefined);
      setPatches({});
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  return {
    options,
    setOptions,
    review: edited,
    busy,
    progress,
    files,
    error,
    setError,
    saved,
    setSaved,
    analyze,
    commit,
    discard,
    acceptCapture,
    update(index: number, patch: Omit<ImportPatch, 'index'>) {
      setPatches((previous) => ({ ...previous, [index]: { ...previous[index], index, ...patch } }));
    },
  };
}
