import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { channels } from '../shared/index';
import type { AppInfo, Result } from '../shared/index';
import type { createEditorService } from './services/editor';
import type { createBankService } from './services/bank';
import type { createImportService } from './services/import';
import type { createSettingsService } from './settings';
import type { createRulesService } from './services/rules';
import type { createGenerateService } from './services/generate';
import type { createExportService } from './services/export';
import type { createBackupService } from './services/backup';
import type { createUpdater } from './updater';
import { events } from '../shared/index';

export async function toResult<T>(action: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (cause) {
    const message =
      cause instanceof Error && /[가-힣]/u.test(cause.message)
        ? cause.message
        : '작업을 완료하지 못했습니다. 데이터 폴더와 파일 권한을 확인한 뒤 다시 시도하세요.';
    return { ok: false, message };
  }
}
export function registerIpc(deps: {
  contents: WebContents;
  info: () => AppInfo;
  settings: ReturnType<typeof createSettingsService>;
  bank?: ReturnType<typeof createBankService>;
  editor?: ReturnType<typeof createEditorService>;
  setDirty?: (dirty: boolean) => void;
  importer?: ReturnType<typeof createImportService>;
  openDataDir: () => Promise<void>;
  rules?: ReturnType<typeof createRulesService>;
  generate?: ReturnType<typeof createGenerateService>;
  exporter?: ReturnType<typeof createExportService>;
  backup?: ReturnType<typeof createBackupService>;
  updater?: ReturnType<typeof createUpdater>;
  openPath?: (path: string) => Promise<void>;
  restoreBackup?: (path: string) => Promise<void>;
  openBackupFolder?: () => Promise<void>;
}): void {
  const need = <T>(service: T | undefined, label: string): T => {
    if (!service)
      throw new Error(
        deps.info().startupError ?? `${label}을(를) 준비할 수 없습니다. 데이터 폴더와 백업을 확인하세요.`,
      );
    return service;
  };
  const bank = () => {
    if (!deps.bank)
      throw new Error(
        deps.info().startupError ?? '저장소가 준비되지 않았습니다. 데이터 폴더와 백업을 확인하세요.',
      );
    return deps.bank;
  };
  const importer = () => {
    if (!deps.importer)
      throw new Error(deps.info().startupError ?? '가져오기를 준비할 수 없습니다. 저장소를 확인하세요.');
    return deps.importer;
  };
  const editor = () => {
    if (!deps.editor) throw new Error('편집기를 준비할 수 없습니다. 저장소를 확인하세요.');
    return deps.editor;
  };
  const handlers: Record<string, (value: unknown) => unknown> = {
    [channels.bankValidate]: (v) => editor().validate(v),
    [channels.bankSave]: (v) => editor().save(v),
    [channels.bankDelete]: (v) => editor().delete(v),
    [channels.bankRestore]: (v) => editor().restore(v),
    [channels.bankCodes]: (v) => editor().objectiveCodes(v),
    [channels.bankExplanations]: (v) => editor().applyExplanations(v),
    [channels.assetsAdd]: (v) => editor().addAsset(v),
    [channels.editorParse]: (v) => editor().parseText(v),
    [channels.editorExplanations]: (v) => editor().parseExplanations(v),
    [channels.editorDirty]: (v) => {
      if (typeof v !== 'boolean') throw new Error('편집 상태가 올바르지 않습니다.');
      deps.setDirty?.(v);
    },
    [channels.appInfo]: deps.info,
    [channels.openDataDir]: deps.openDataDir,
    [channels.settingsGet]: deps.settings.get,
    [channels.settingsUpdate]: (value) => deps.settings.update(value),
    [channels.bankStats]: () => bank().stats(),
    [channels.bankList]: (value) => bank().list(value),
    [channels.bankTree]: (value) => bank().objectiveTree(value),
    [channels.bankGet]: (value) => bank().get(value),
    [channels.bankDeleteMany]: (value) => bank().deleteMany(value),
    [channels.importPickFiles]: () => importer().pickFiles(),
    [channels.importAnalyze]: (value) =>
      importer().analyze(value, (progress) => {
        if (!deps.contents.isDestroyed()) deps.contents.send(events.importProgress, progress);
      }),
    [channels.importCommit]: (value) => importer().commit(value),
    [channels.importDiscard]: (value) => importer().discard(value),
    [channels.openPath]: (v) => deps.openPath!(need(deps.exporter, '저장 기능').isAllowedPath(v)),
    [channels.rulesList]: () => need(deps.rules, '출제 규칙').list(),
    [channels.rulesGet]: (v) => need(deps.rules, '출제 규칙').get(v),
    [channels.rulesSave]: (v) => need(deps.rules, '출제 규칙').save(v),
    [channels.rulesDuplicate]: (v) => need(deps.rules, '출제 규칙').duplicate(v),
    [channels.rulesDelete]: (v) => need(deps.rules, '출제 규칙').delete(v),
    [channels.rulesReset]: (v) => need(deps.rules, '출제 규칙').resetPreset(v),
    [channels.rulesCheck]: (v) => need(deps.rules, '출제 규칙').check(v),
    [channels.examGenerate]: (v) => need(deps.generate, '시험 만들기').generate(v),
    [channels.examGet]: (v) => need(deps.generate, '시험 만들기').get(v),
    [channels.examReplace]: (v) => need(deps.generate, '시험 만들기').replace(v),
    [channels.examRegenerate]: (v) => need(deps.generate, '시험 만들기').regenerate(v),
    [channels.examDiscard]: (v) => need(deps.generate, '시험 만들기').discard(v),
    [channels.examExport]: (v) =>
      need(deps.exporter, '저장 기능').export(v, (progress) => {
        if (!deps.contents.isDestroyed()) deps.contents.send(events.exportProgress, progress);
      }),
    [channels.historyList]: (v) => need(deps.exporter, '출제 이력').historyList(v),
    [channels.historyGet]: (v) => need(deps.exporter, '출제 이력').historyGet(v),
    [channels.historyDelete]: (v) => need(deps.exporter, '출제 이력').historyDelete(v),
    [channels.backupList]: () => need(deps.backup, '백업').list(),
    [channels.backupCreate]: () => need(deps.backup, '백업').create(),
    [channels.backupRestore]: (v) => deps.restoreBackup!(need(deps.backup, '백업').resolve(v)),
    [channels.backupOpenFolder]: () => deps.openBackupFolder!(),
    [channels.updateStatus]: () => need(deps.updater, '업데이트').status(),
    [channels.updateCheck]: () => need(deps.updater, '업데이트').check(),
    [channels.updateInstall]: () => need(deps.updater, '업데이트').install(),
  };
  for (const channel of Object.values(channels)) {
    const action = handlers[channel]!;
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, value: unknown) =>
      toResult(() => {
        if (event.sender !== deps.contents || event.senderFrame !== deps.contents.mainFrame)
          throw new Error('이 화면에서는 요청할 수 없습니다. 프로그램의 기본 창에서 다시 시도하세요.');
        return action(value);
      }),
    );
  }
}
