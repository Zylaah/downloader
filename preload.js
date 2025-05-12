const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  downloadAudio: (url, downloadPath) => ipcRenderer.send('download-audio', url, downloadPath),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (_event, value) => callback(value)),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (_event, value) => callback(value)),
  onDownloadCancelled: (callback) => ipcRenderer.on('download-cancelled', (_event, value) => callback(value)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
  getDefaultDownloadPath: () => ipcRenderer.invoke('get-default-download-path'),
  searchYoutube: (query, maxResults) => ipcRenderer.invoke('search-youtube', query, maxResults),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeRestoreWindow: () => ipcRenderer.send('maximize-restore-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback)
}); 