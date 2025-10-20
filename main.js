const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const Store = require('electron-store');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const store = new Store();
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

// Function to download yt-dlp FFmpeg binary if not found
async function ensureFfmpegBinary() {
  try {
    let ffmpegPath;
    const ffmpegExecutableName = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    
    // Use a temporary directory for both packaged and development, similar to yt-dlp
    const tempDir = path.join(os.tmpdir(), 'mytube-ffmpeg');
    ffmpegPath = path.join(tempDir, ffmpegExecutableName);
    
    // Check if the ffmpeg binary exists
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      console.log('[Main Process] yt-dlp FFmpeg binary found at:', ffmpegPath);
      
      // Make sure it's executable on Unix systems
      if (os.platform() !== 'win32') {
        try {
          fs.chmodSync(ffmpegPath, '755');
        } catch (chmodError) {
          console.warn('[Main Process] Could not set ffmpeg executable permissions:', chmodError.message);
        }
      }
      
      return ffmpegPath;
    }
    
    console.log('[Main Process] yt-dlp FFmpeg binary not found, attempting to download...');
    
    // Download FFmpeg if not found
    const downloadedPath = await downloadFfmpegBinary();
    if (downloadedPath) {
      return downloadedPath;
    }
    
    console.warn('[Main Process] yt-dlp FFmpeg binary not found at expected path:', ffmpegPath);
  } catch (error) {
    console.error('[Main Process] Error getting ffmpeg path:', error);
  }
  
  // Fallback: try to use system ffmpeg
  console.log('[Main Process] Trying system ffmpeg as fallback...');
  
  try {
    const { execSync } = require('child_process');
    const systemFfmpeg = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (systemFfmpeg && fs.existsSync(systemFfmpeg)) {
      console.log('[Main Process] Using system ffmpeg at:', systemFfmpeg);
      return systemFfmpeg;
    }
  } catch (error) {
    console.log('[Main Process] System ffmpeg not found in PATH');
  }
  
  // If no ffmpeg is found, return null (yt-dlp will handle the error)
  console.warn('[Main Process] No ffmpeg binary found. Audio conversion may not work properly.');
  return null;
}

