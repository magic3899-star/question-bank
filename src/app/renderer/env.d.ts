import type { QbApi } from '../shared/api';
declare global {
  interface Window {
    qb: QbApi;
  }
}
