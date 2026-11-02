import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { routeIds } from './index';

it('Electron 시작 전 보고서도 공통 표에서 같은 라우트 ID를 읽는다', () => {
  const require = createRequire(resolve('package.json'));
  const fallbackIds: unknown = require(resolve('scripts/route-ids.cjs'));
  expect(fallbackIds).toEqual(routeIds);
});
