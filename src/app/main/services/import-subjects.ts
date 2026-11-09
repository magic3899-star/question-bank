import { findSubjectById } from '../../../modules/subject-catalog/index';
import type { Settings } from '../../shared/index';

export function createEnsureSubjects(
  settings: { get: () => Settings; update: (value: Partial<Settings>) => Settings },
  rules: { ensureSubjectRules: (ids: string[]) => Promise<void> },
): (ids: string[]) => Promise<string[]> {
  return async (ids) => {
    const subjects = settings.get().subjects;
    const known = new Set(subjects.map((subject) => subject.id));
    const added: string[] = [];
    for (const id of ids) {
      const subject = findSubjectById(id);
      if (!subject || known.has(id)) continue;
      subjects.push({ id, name: subject.name });
      known.add(id);
      added.push(subject.name);
    }
    if (added.length) settings.update({ subjects });
    await rules.ensureSubjectRules(ids);
    return added;
  };
}
