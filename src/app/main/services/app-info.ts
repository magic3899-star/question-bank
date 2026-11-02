import type { AppInfo } from '../../shared/api';
export function createAppInfoService(info: AppInfo) {
  return { get: (): AppInfo => ({ ...info }) };
}
