const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const Store = require('electron-store');
const ffmpeg = require('ffmpeg-static');

const store = new Store();
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

// Initialize yt-dlp-wrap. You might need to specify the path to yt-dlp binary
// if it's not in your PATH or in the default download location.
// const ytDlpWrap = new YTDlpWrap(); 
// For development, let's try to find it in node_modules
let ytDlpPath;
if (fs.existsSync(path.join(__dirname, 'node_modules', 'yt-dlp-wrap', 'bin', 'yt-dlp'))) {
    ytDlpPath = path.join(__dirname, 'node_modules', 'yt-dlp-wrap', 'bin', 'yt-dlp');
} else if (fs.existsSync(path.join(__dirname, 'node_modules', '.bin', 'yt-dlp'))) {
    ytDlpPath = path.join(__dirname, 'node_modules', '.bin', 'yt-dlp');
} else {
    // As a last resort, try to download it. This might take time.
    console.log('yt-dlp binary not found in node_modules, attempting to download...');
    // YTDlpWrap.downloadFromGithub().then(path => ytDlpPath = path).catch(console.error);
    // For now, let's assume it will be in the PATH or user needs to install it globally
    // Or handle this more gracefully in a real app (e.g. prompt user)
}

const ytDlpWrap = ytDlpPath ? new YTDlpWrap(ytDlpPath) : new YTDlpWrap();

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
    const ffmpegPath = ffmpeg;

    const execArgs = [
      url,
      '-f', 'bestaudio/best', // Select best audio quality
      '-x', // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '0', // Best quality for MP3 conversion
      '-o', outputFilePath, // Use the determined output path/template
      '--progress' // Enable progress reporting
    ];

    if (ffmpegPath) {
      execArgs.push('--ffmpeg-location', ffmpegPath);
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
    
    // Format search query for yt-dlp
    const searchQuery = `ytsearch${maxResults}:${query.trim()}`;
    
    // Create a promise to handle the result
    return new Promise((resolve, reject) => {
      // Array to store search results
      const searchResults = [];
      
      // Use yt-dlp to search
      ytDlpWrap.execPromise([
        searchQuery,
        '--flat-playlist',  // Don't extract video info, just get the playlist
        '--format=best',    // Not downloading, but needed for some extractors
        '--print', 'thumbnail::%(title)s::%(webpage_url)s::%(duration_string)s::%(thumbnail)s'  // Custom output format with a marker
      ])
      .then(output => {
        // Parse the output to extract video information
        const lines = output.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
          if (!line.startsWith('thumbnail::')) return; // Skip lines that don't have our marker
          
          const parts = line.substring('thumbnail::'.length).split('::');
          if (parts.length >= 3) {
            const [title, url, duration, thumbnail] = parts;
            
            // Process thumbnail URL
            let thumbnailUrl = thumbnail || '';
            // Ensure the URL is properly formatted
            if (thumbnailUrl && !thumbnailUrl.startsWith('http')) {
              thumbnailUrl = thumbnailUrl.startsWith('//') ? 'https:' + thumbnailUrl : 'https://' + thumbnailUrl;
            }
            
            // If we still don't have a valid thumbnail, try to extract from standard YouTube format
            if (!thumbnailUrl && url && url.includes('youtube.com')) {
              // Try to extract video ID and construct thumbnail
              const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^\/\?\&]+)/);
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
        console.error('Error during YouTube search:', error);
        reject({ error: `Failed to search: ${error.message || 'Unknown error'}` });
      });
    });
  } catch (error) {
    console.error('YouTube search error:', error);
    return { error: `Failed to search: ${error.message || 'Unknown error'}` };
  }
});