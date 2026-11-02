import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../shared/index';
import type { QbApi } from '../shared/index';

const api: QbApi = {
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
  },
};
contextBridge.exposeInMainWorld('qb', api);
