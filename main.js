const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const Store = require('electron-store');
const originalFfmpegPath = require('ffmpeg-static');
const os = require('os'); // Added os module

const store = new Store();
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

// Determine the correct ffmpeg path to use
let ffmpegPathToUse = originalFfmpegPath;
if (app.isPackaged) {
  ffmpegPathToUse = originalFfmpegPath.replace('app.asar', 'app.asar.unpacked');
}
console.log('[Main Process] ffmpeg path determined as:', ffmpegPathToUse);

// Determine the yt-dlp executable name based on OS
let ytDlpExecutableName;
switch (os.platform()) {
  case 'win32':
    ytDlpExecutableName = 'yt-dlp.exe';
    break;
  case 'darwin':
    ytDlpExecutableName = 'yt-dlp_macos';
    break;
  case 'linux':
    ytDlpExecutableName = 'yt-dlp_linux';
    break;
  default:
    console.error('[Main Process] Unsupported platform for yt-dlp:', os.platform());
    // Potentially fallback or exit, for now, YTDlpWrap might try its default
}

// Determine the path to the yt-dlp executable
let ytDlpBinaryPath; 
if (app.isPackaged) {
  ytDlpBinaryPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'yt-dlp-wrap', 'bin', ytDlpExecutableName);
  if (!fs.existsSync(ytDlpBinaryPath)) {
    console.error(`[Main Process] CRITICAL: Packaged yt-dlp executable not found at ${ytDlpBinaryPath}`);
    // ytDlpBinaryPath will remain undefined, YTDlpWrap will use its default (likely 'yt-dlp')
    // which will probably fail with ENOENT if not in PATH on the target system.
    ytDlpBinaryPath = undefined; // Explicitly set to undefined
  } else {
    console.log('[Main Process] Using packaged yt-dlp executable at:', ytDlpBinaryPath);
  }
} else {
  // Development: Try common locations for yt-dlp binary
  const devPath1 = path.join(__dirname, 'node_modules', 'yt-dlp-wrap', 'bin', ytDlpExecutableName);
  const devPath2 = path.join(__dirname, 'node_modules', '.bin', ytDlpExecutableName); // Less common for yt-dlp-wrap but check anyway

  if (fs.existsSync(devPath1)) {
    ytDlpBinaryPath = devPath1;
  } else if (fs.existsSync(devPath2)) {
    ytDlpBinaryPath = devPath2;
  }
  if (ytDlpBinaryPath) {
    console.log('[Main Process] Using development yt-dlp executable at:', ytDlpBinaryPath);
  } else {
    console.log('[Main Process] yt-dlp executable not found in development paths, YTDlpWrap will use its default.');
  }
}

// Initialize yt-dlp-wrap with the determined path if available
const ytDlpWrap = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap();
console.log('[Main Process] yt-dlp binary path used for YTDlpWrap init:', ytDlpBinaryPath || 'default (not found, relying on PATH)');

// Handle getting the default download path
ipcMain.handle('get-default-download-path', async () => {
  const savedPath = store.get('downloadPath');
  if (savedPath && fs.existsSync(savedPath)) {
    try {
      // Check if path is writable - this is a basic check
      fs.accessSync(savedPath, fs.constants.W_OK);
      return savedPath;
    } catch (err) {
      console.warn(`Saved download path ${savedPath} is not writable or accessible, falling back to default.`);
      store.delete('downloadPath'); // Remove invalid path
      return app.getPath('downloads');
    }
  }
  return app.getPath('downloads');
});

