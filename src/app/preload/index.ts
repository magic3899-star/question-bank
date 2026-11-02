import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { channels } from '../shared/index';
import type { QbApi } from '../shared/index';

const api: QbApi = {
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
  },
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet),
    update: (value) => ipcRenderer.invoke(channels.settingsUpdate, value),
  },
  bank: {
    stats: () => ipcRenderer.invoke(channels.bankStats),
    list: (value) => ipcRenderer.invoke(channels.bankList, value),
    objectiveTree: (value) => ipcRenderer.invoke(channels.bankTree, value),
    get: (value) => ipcRenderer.invoke(channels.bankGet, value),
    deleteMany: (value) => ipcRenderer.invoke(channels.bankDeleteMany, value),
  },
};
contextBridge.exposeInMainWorld('qb', api);
