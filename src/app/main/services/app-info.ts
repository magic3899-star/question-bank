import type { AppInfo } from '../../shared/index';
export function createAppInfoService(info: AppInfo) {
  return { get: (): AppInfo => ({ ...info }) };
}
