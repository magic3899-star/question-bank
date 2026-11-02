import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { channels, events } from '../shared/index';
import type { QbApi } from '../shared/index';

// main 이 보내는 알림만 전달한다(ipcRenderer 자체는 화면에 노출하지 않는다).
function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: QbApi = {
  editor: {
    parseText: (v) => ipcRenderer.invoke(channels.editorParse, v),
    parseExplanations: (v) => ipcRenderer.invoke(channels.editorExplanations, v),
    setDirty: (v) => ipcRenderer.invoke(channels.editorDirty, v),
  },
  assets: { add: (v) => ipcRenderer.invoke(channels.assetsAdd, v) },
  import: {
    pickFiles: () => ipcRenderer.invoke(channels.importPickFiles),
    pathsForFiles: (files) => files.map((file) => webUtils.getPathForFile(file)),
    analyze: (value) => ipcRenderer.invoke(channels.importAnalyze, value),
    commit: (value) => ipcRenderer.invoke(channels.importCommit, value),
    discard: (value) => ipcRenderer.invoke(channels.importDiscard, value),
  },
  app: {
    info: () => ipcRenderer.invoke(channels.appInfo),
    openDataDir: () => ipcRenderer.invoke(channels.openDataDir),
    openPath: (v) => ipcRenderer.invoke(channels.openPath, v),
  },
  rules: {
    list: () => ipcRenderer.invoke(channels.rulesList),
    get: (v) => ipcRenderer.invoke(channels.rulesGet, v),
    save: (v) => ipcRenderer.invoke(channels.rulesSave, v),
    duplicate: (v) => ipcRenderer.invoke(channels.rulesDuplicate, v),
    delete: (v) => ipcRenderer.invoke(channels.rulesDelete, v),
    reset: (v) => ipcRenderer.invoke(channels.rulesReset, v),
    check: (v) => ipcRenderer.invoke(channels.rulesCheck, v),
  },
  exam: {
    generate: (v) => ipcRenderer.invoke(channels.examGenerate, v),
    get: (v) => ipcRenderer.invoke(channels.examGet, v),
    replace: (v) => ipcRenderer.invoke(channels.examReplace, v),
    regenerate: (v) => ipcRenderer.invoke(channels.examRegenerate, v),
    discard: (v) => ipcRenderer.invoke(channels.examDiscard, v),
    export: (v) => ipcRenderer.invoke(channels.examExport, v),
    onExportProgress: (listener) => subscribe(events.exportProgress, listener),
  },
  history: {
    list: (v) => ipcRenderer.invoke(channels.historyList, v),
    get: (v) => ipcRenderer.invoke(channels.historyGet, v),
    delete: (v) => ipcRenderer.invoke(channels.historyDelete, v),
  },
  backup: {
    list: () => ipcRenderer.invoke(channels.backupList),
    create: () => ipcRenderer.invoke(channels.backupCreate),
    restore: (v) => ipcRenderer.invoke(channels.backupRestore, v),
    openFolder: () => ipcRenderer.invoke(channels.backupOpenFolder),
  },
  update: {
    status: () => ipcRenderer.invoke(channels.updateStatus),
    check: () => ipcRenderer.invoke(channels.updateCheck),
    install: () => ipcRenderer.invoke(channels.updateInstall),
    onStatus: (listener) => subscribe(events.updateStatus, listener),
  },
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet),
    update: (value) => ipcRenderer.invoke(channels.settingsUpdate, value),
  },
  bank: {
    validate: (v) => ipcRenderer.invoke(channels.bankValidate, v),
    save: (v) => ipcRenderer.invoke(channels.bankSave, v),
    delete: (v) => ipcRenderer.invoke(channels.bankDelete, v),
    restore: (v) => ipcRenderer.invoke(channels.bankRestore, v),
    objectiveCodes: (v) => ipcRenderer.invoke(channels.bankCodes, v),
    applyExplanations: (v) => ipcRenderer.invoke(channels.bankExplanations, v),
    stats: () => ipcRenderer.invoke(channels.bankStats),
    list: (value) => ipcRenderer.invoke(channels.bankList, value),
    objectiveTree: (value) => ipcRenderer.invoke(channels.bankTree, value),
    get: (value) => ipcRenderer.invoke(channels.bankGet, value),
    deleteMany: (value) => ipcRenderer.invoke(channels.bankDeleteMany, value),
  },
};
contextBridge.exposeInMainWorld('qb', api);
