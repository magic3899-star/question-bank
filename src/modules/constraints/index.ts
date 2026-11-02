import type { Constraint } from '../../contracts/index';
import { noOverlapAcrossExams } from './no-overlap-across-exams/index';
import { noDuplicateContent } from './no-duplicate-content/index';
import { distinctBySegment } from './distinct-by-segment/index';
import { excludeRecent } from './exclude-recent/index';

export const standardConstraints: Constraint[] = [
  noOverlapAcrossExams,
  noDuplicateContent,
  distinctBySegment,
  excludeRecent,
];
