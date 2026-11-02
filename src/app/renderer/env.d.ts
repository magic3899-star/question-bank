import type { QbApi } from '../shared/index';
declare global {
  interface Window {
    qb: QbApi;
  }
}
