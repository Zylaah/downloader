const { contextBridge, ipcRenderer } = require('electron');

// i18n: Load translations via IPC from main process (which has fs access)
// This follows the pattern from: https://phrase.com/blog/posts/building-an-electron-app-with-internationalization-i18n/
let i18nResources = {};
let currentLanguage = 'fr';
const languageListeners = new Set();

// Load initial translations synchronously
try {
  const initial = ipcRenderer.sendSync('get-initial-translations');
  if (initial && initial.translation) {
    i18nResources[initial.language] = { translation: initial.translation };
    currentLanguage = initial.language;
  }
} catch (error) {
  console.warn('[i18n] Failed to load initial translations:', error);
}

function getNestedTranslation(lang, keyPath) {
  const parts = keyPath.split('.');
  let node = i18nResources[lang] && i18nResources[lang].translation;
  for (const part of parts) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(str, options) {
  if (!options) return str;
  return str.replace(/{{\s*([^}]+)\s*}}/g, (_match, p1) => {
    const key = String(p1).trim();
    return Object.prototype.hasOwnProperty.call(options, key)
      ? String(options[key])
      : _match;
  });
}

function translate(key, options) {
  if (!key) return '';
  let value = getNestedTranslation(currentLanguage, key);
  if (value === undefined) {
    // Fallback to English if available
    value = getNestedTranslation('en', key);
  }
  if (value === undefined) {
    return key;
  }
  return interpolate(value, options);
}

async function setLanguage(lng) {
  if (lng === currentLanguage && i18nResources[lng]) {
    return currentLanguage;
  }
  
  // Request translation bundle from main process
  try {
    const bundle = await ipcRenderer.invoke('get-translation-bundle', lng);
    if (bundle && bundle.translation) {
      i18nResources[lng] = { translation: bundle.translation };
      currentLanguage = lng;
      
      // Notify listeners
      languageListeners.forEach((listener) => {
        try {
          listener(currentLanguage);
        } catch {
          // Ignore listener errors
        }
      });
      return currentLanguage;
    }
  } catch (error) {
    console.warn(`[i18n] Failed to load locale ${lng}:`, error);
  }
  
  return currentLanguage;
}

contextBridge.exposeInMainWorld('electronAPI', {
  downloadAudio: (url, downloadPath, playlistMode = 'single') => ipcRenderer.send('download-audio', url, downloadPath, playlistMode),
  downloadMedia: (url, downloadPath, format, playlistMode = 'single') => ipcRenderer.send('download-media', url, downloadPath, format, playlistMode),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  onConversionPhaseStarted: (callback) => ipcRenderer.on('conversion-phase-started', (_event) => callback()),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (_event, value) => callback(value)),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (_event, value) => callback(value)),
  onDownloadCancelled: (callback) => ipcRenderer.on('download-cancelled', (_event, value) => callback(value)),
  onPlaylistItemUpdate: (callback) => ipcRenderer.on('playlist-item-update', (_event, value) => callback(value)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
  getDefaultDownloadPath: () => ipcRenderer.invoke('get-default-download-path'),
  searchYoutube: (query, maxResults) => ipcRenderer.invoke('search-youtube', query, maxResults),
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  getPlaylistInfo: (url) => ipcRenderer.invoke('get-playlist-info', url),
  cancelVideoInfo: () => ipcRenderer.invoke('cancel-video-info'),
  checkYtDlpAvailability: () => ipcRenderer.invoke('check-yt-dlp-availability'),
  checkFfmpegAvailability: () => ipcRenderer.invoke('check-ffmpeg-availability'),
  downloadYtDlpBinary: () => ipcRenderer.invoke('download-yt-dlp-binary'),
  downloadFfmpegBinary: () => ipcRenderer.invoke('download-ffmpeg-binary'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeRestoreWindow: () => ipcRenderer.send('maximize-restore-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),

  // Auto-update APIs
  checkForUpdates: () => ipcRenderer.invoke('update-check-now'),
  startUpdateDownload: () => ipcRenderer.invoke('update-start-download'),
  skipUpdateVersion: (version) => ipcRenderer.invoke('update-skip-version', version),
  installUpdateNow: () => ipcRenderer.invoke('update-install-now'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (_event, info) => callback(info)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_event, info) => callback(info))
});

// Expose a minimal i18n API to the renderer.
contextBridge.exposeInMainWorld('i18n', {
  t: (key, options) => translate(key, options),
  changeLanguage: async (lng) => await setLanguage(lng),
  getLanguage: () => currentLanguage,
  getSupportedLanguages: () => ['fr', 'en', 'es'],
  onLanguageChanged: (callback) => {
    if (typeof callback === 'function') {
      languageListeners.add(callback);
    }
  }
});