// Handle selection of download path
ipcMain.handle('select-download-path', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) {
    return store.get('downloadPath') || app.getPath('downloads'); // Return current saved or default if cancelled
  }
  const selectedPath = filePaths[0];
  store.set('downloadPath', selectedPath);
  return selectedPath;
});

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  // Listen for window control events from renderer
  ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('maximize-restore-window', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  // Send maximized state to renderer when it changes
  if (mainWindow) {
    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('window-maximized');
    });
    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('window-unmaximized');
    });
  }

  ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('download-audio', async (event, url, downloadPath) => {
  if (!url || !url.trim()) {
    event.reply('download-error', 'Please enter a valid URL.');
    return;
  }

  let outputFilePath;
  let conversionSignalSent = false;
  let downloadReportedAsMostlyComplete = false;

  try {
    if (downloadPath && fs.existsSync(downloadPath)) {
      outputFilePath = path.join(downloadPath, '%(title)s.%(ext)s');
      event.reply('download-progress', `Preparing to download to: ${downloadPath}`);
      console.log(`Attempting to download audio for: ${url} to directory ${downloadPath} with template %(title)s.%(ext)s`);
    } else {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Enregistrer l\'audio en tant que',
        defaultPath: `audio.mp3`,
        filters: [
          { name: 'Fichiers audio', extensions: ['mp3', 'm4a', 'wav'] }
        ]
      });

      if (canceled || !filePath) {
        event.reply('download-cancelled', 'Téléchargement annulé par l\'utilisateur.');
        return;
      }
      outputFilePath = filePath;
      event.reply('download-progress', 'Début du téléchargement...');
      console.log(`Tentative de téléchargement de l'audio pour: ${url} vers ${outputFilePath}`);
    }
    
    const execArgs = [
      url,
      '-f', 'bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputFilePath,
      '--progress'
    ];

    if (ffmpegPathToUse) {
      execArgs.push('--ffmpeg-location', ffmpegPathToUse);
    }

    await ytDlpWrap.exec(execArgs)
    .on('progress', (progress) => {
      console.log('[Main Process] RAW yt-dlp progress event:', JSON.stringify(progress));
      event.reply('download-progress', progress);

      if (!conversionSignalSent && progress && typeof progress.percent === 'string') {
        const currentPercent = parseFloat(progress.percent.replace('%',''));
        if (currentPercent >= 99.5) { // Using 99.5 as a threshold for "download part done"
          console.log('[Main Process] Download reported as essentially complete (>=99.5%).');
          downloadReportedAsMostlyComplete = true; 
          // This is now the PRIMARY and EARLIEST point to send conversion-phase-started
          console.log('[Main Process] conversion-phase-started sent (triggered by download >=99.5% completion).');
          event.reply('conversion-phase-started');
          conversionSignalSent = true;
        }
      }
    })
    .on('ytDlpEvent', (eventType, eventData) => {
      // Log ytDlpEvents for diagnostics, but DO NOT send conversion-phase-started from here anymore
      // to simplify and avoid race conditions with the progress handler.
      console.log(`[ytDlpEvent] ${eventType}: ${eventData}`);
      // We could potentially set downloadReportedAsMostlyComplete = true here if a very specific 
      // "download definitely finished, starting ffmpeg" event is found, but the progress >= 99.5% is more reliable.
    })
    .on('error', (error) => {
      console.error('Error during download:', error);
      event.reply('download-error', `Error: ${error.message || 'Unknown error'}`);
    })
    .on('close', () => {
      console.log('[Main Process] yt-dlp process close event fired.');
      // Fallback: If signal somehow wasn't sent, send it now.
      if (!conversionSignalSent) {
        console.warn('[Main Process] \'close\' event: conversion-phase-started was missed. Sending now.');
        event.reply('conversion-phase-started');
        // conversionSignalSent = true; // Not strictly needed here as it's the end, but good practice
      }
      
      // IMPORTANT: Delay sending 'download-complete' to allow the renderer's 
      // conversion simulation (e.g., 3 seconds) to visually complete.
      setTimeout(() => {
        const finalMessage = downloadPath 
            ? `Téléchargement terminé. Audio enregistré dans ${downloadPath}. (Le nom du fichier est basé sur le titre de la vidéo)`
            : `Téléchargement terminé: ${outputFilePath}`;
        console.log(`[Main Process] Sending download-complete. URL: ${url}`);
        event.reply('download-complete', finalMessage);
      }, 3500); // Give renderer ~3.5s (simulation is 3s)
    });

  } catch (error) {
    console.error('yt-dlp execution error:', error);
    event.reply('download-error', `Failed to download audio: ${error.message || 'Unknown error'}`);
  }
});

// Add a search handler for YouTube videos
ipcMain.handle('search-youtube', async (event, query, maxResults = 5) => {
  try {
    if (!query || !query.trim()) {
      return { error: 'Please enter a search query.' };
    }

    console.log(`Searching YouTube for: ${query}`);
    
    const searchQuery = `ytsearch${maxResults}:${query.trim()}`;
    
    return new Promise((resolve) => { // No reject, always resolve with status
      const searchResults = [];
      
      ytDlpWrap.execPromise([
        searchQuery,
        '--flat-playlist',
        '--format=best',
        '--print', 'thumbnail::%(title)s::%(webpage_url)s::%(duration_string)s::%(thumbnail)s',
        '--encoding', 'utf-8'
      ])
      .then(output => {
        console.log('Raw yt-dlp output for search:\n', output);
        const lines = output.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
          if (!line.startsWith('thumbnail::')) return;
          
          const parts = line.substring('thumbnail::'.length).split('::');
          if (parts.length >= 3) {
            const [title, url, duration, thumbnail] = parts;
            let thumbnailUrl = thumbnail || '';
            if (thumbnailUrl && !thumbnailUrl.startsWith('http')) {
              thumbnailUrl = thumbnailUrl.startsWith('//') ? 'https:' + thumbnailUrl : 'https://' + thumbnailUrl;
            }
            if (!thumbnailUrl && url && url.includes('youtube.com')) {
              const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^\/\?&]+)/);
              if (videoIdMatch && videoIdMatch[1]) {
                thumbnailUrl = `https://img.youtube.com/vi/${videoIdMatch[1]}/mqdefault.jpg`;
              }
            }
            searchResults.push({
              title: title || 'Unknown Title',
              url: url || '',
              duration: duration || 'Unknown',
              thumbnail: thumbnailUrl
            });
          }
        });
        resolve({ results: searchResults });
      })
      .catch(error => {
        console.error('[Main Process] Error during YouTube search:', error);
        resolve({ 
          error: `Failed to search: ${error.message || 'Unknown error'}`,
          stack: error.stack // Include stack for more details
        });
      });
    });
  } catch (error) {
    console.error('[Main Process] Synchronous error in search-youtube handler:', error);
    return { 
      error: `Synchronous handler error: ${error.message || 'Unknown error'}`,
      stack: error.stack
    };
  }
});