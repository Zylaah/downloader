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

  try {
    if (downloadPath && fs.existsSync(downloadPath)) {
      // If a download path is provided, construct the output template for yt-dlp
      // This will save the file as 'Video Title.mp3' in the chosen directory.
      outputFilePath = path.join(downloadPath, '%(title)s.%(ext)s');
      event.reply('download-progress', `Preparing to download to: ${downloadPath}`);
      console.log(`Attempting to download audio for: ${url} to directory ${downloadPath} with template %(title)s.%(ext)s`);
    } else {
      // Fallback: Prompt user for save location if no valid path is provided
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Enregistrer l\'audio en tant que',
        defaultPath: `audio.mp3`, // Suggest a generic name, yt-dlp might override with title anyway if -o is just a path
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
    
    // --- IMPORTANT --- 
    // Use ffmpeg-static to get the path to ffmpeg
    // const ffmpegPath = ffmpeg; // This was the previous way
    // We now use the globally resolved `ffmpegPathToUse`

    const execArgs = [
      url,
      '-f', 'bestaudio/best', // Select best audio quality
      '-x', // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '0', // Best quality for MP3 conversion
      '-o', outputFilePath, // Use the determined output path/template
      '--progress' // Enable progress reporting
    ];

    if (ffmpegPathToUse) { // Check if the resolved ffmpegPathToUse is available
      execArgs.push('--ffmpeg-location', ffmpegPathToUse);
    }

    // Configure yt-dlp to download audio only, in mp3 format
    await ytDlpWrap.exec(execArgs)
    .on('progress', (progress) => {
        // Example progress object: { percent: '2.6%', totalSize: '2.36MiB', currentSpeed: '74.09KiB/s', eta: '00:30' }
      // Send the raw progress object to the renderer
      event.reply('download-progress', progress);
    })
    .on('ytDlpEvent', (eventType, eventData) => console.log(eventType, eventData)) // For debugging yt-dlp output
    .on('error', (error) => {
      console.error('Error during download:', error);
      event.reply('download-error', `Error: ${error.message || 'Unknown error'}`);
    })
    .on('close', () => {
      // yt-dlp doesn't directly tell us the final filename when using a template.
      // We could try to find the latest .mp3 in the folder, but that's brittle.
      // For now, just confirm completion to the directory.
      const finalMessage = downloadPath 
        ? `Téléchargement terminé. Audio enregistré dans ${downloadPath}. (Le nom du fichier est basé sur le titre de la vidéo)`
        : `Téléchargement terminé: ${outputFilePath}`;
      console.log(`Téléchargement terminé pour ${url}`);
      event.reply('download-complete', finalMessage);
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