import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { makeAppBank } from '../tests/fixtures/appBank';
import { openStorage } from '../src/modules/storage/index';
import { getPaths, preparePaths } from '../src/app/main/paths';
import { createSettingsService } from '../src/app/main/settings';

async function main(): Promise<void> {
  if (!process.argv[2]) throw new Error('가짜 데이터를 만들 폴더를 지정하세요: npm run seed -- <dataDir>');
  const paths = getPaths('', resolve(process.argv[2]));
  if (existsSync(paths.dbPath))
    throw new Error('이미 DB가 있는 폴더입니다. 기존 데이터 보호를 위해 새 임시 폴더를 지정하세요.');
  preparePaths(paths);
  const storage = openStorage(paths.dbPath);
  try {
    const { questions, assets } = makeAppBank();
    for (const asset of Object.values(assets)) await storage.assets.put(asset);
    await storage.questions.upsertMany(questions);
    createSettingsService(paths.settingsPath, () => new Date().toISOString()).update({ theme: 'light' });
    console.log('가짜 문제 300개·과목 2개를 저장했습니다.');
  } finally {
    storage.close();
  }
}
void main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
});
