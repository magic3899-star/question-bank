import { useState } from 'react';
import type { ExportRequest } from '../../shared/index';

export function buildExamTypesRequest(both: boolean): Pick<ExportRequest, 'examTypes'> {
  return { examTypes: both ? 'both' : 'single' };
}

export function useExamTypes() {
  const [both, setBoth] = useState(false);
  return { both, setBoth, request: buildExamTypesRequest(both) };
}
