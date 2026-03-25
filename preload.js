const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onGlobalKeyDown: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('global-keydown', subscription);
    return () => ipcRenderer.removeListener('global-keydown', subscription);
  },
  onGlobalKeyUp: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('global-keyup', subscription);
    return () => ipcRenderer.removeListener('global-keyup', subscription);
  },
  saveData: (data) => ipcRenderer.send('save-data', data),
  loadData: () => ipcRenderer.invoke('load-data'),
  getPixelColor: (x, y, sourceId) => ipcRenderer.invoke('get-pixel-color', { x, y, sourceId }),
  getScreenshot: () => ipcRenderer.invoke('get-screenshot'),
  getScreenList: () => ipcRenderer.invoke('get-screen-list'),
  getMainSourceId: (preferredId) => ipcRenderer.invoke('get-main-source-id', preferredId),
  searchAreaColor: ({ x, y, w, h, hex }) => ipcRenderer.invoke('get-area-pixel-search', { x, y, w, h, hex })
});