// Function to download yt-dlp FFmpeg binary
async function downloadFfmpegBinary() {
  const AdmZip = require('adm-zip');
  
  try {
    const platform = os.platform();
    const arch = os.arch();
    
    console.log(`[Main Process] Downloading FFmpeg for platform: ${platform}, architecture: ${arch}`);
    
    // Determine the correct URL for yt-dlp FFmpeg builds
    let url;
    let isZip = false;
    
    if (platform === 'linux') {
      if (arch === 'x64') {
        url = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz';
      } else if (arch === 'arm64') {
        url = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz';
      } else {
        throw new Error(`Unsupported Linux architecture: ${arch}`);
      }
    } else if (platform === 'win32') {
      isZip = true;
      if (arch === 'x64') {
        url = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
      } else if (arch === 'ia32') {
        url = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win32-gpl.zip';
      } else {
        throw new Error(`Unsupported Windows architecture: ${arch}`);
      }
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    
    // Create temporary directory (like yt-dlp)
    const tempDir = path.join(os.tmpdir(), 'mytube-ffmpeg');
    const downloadPath = path.join(os.tmpdir(), `ffmpeg-${platform}-${arch}.${isZip ? 'zip' : 'tar.xz'}`);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    console.log(`[Main Process] Downloading from: ${url}`);
    
    // Download the file
    await downloadFile(url, downloadPath);
    console.log('[Main Process] FFmpeg download completed');
    
    // Extract the file
    if (isZip) {
      await extractZip(downloadPath, tempDir);
    } else {
      await extractTarXz(downloadPath, tempDir);
    }
    
    // Set executable permissions on Unix systems
    const ffmpegExecutableName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegPath = path.join(tempDir, ffmpegExecutableName);
    if (fs.existsSync(ffmpegPath) && platform !== 'win32') {
      fs.chmodSync(ffmpegPath, '755');
    }
    
    console.log('[Main Process] FFmpeg setup completed successfully');
    return ffmpegPath;
    
  } catch (error) {
    console.error('[Main Process] Failed to download FFmpeg:', error);
    return null;
  }
}

// Helper function to download a file
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(outputPath, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Helper function to extract tar.xz files
function extractTarXz(tarPath, extractPath) {
  try {
    const tempExtractPath = path.join(os.tmpdir(), 'ffmpeg-extract-temp');
    
    if (!fs.existsSync(tempExtractPath)) {
      fs.mkdirSync(tempExtractPath, { recursive: true });
    }
    
    // Extract the tar.xz file
    execSync(`tar -xf "${tarPath}" -C "${tempExtractPath}"`, { stdio: 'inherit' });
    
    // Find the ffmpeg binary (it's in a subdirectory like ffmpeg-master-*/bin/ffmpeg)
    const extractedDirs = fs.readdirSync(tempExtractPath);
    if (extractedDirs.length > 0) {
      const ffmpegDir = path.join(tempExtractPath, extractedDirs[0], 'bin');
      const ffmpegBinary = path.join(ffmpegDir, 'ffmpeg');
      
      if (fs.existsSync(ffmpegBinary)) {
        // Copy ffmpeg binary to the target directory
        if (!fs.existsSync(extractPath)) {
          fs.mkdirSync(extractPath, { recursive: true });
        }
        fs.copyFileSync(ffmpegBinary, path.join(extractPath, 'ffmpeg'));
        console.log('[Main Process] FFmpeg binary copied to:', path.join(extractPath, 'ffmpeg'));
      }
    }
    
    // Clean up
    fs.unlinkSync(tarPath);
    fs.rmSync(tempExtractPath, { recursive: true, force: true });
    
    console.log('[Main Process] Tar.xz extraction completed');
  } catch (error) {
    console.error('[Main Process] Tar.xz extraction failed:', error.message);
    throw error;
  }
}

// Helper function to extract zip files
function extractZip(zipPath, extractPath) {
  const AdmZip = require('adm-zip');
  
  try {
    const tempExtractPath = path.join(os.tmpdir(), 'ffmpeg-extract-temp');
    
    if (!fs.existsSync(tempExtractPath)) {
      fs.mkdirSync(tempExtractPath, { recursive: true });
    }
    
    // Extract the zip file
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempExtractPath, true);
    
    // Find the ffmpeg binary (it's in a subdirectory like ffmpeg-master-*/bin/ffmpeg.exe)
    const extractedDirs = fs.readdirSync(tempExtractPath);
    if (extractedDirs.length > 0) {
      const ffmpegDir = path.join(tempExtractPath, extractedDirs[0], 'bin');
      const ffmpegBinary = path.join(ffmpegDir, 'ffmpeg.exe');
      
      if (fs.existsSync(ffmpegBinary)) {
        // Copy ffmpeg binary to the target directory
        if (!fs.existsSync(extractPath)) {
          fs.mkdirSync(extractPath, { recursive: true });
        }
        fs.copyFileSync(ffmpegBinary, path.join(extractPath, 'ffmpeg.exe'));
        console.log('[Main Process] FFmpeg binary copied to:', path.join(extractPath, 'ffmpeg.exe'));
      }
    }
    
    // Clean up
    fs.unlinkSync(zipPath);
    fs.rmSync(tempExtractPath, { recursive: true, force: true });
    
    console.log('[Main Process] Zip extraction completed');
  } catch (error) {
    console.error('[Main Process] Zip extraction failed:', error.message);
    throw error;
  }
}

// Determine the correct ffmpeg path to use (will be set when needed)
let ffmpegPathToUse = null;

// Determine the yt-dlp executable name based on OS
let ytDlpExecutableName;
switch (os.platform()) {
  case 'win32':
    ytDlpExecutableName = 'yt-dlp.exe';
    break;
  case 'darwin':
    ytDlpExecutableName = 'yt-dlp';
    break;
  case 'linux':
    ytDlpExecutableName = 'yt-dlp';
    break;
  default:
    console.error('[Main Process] Unsupported platform for yt-dlp:', os.platform());
    ytDlpExecutableName = 'yt-dlp';
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

// Function to download yt-dlp binary if not found
async function ensureYtDlpBinary() {
  if (ytDlpBinaryPath && fs.existsSync(ytDlpBinaryPath)) {
    console.log('[Main Process] yt-dlp binary found at:', ytDlpBinaryPath);
    return ytDlpBinaryPath;
  }

  console.log('[Main Process] yt-dlp binary not found, attempting to download...');
  
  try {
    // Create a temporary directory for the binary
    const tempDir = path.join(os.tmpdir(), 'mytube-yt-dlp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const binaryPath = path.join(tempDir, ytDlpExecutableName);
    
    // Download the latest yt-dlp binary
    await YTDlpWrap.downloadFromGithub(binaryPath);
    
    // Make it executable on Unix systems
    if (os.platform() !== 'win32') {
      fs.chmodSync(binaryPath, '755');
    }
    
    console.log('[Main Process] yt-dlp binary downloaded to:', binaryPath);
    return binaryPath;
  } catch (error) {
    console.error('[Main Process] Failed to download yt-dlp binary:', error);
    return null;
  }
}

// Initialize yt-dlp-wrap with the determined path if available
const ytDlpWrap = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap();
console.log('[Main Process] yt-dlp binary path used for YTDlpWrap init:', ytDlpBinaryPath || 'default (not found, relying on PATH)');

// Add IPC handler to check yt-dlp availability
ipcMain.handle('check-yt-dlp-availability', async () => {
  try {
    const binaryPath = await ensureYtDlpBinary();
    if (binaryPath) {
      ytDlpWrap.setBinaryPath(binaryPath);
      return { available: true, path: binaryPath };
    } else {
      return { available: false, error: 'Unable to find or download yt-dlp binary' };
    }
  } catch (error) {
    console.error('[Main Process] Error checking yt-dlp availability:', error);
    return { available: false, error: error.message };
  }
});

// Add IPC handler to check ffmpeg availability
ipcMain.handle('check-ffmpeg-availability', async () => {
  try {
    const binaryPath = await ensureFfmpegBinary();
    if (binaryPath) {
      return { available: true, path: binaryPath };
    } else {
      return { available: false, error: 'No ffmpeg binary found. Audio conversion may not work properly.' };
    }
  } catch (error) {
    console.error('[Main Process] Error checking ffmpeg availability:', error);
    return { available: false, error: error.message };
  }
});

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

    // Ensure we have the latest ffmpeg path
    const currentFfmpegPath = await ensureFfmpegBinary();
    if (currentFfmpegPath) {
      execArgs.push('--ffmpeg-location', currentFfmpegPath);
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

// Store active video info processes to allow cancellation
const activeVideoInfoProcesses = new Map();

ipcMain.handle('get-video-info', async (event, url) => {
  try {
    if (!url || !url.trim()) {
      return { error: 'Please provide a valid URL.' };
    }

    // Ensure we have a valid yt-dlp binary before proceeding
    const binaryPath = await ensureYtDlpBinary();
    if (!binaryPath) {
      return { error: 'Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.' };
    }

    // Update ytDlpWrap to use the correct binary path
    ytDlpWrap.setBinaryPath(binaryPath);

    console.log(`Getting video info for: ${url}`);
    
    return new Promise((resolve) => {
      const processId = Date.now() + Math.random(); // Unique ID for this process
      let isResolved = false;
      
      // Use execPromise for reliable output capture
      const promise = ytDlpWrap.execPromise([
        url.trim(),
        '--print', '%(title)s',
        '--no-download',
        '--encoding', 'utf-8'
      ])
      .then(output => {
        if (!isResolved) {
          isResolved = true;
          activeVideoInfoProcesses.delete(processId);
          const title = output.trim();
          console.log('Video title retrieved:', title);
          resolve({ title: title });
        }
      })
      .catch(error => {
        if (!isResolved) {
          isResolved = true;
          activeVideoInfoProcesses.delete(processId);
          console.error('[Main Process] Error getting video info:', error);
          resolve({ 
            error: `Failed to get video info: ${error.message || 'Unknown error'}`,
            stack: error.stack
          });
        }
      });
      
      // Store the promise and resolve function for cancellation
      activeVideoInfoProcesses.set(processId, {
        promise: promise,
        resolve: () => {
          if (!isResolved) {
            isResolved = true;
            activeVideoInfoProcesses.delete(processId);
            resolve({ cancelled: true });
          }
        }
      });
      
      // Store process ID in event sender for potential cancellation
      event.sender.videoInfoProcessId = processId;
    });
  } catch (error) {
    console.error('[Main Process] Synchronous error in get-video-info handler:', error);
    return { 
      error: `Synchronous handler error: ${error.message || 'Unknown error'}`,
      stack: error.stack
    };
  }
});

// Handle cancellation of video info requests
ipcMain.handle('cancel-video-info', async (event) => {
  try {
    const processId = event.sender.videoInfoProcessId;
    if (processId && activeVideoInfoProcesses.has(processId)) {
      const processInfo = activeVideoInfoProcesses.get(processId);
      
      // Resolve the promise with cancelled status
      if (processInfo.resolve) {
        processInfo.resolve();
      }
      
      console.log('Video info process cancelled');
      return { success: true };
    }
    
    return { success: false, message: 'No active process to cancel' };
  } catch (error) {
    console.error('[Main Process] Error cancelling video info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('download-media', async (event, url, downloadPath, format) => {
  if (!url || !url.trim()) {
    event.reply('download-error', 'Please enter a valid URL.');
    return;
  }

  // Ensure we have a valid yt-dlp binary before proceeding
  const binaryPath = await ensureYtDlpBinary();
  if (!binaryPath) {
    event.reply('download-error', 'Error: Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.');
    return;
  }

  // Update ytDlpWrap to use the correct binary path
  ytDlpWrap.setBinaryPath(binaryPath);

  let outputFilePath;
  let conversionSignalSent = false;
  let downloadReportedAsMostlyComplete = false;

  try {
    if (downloadPath && fs.existsSync(downloadPath)) {
      outputFilePath = path.join(downloadPath, '%(title)s.%(ext)s');
      event.reply('download-progress', `Preparing to download to: ${downloadPath}`);
      console.log(`Attempting to download ${format} for: ${url} to directory ${downloadPath} with template %(title)s.%(ext)s`);
    } else {
      const fileExtension = format === 'audio' ? 'mp3' : 'mp4';
      const fileType = format === 'audio' ? 'audio' : 'vidéo';
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: `Enregistrer la ${fileType} en tant que`,
        defaultPath: `${fileType}.${fileExtension}`,
        filters: [
          format === 'audio' 
            ? { name: 'Fichiers audio', extensions: ['mp3', 'm4a', 'wav'] }
            : { name: 'Fichiers vidéo', extensions: ['mp4', 'mkv', 'avi'] }
        ]
      });

      if (canceled || !filePath) {
        event.reply('download-cancelled', 'Téléchargement annulé par l\'utilisateur.');
        return;
      }
      outputFilePath = filePath;
      event.reply('download-progress', 'Début du téléchargement...');
      console.log(`Tentative de téléchargement de ${format} pour: ${url} vers ${outputFilePath}`);
    }
    
    let execArgs;
    if (format === 'audio') {
      execArgs = [
        url,
        '-f', 'bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputFilePath,
        '--progress'
      ];
    } else {
      execArgs = [
        url,
        '-f', 'bestvideo[fps<=60]+bestaudio/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', outputFilePath,
        '--progress'
      ];
    }

    // Ensure we have the latest ffmpeg path
    const currentFfmpegPath = await ensureFfmpegBinary();
    if (currentFfmpegPath) {
      execArgs.push('--ffmpeg-location', currentFfmpegPath);
    }

    await ytDlpWrap.exec(execArgs)
    .on('progress', (progress) => {
      console.log('[Main Process] RAW yt-dlp progress event:', JSON.stringify(progress));
      event.reply('download-progress', progress);

      if (!conversionSignalSent && progress && typeof progress.percent === 'string') {
        const currentPercent = parseFloat(progress.percent.replace('%',''));
        if (currentPercent >= 99.5) {
          console.log('[Main Process] Download reported as essentially complete (>=99.5%)');
          downloadReportedAsMostlyComplete = true; 
          console.log('[Main Process] conversion-phase-started sent (triggered by download >=99.5% completion).');
          event.reply('conversion-phase-started');
          conversionSignalSent = true;
        }
      }
    })
    .on('ytDlpEvent', (eventType, eventData) => {
      console.log(`[ytDlpEvent] ${eventType}: ${eventData}`);
    })
    .on('error', (error) => {
      console.error('Error during download:', error);
      event.reply('download-error', `Error: ${error.message || 'Unknown error'}`);
    })
    .on('close', () => {
      console.log('[Main Process] yt-dlp process close event fired.');
      if (!conversionSignalSent) {
        console.warn('[Main Process] \'close\' event: conversion-phase-started was missed. Sending now.');
        event.reply('conversion-phase-started');
      }
      
      setTimeout(() => {
        const finalMessage = downloadPath 
            ? `Téléchargement terminé. ${format === 'audio' ? 'Audio' : 'Vidéo'} enregistré dans ${downloadPath}. (Le nom du fichier est basé sur le titre de la vidéo)`
            : `Téléchargement terminé: ${outputFilePath}`;
        console.log(`[Main Process] Sending download-complete. URL: ${url}`);
        event.reply('download-complete', finalMessage);
      }, 3500);
    });

  } catch (error) {
    console.error('yt-dlp execution error:', error);
    event.reply('download-error', `Failed to download ${format}: ${error.message || 'Unknown error'}`);
  }
});

ipcMain.handle('search-youtube', async (event, query, maxResults = 5) => {
  try {
    if (!query || !query.trim()) {
      return { error: 'Please enter a search query.' };
    }

    // Ensure we have a valid yt-dlp binary before proceeding
    const binaryPath = await ensureYtDlpBinary();
    if (!binaryPath) {
      return { error: 'Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.' };
    }

    // Update ytDlpWrap to use the correct binary path
    ytDlpWrap.setBinaryPath(binaryPath);

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