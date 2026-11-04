import { useState } from 'react';
import { buildExamHeaderRequest, initialExamHeaderForm } from './examHeaderForm';
import type { ExamHeaderForm } from './examHeaderForm';

export function useExamHeader() {
  const [form, setForm] = useState({ ...initialExamHeaderForm });
  const result = buildExamHeaderRequest(form);
  const setField = <K extends keyof ExamHeaderForm>(key: K, value: ExamHeaderForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return { form, setField, ...result, reason: Object.values(result.errors)[0] };
}
