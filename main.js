const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const Store = require('electron-store');
const os = require('os');
const https = require('https');
const { execSync, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const store = new Store();
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

// i18n: Load translation JSON files from locales directory
function loadTranslation(lang) {
  try {
    const filePath = path.join(__dirname, 'locales', lang, 'translation.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[i18n] Failed to load locale ${lang}:`, error.message);
    return null;
  }
}

function getTranslationBundle(lang) {
  const data = loadTranslation(lang);
  return data && data.translation ? data.translation : null;
}

// Get stored language or default to 'fr'
function getStoredLanguage() {
  return store.get('language', 'fr');
}

// Store language preference
function setStoredLanguage(lang) {
  store.set('language', lang);
}

// Toggle verbose download logging (progress, yt-dlp events, etc.)
const ENABLE_DOWNLOAD_LOGS = false;

// Auto-update state
let autoUpdaterInitialized = false;
let updateCheckTriggered = false;

function setupAutoUpdater(mainWindow) {
  if (autoUpdaterInitialized) {
    return;
  }

  if (!app.isPackaged) {
    console.log('[AutoUpdate] Skipping auto-updater in development mode.');
    return;
  }

  autoUpdaterInitialized = true;

  try {
    autoUpdater.autoDownload = false; // Only download when user accepts
  } catch (error) {
    console.error('[AutoUpdate] Failed to configure auto-updater:', error);
  }

  const sendToRendererSafe = (channel, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(channel, payload);
  };

  autoUpdater.on('update-available', (info) => {
    const skippedVersion = store.get('skippedUpdateVersion');
    if (skippedVersion && info && info.version === skippedVersion) {
      console.log(`[AutoUpdate] Update ${info.version} was previously skipped; ignoring.`);
      return;
    }

    console.log('[AutoUpdate] Update available:', info.version);
    sendToRendererSafe('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      currentVersion: app.getVersion()
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdate] No update available.');
    sendToRendererSafe('update-not-available', {
      currentVersion: app.getVersion()
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRendererSafe('update-download-progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdate] Update downloaded:', info.version);
    sendToRendererSafe('update-downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes || ''
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdate] Error:', error);
    sendToRendererSafe('update-error', {
      message: error && error.message ? error.message : String(error || 'Unknown error')
    });
  });

  ipcMain.handle('update-check-now', async () => {
    if (!app.isPackaged) {
      console.log('[AutoUpdate] Ignoring update check; app is not packaged.');
      return { started: false, reason: 'not-packaged' };
    }
    if (updateCheckTriggered) {
      return { started: false, reason: 'already-started' };
    }

    updateCheckTriggered = true;
    try {
      await autoUpdater.checkForUpdates();
      return { started: true };
    } catch (error) {
      console.error('[AutoUpdate] Failed to check for updates:', error);
      return { started: false, reason: 'error', message: error.message || String(error) };
    }
  });

  ipcMain.handle('update-start-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { started: true };
    } catch (error) {
      console.error('[AutoUpdate] Failed to start update download:', error);
      return { started: false, message: error.message || String(error) };
    }
  });

  ipcMain.handle('update-skip-version', (_event, version) => {
    if (version) {
      store.set('skippedUpdateVersion', version);
      console.log('[AutoUpdate] User chose to skip version', version);
    }
    return { success: true };
  });

  ipcMain.handle('update-install-now', () => {
    console.log('[AutoUpdate] Installing update and quitting...');
    autoUpdater.quitAndInstall();
    return { success: true };
  });
}

// Function to download yt-dlp FFmpeg binary if not found
async function ensureFfmpegBinary() {
  try {
    let ffmpegPath;
    const ffmpegExecutableName = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    
    // Use app data directory for persistent storage across sessions
    const { app } = require('electron');
    const appDataDir = app.getPath('userData');
    const binariesDir = path.join(appDataDir, 'binaries');
    
    // Ensure binaries directory exists
    if (!fs.existsSync(binariesDir)) {
      fs.mkdirSync(binariesDir, { recursive: true });
    }
    
    ffmpegPath = path.join(binariesDir, ffmpegExecutableName);
    
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
    
    // Use app data directory for persistent storage
    const { app } = require('electron');
    const appDataDir = app.getPath('userData');
    const binariesDir = path.join(appDataDir, 'binaries');
    const downloadPath = path.join(appDataDir, `ffmpeg-${platform}-${arch}.${isZip ? 'zip' : 'tar.xz'}`);
    
    if (!fs.existsSync(binariesDir)) {
      fs.mkdirSync(binariesDir, { recursive: true });
    }
    
    console.log(`[Main Process] Downloading from: ${url}`);
    
    // Download the file
    await downloadFile(url, downloadPath);
    console.log('[Main Process] FFmpeg download completed');
    
    // Extract the file
    if (isZip) {
      await extractZip(downloadPath, binariesDir);
    } else {
      await extractTarXz(downloadPath, binariesDir);
    }
    
    // Set executable permissions on Unix systems
    const ffmpegExecutableName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegPath = path.join(binariesDir, ffmpegExecutableName);
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
  // First check if we have a system or user-installed yt-dlp
  if (ytDlpBinaryPath && fs.existsSync(ytDlpBinaryPath)) {
    console.log('[Main Process] yt-dlp binary found at:', ytDlpBinaryPath);
    return ytDlpBinaryPath;
  }

  // Check if we have a downloaded yt-dlp in our persistent directory
  try {
    const { app } = require('electron');
    const appDataDir = app.getPath('userData');
    const binariesDir = path.join(appDataDir, 'binaries');
    
    // Ensure binaries directory exists
    if (!fs.existsSync(binariesDir)) {
      fs.mkdirSync(binariesDir, { recursive: true });
    }
    
    const binaryPath = path.join(binariesDir, ytDlpExecutableName);
    
    // Check if we already have it downloaded
    if (fs.existsSync(binaryPath)) {
      console.log('[Main Process] yt-dlp binary found in app data at:', binaryPath);
      return binaryPath;
    }
    
    console.log('[Main Process] yt-dlp binary not found, attempting to download...');
    
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
let ytDlpWrap = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap();
let currentBinaryPath = ytDlpBinaryPath;
console.log('[Main Process] yt-dlp binary path used for YTDlpWrap init:', ytDlpBinaryPath || 'default (not found, relying on PATH)');

// Track if we're in the middle of cleanup to prevent EBUSY errors
let isCleaningUp = false;
let cleanupPromise = null;
let needsNewInstance = false;

// Helper function to get or create a fresh ytDlpWrap instance
function getYtDlpWrap(binaryPath) {
  // If binary path changed (e.g., downloaded during runtime), create new instance
  if (binaryPath && binaryPath !== currentBinaryPath) {
    console.log('[YTDLP] Binary path changed from', currentBinaryPath, 'to', binaryPath);
    console.log('[YTDLP] Creating fresh ytDlpWrap instance with new binary path');
    ytDlpWrap = new YTDlpWrap(binaryPath);
    currentBinaryPath = binaryPath;
    needsNewInstance = false;
  }
  // If we need a new instance (after error/cancel), create one
  else if (needsNewInstance) {
    console.log('[YTDLP] Creating fresh ytDlpWrap instance after error/cancel');
    ytDlpWrap = binaryPath ? new YTDlpWrap(binaryPath) : new YTDlpWrap();
    currentBinaryPath = binaryPath;
    needsNewInstance = false;
  }
  return ytDlpWrap;
}

// Helper function to wait for cleanup to complete
async function waitForCleanup() {
  if (isCleaningUp && cleanupPromise) {
    console.log('[CLEANUP] Waiting for previous cleanup to complete...');
    await cleanupPromise;
  }
}

// Helper function to perform cleanup after cancellation
function performCleanup() {
  if (!isCleaningUp) {
    isCleaningUp = true;
    needsNewInstance = true; // Mark that we need a new instance
    cleanupPromise = new Promise(resolve => {
      // Give yt-dlp-wrap time to clean up internal state
      setTimeout(() => {
        isCleaningUp = false;
        cleanupPromise = null;
        console.log('[CLEANUP] Cleanup complete, ready for new operations');
        resolve();
      }, 500); // 500ms delay to allow proper cleanup
    });
  }
  return cleanupPromise;
}

// Add IPC handler to check yt-dlp availability
ipcMain.handle('check-yt-dlp-availability', async () => {
  try {
    const binaryPath = await ensureYtDlpBinary();
    if (binaryPath) {
      // Get a fresh ytDlpWrap instance if binary path changed
      getYtDlpWrap(binaryPath);
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

// IPC handler to download yt-dlp binary with progress
ipcMain.handle('download-yt-dlp-binary', async (event) => {
  try {
    const binaryPath = await ensureYtDlpBinary();
    if (binaryPath) {
      // Get a fresh ytDlpWrap instance if binary path changed
      getYtDlpWrap(binaryPath);
      return { success: true, path: binaryPath };
    } else {
      return { success: false, error: 'Failed to download yt-dlp binary' };
    }
  } catch (error) {
    console.error('[Main Process] Error downloading yt-dlp binary:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler to download ffmpeg binary with progress
ipcMain.handle('download-ffmpeg-binary', async (event) => {
  try {
    const binaryPath = await downloadFfmpegBinary();
    if (binaryPath) {
      return { success: true, path: binaryPath };
    } else {
      return { success: false, error: 'Failed to download ffmpeg binary' };
    }
  } catch (error) {
    console.error('[Main Process] Error downloading ffmpeg binary:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler to cancel active download
ipcMain.handle('cancel-download', async (event) => {
  try {
    console.error('═══════════════════════════════════════════════════════');
    console.error('[CANCEL] Cancel request received');
    
    let processId = event.sender.downloadProcessId;
    console.error('[CANCEL] ProcessId from sender:', processId);
    console.error('[CANCEL] Active downloads count:', activeDownloadProcesses.size);
    console.error('[CANCEL] Active download IDs:', Array.from(activeDownloadProcesses.keys()));
    console.error('[CANCEL] WebContents ID:', event.sender.id);
    
    // If no processId, try to find any active download for this WebContents
    if (!processId && activeDownloadProcesses.size > 0) {
      // Find the most recent process (highest processId number)
      const processIds = Array.from(activeDownloadProcesses.keys());
      processId = Math.max(...processIds);
      console.error('[CANCEL] No processId found, using most recent:', processId);
      // Update the sender's processId
      event.sender.downloadProcessId = processId;
    }
    
    if (!processId) {
      console.error('[CANCEL] ERROR: No processId found and no active downloads');
      return { success: false, message: 'No active download process ID found' };
    }
    
    if (!activeDownloadProcesses.has(processId)) {
      console.error('[CANCEL] WARNING: ProcessId not found in activeDownloadProcesses map');
      // Try to find any active download
      if (activeDownloadProcesses.size > 0) {
        const firstProcessId = Array.from(activeDownloadProcesses.keys())[0];
        console.error('[CANCEL] Trying to cancel first active download:', firstProcessId);
        processId = firstProcessId;
        event.sender.downloadProcessId = processId;
      } else {
        console.error('[CANCEL] ERROR: No active downloads found');
        return { success: false, message: 'No active download to cancel' };
      }
    }
    
    const processInfo = activeDownloadProcesses.get(processId);
    console.error('[CANCEL] Process info found:');
    console.error('  - hasProcess:', !!processInfo.process);
    console.error('  - hasEventEmitter:', !!processInfo.eventEmitter);
    console.error('  - processPid:', processInfo.processPid);
    console.error('  - processType:', processInfo.process ? typeof processInfo.process : 'none');
    if (processInfo.eventEmitter) {
      console.error('  - eventEmitter keys:', Object.keys(processInfo.eventEmitter).slice(0, 10));
    }
    
    // Try to kill the yt-dlp process
    let killed = false;
    
    // First, try using the process PID if available (most reliable)
    if (processInfo.processPid && !killed) {
      try {
        if (os.platform() === 'win32') {
          // Windows: use taskkill
          execSync(`taskkill /PID ${processInfo.processPid} /T /F`, { stdio: 'ignore' });
        } else {
          // Unix: use process.kill with PID
          const { kill } = require('process');
          kill(processInfo.processPid, 'SIGTERM');
        }
        killed = true;
        console.error('[CANCEL] ✓ SUCCESS: Process killed via PID:', processInfo.processPid);
      } catch (killError) {
        console.error('[CANCEL] ✗ Failed to kill via PID:', killError.message);
      }
    }
    
    // Try to access the child process from the event emitter
    if (!killed && processInfo.eventEmitter) {
      try {
        // Check all possible property names where the child process might be stored
    const possibleProcessProps = [
      'spawnedProcess',
      'childProcess',
      'process',
      '_process',
      'spawnProcess',
      'ytDlpProcess'
    ];
        
        for (const prop of possibleProcessProps) {
          if (processInfo.eventEmitter[prop] && typeof processInfo.eventEmitter[prop].kill === 'function') {
            const childProc = processInfo.eventEmitter[prop];
            if (!childProc.killed) {
              childProc.kill('SIGTERM');
              killed = true;
              console.error(`[CANCEL] ✓ SUCCESS: Process killed via ${prop}`);
              break;
            }
          }
        }
      } catch (killError) {
        console.error('[CANCEL] ✗ Failed to kill via event emitter:', killError.message);
      }
    }
    
    // Try killing the stored process reference
    if (!killed && processInfo.process) {
      try {
        if (typeof processInfo.process.kill === 'function' && !processInfo.process.killed) {
          processInfo.process.kill('SIGTERM');
          killed = true;
          console.error('[CANCEL] ✓ SUCCESS: Process killed via stored process reference');
        }
      } catch (killError) {
        console.error('[CANCEL] ✗ Failed to kill via stored process:', killError.message);
      }
    }
    
    // Clean up partial/temporary files
    if (processInfo.outputPath) {
      console.error('[CANCEL] Cleaning up partial and output files for:', processInfo.outputPath);
      
      try {
        // Handle template paths like %(title)s.%(ext)s
        if (processInfo.outputPath.includes('%(title)s') || processInfo.outputPath.includes('%(ext)s')) {
          // For directory output with template, we need to find and delete all related files
          const outputDir = path.dirname(processInfo.outputPath);
          
          if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            
            // Get current timestamp to identify recently created files
            const cancelTime = Date.now();
            const timeThreshold = 5 * 60 * 1000; // 5 minutes
            
            // Delete common partial/temp file patterns AND actual output files created by yt-dlp
            const patterns = [
              /\.part$/,           // .part files (partial downloads)
              /\.ytdl$/,           // .ytdl files (yt-dlp temp)
              /\.temp\./,          // .temp.* files
              /\.f\d+\./,          // fragment files like .f123.mp4
              /\.webm$/,           // temporary webm files
              /\.m4a$/,            // temporary audio files before conversion
              /\.mp3$/,            // actual MP3 files (could be corrupted)
              /\.mp4$/,            // actual MP4 files (could be corrupted)
              /\.mkv$/,            // actual MKV files (could be corrupted)
              /\.avi$/,            // actual AVI files (could be corrupted)
              /\.wav$/,            // actual WAV files (could be corrupted)
            ];
            
            files.forEach(file => {
              const fullPath = path.join(outputDir, file);
              const shouldDelete = patterns.some(pattern => pattern.test(file));
              
              if (shouldDelete) {
                try {
                  // Check if file was created recently (within the threshold)
                  const stats = fs.statSync(fullPath);
                  const fileAge = cancelTime - stats.mtimeMs;
                  
                  if (fileAge < timeThreshold) {
                    fs.unlinkSync(fullPath);
                    console.error('[CANCEL] Deleted file:', file);
                  } else {
                    console.error('[CANCEL] Skipping old file:', file);
                  }
                } catch (deleteError) {
                  console.error('[CANCEL] Could not delete file:', file, deleteError.message);
                }
              }
            });
          }
        } else {
          // Specific file path - delete the actual output file and all related files
          const filesToDelete = [
            processInfo.outputPath,              // The actual output file (.mp3, .mp4, etc.)
            processInfo.outputPath + '.part',    // Partial download
            processInfo.outputPath + '.ytdl',    // yt-dlp temp
            processInfo.outputPath + '.temp',    // Temp file
          ];
          
          // Also check for intermediate files (before ffmpeg conversion)
          const dir = path.dirname(processInfo.outputPath);
          const basename = path.basename(processInfo.outputPath, path.extname(processInfo.outputPath));
          const ext = path.extname(processInfo.outputPath);
          
          // Add potential intermediate files with different extensions
          const intermediateExtensions = ['.webm', '.m4a', '.mkv', '.avi', '.wav'];
          intermediateExtensions.forEach(intermediateExt => {
            if (intermediateExt !== ext) {
              filesToDelete.push(path.join(dir, basename + intermediateExt));
            }
          });
          
          // Add fragment files
          filesToDelete.push(path.join(dir, basename + '.f*'));
          
          filesToDelete.forEach(filePath => {
            if (filePath.includes('*')) {
              // Handle glob patterns
              const dirPath = path.dirname(filePath);
              const pattern = path.basename(filePath);
              if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                const regex = new RegExp(pattern.replace('*', '.*'));
                files.forEach(file => {
                  if (regex.test(file)) {
                    try {
                      fs.unlinkSync(path.join(dirPath, file));
                      console.error('[CANCEL] Deleted file:', file);
                    } catch (deleteError) {
                      console.error('[CANCEL] Could not delete file:', file, deleteError.message);
                    }
                  }
                });
              }
            } else if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
                console.error('[CANCEL] Deleted file:', path.basename(filePath));
              } catch (deleteError) {
                console.error('[CANCEL] Could not delete:', filePath, deleteError.message);
              }
            }
          });
        }
      } catch (cleanupError) {
        console.error('[CANCEL] Error during file cleanup:', cleanupError.message);
      }
    }
    
    // Clean up
    activeDownloadProcesses.delete(processId);
    event.sender.downloadProcessId = null;
    
    // Send cancellation event to renderer
    event.sender.send('download-cancelled', 'Téléchargement annulé par l\'utilisateur.');
    
    if (killed) {
      console.error('[CANCEL] ✓✓✓ Download cancelled successfully ✓✓✓');
    } else {
      console.error('[CANCEL] ⚠⚠⚠ Could not kill process, but marked as cancelled ⚠⚠⚠');
    }
    console.error('═══════════════════════════════════════════════════════');
    
    // Trigger cleanup to prevent EBUSY errors on next operation
    performCleanup();
    
    return { success: true };
  } catch (error) {
    console.error('[CANCEL] ✗✗✗ ERROR cancelling download:', error);
    
    // Clean up even on error to prevent "busy" state
    if (processId && activeDownloadProcesses.has(processId)) {
      activeDownloadProcesses.delete(processId);
      event.sender.downloadProcessId = null;
      console.error('[CANCEL] Cleaned up process map despite error');
    }
    
    console.error('═══════════════════════════════════════════════════════');
    return { success: false, error: error.message };
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

// i18n: IPC handlers for translations
// Synchronous handler for initial load (called during preload)
ipcMain.on('get-initial-translations', (event) => {
  const lang = getStoredLanguage();
  const translation = getTranslationBundle(lang);
  event.returnValue = {
    language: lang,
    translation: translation || {}
  };
});

// Async handler for language changes
ipcMain.handle('get-translation-bundle', (_event, lang) => {
  const translation = getTranslationBundle(lang);
  if (translation) {
    setStoredLanguage(lang);
    return {
      language: lang,
      translation: translation
    };
  }
  return null;
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

  // Initialize auto-updater and wire events to this window
  setupAutoUpdater(mainWindow);

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
  // Clean up all active downloads before quitting
  activeDownloadProcesses.forEach((processInfo, processId) => {
    let killed = false;
    
    // Try killing via child process
    if (processInfo.process && typeof processInfo.process.kill === 'function') {
      try {
        if (!processInfo.process.killed) {
          processInfo.process.kill('SIGTERM');
          killed = true;
        }
      } catch (error) {
        console.warn('[Main Process] Could not kill process on app close:', error.message);
      }
    }
    
    // Try killing via event emitter
    if (!killed && processInfo.eventEmitter) {
      try {
        if (processInfo.eventEmitter.spawnedProcess) {
          processInfo.eventEmitter.spawnedProcess.kill('SIGTERM');
        } else if (processInfo.eventEmitter.childProcess) {
          processInfo.eventEmitter.childProcess.kill('SIGTERM');
        }
      } catch (error) {
        console.warn('[Main Process] Could not kill via event emitter on app close:', error.message);
      }
    }
    
    if (killed) {
      console.log('[Main Process] Killed download process on app close');
    }
  });
  activeDownloadProcesses.clear();
  
  if (process.platform !== 'darwin') app.quit();
});

// Handle app quit - cleanup all processes
app.on('before-quit', () => {
  activeDownloadProcesses.forEach((processInfo, processId) => {
    let killed = false;
    
    // Try killing via child process
    if (processInfo.process && typeof processInfo.process.kill === 'function') {
      try {
        if (!processInfo.process.killed) {
          processInfo.process.kill('SIGTERM');
          killed = true;
        }
      } catch (error) {
        console.warn('[Main Process] Could not kill process on app quit:', error.message);
      }
    }
    
    // Try killing via event emitter
    if (!killed && processInfo.eventEmitter) {
      try {
        if (processInfo.eventEmitter.spawnedProcess) {
          processInfo.eventEmitter.spawnedProcess.kill('SIGTERM');
        } else if (processInfo.eventEmitter.childProcess) {
          processInfo.eventEmitter.childProcess.kill('SIGTERM');
        }
      } catch (error) {
        console.warn('[Main Process] Could not kill via event emitter on app quit:', error.message);
      }
    }
    
    if (killed) {
      console.log('[Main Process] Killed download process on app quit');
    }
  });
  activeDownloadProcesses.clear();
});

ipcMain.on('download-audio', async (event, url, downloadPath, playlistMode = 'single') => {
  if (!url || !url.trim()) {
    event.reply('download-error', 'Please enter a valid URL.');
    return;
  }

  // Wait for any cleanup to complete before starting new operation
  await waitForCleanup();

  // Check if there's already an active download
  if (activeDownloadProcesses.size > 0) {
    console.error('[DOWNLOAD] ERROR: Another download is already in progress');
    event.reply('download-error', 'Un téléchargement est déjà en cours. Veuillez attendre qu\'il se termine.');
    return;
  }

  // Ensure we have a valid yt-dlp binary before proceeding
  const binaryPath = await ensureYtDlpBinary();
  if (!binaryPath) {
    event.reply('download-error', 'Error: Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.');
    return;
  }

  let outputFilePath;
  let conversionSignalSent = false;
  let downloadReportedAsMostlyComplete = false;
  const processId = Date.now() + Math.random(); // Unique ID for this download
  event.sender.downloadProcessId = processId;
  const isPlaylistDownload = playlistMode === 'playlist';
  let currentItemIndex = 1;
  let totalItems = 1;
  let currentItemTitle = null;

  try {
    if (downloadPath && fs.existsSync(downloadPath)) {
      outputFilePath = path.join(downloadPath, '%(title)s.%(ext)s');
      event.reply('download-progress', `Preparing to download to: ${downloadPath}`);
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log(`Attempting to download audio for: ${url} to directory ${downloadPath} with template %(title)s.%(ext)s`);
      }
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
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log(`Tentative de téléchargement de l'audio pour: ${url} vers ${outputFilePath}`);
      }
    }
    
    const execArgs = [
      url,
      '-f', 'bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
    ];

    // For single-video mode, explicitly avoid playlist behavior
    if (playlistMode !== 'playlist') {
      execArgs.push('--no-playlist', '--playlist-items', '1');
    }

    execArgs.push('-o', outputFilePath, '--progress');

    // Ensure we have the latest ffmpeg path
    const currentFfmpegPath = await ensureFfmpegBinary();
    if (currentFfmpegPath) {
      execArgs.push('--ffmpeg-location', currentFfmpegPath);
    }

    // Get a fresh ytDlpWrap instance if needed
    const ytDlp = getYtDlpWrap(binaryPath);
    const downloadProcess = ytDlp.exec(execArgs);
    
    // Try to access the underlying child process
    // yt-dlp-wrap may expose it as spawnedProcess or childProcess
    let childProcess = null;
    const possibleProps = ['spawnedProcess', 'childProcess', 'process', '_process', 'spawnProcess', 'ytDlpProcess'];
    
    for (const prop of possibleProps) {
      if (downloadProcess[prop] && typeof downloadProcess[prop].kill === 'function') {
        childProcess = downloadProcess[prop];
        if (ENABLE_DOWNLOAD_LOGS) {
          console.error('[DOWNLOAD] Found child process at property:', prop);
        }
        break;
      }
    }
    
    // Store process reference for cancellation
    // Also try to get the PID if available
    let processPid = null;
    if (childProcess && childProcess.pid) {
      processPid = childProcess.pid;
    } else if (downloadProcess.pid) {
      processPid = downloadProcess.pid;
    }
    
    activeDownloadProcesses.set(processId, {
      process: childProcess,
      eventEmitter: downloadProcess,
      processPid: processPid,
      url: url,
      outputPath: outputFilePath
    });
    
    if (ENABLE_DOWNLOAD_LOGS) {
      console.error('[DOWNLOAD] Started. ProcessId:', processId, 'PID:', processPid);
    }

    await downloadProcess
    .on('progress', (progress) => {
      if (ENABLE_DOWNLOAD_LOGS && progress && typeof progress.percent === 'string') {
        const percent = parseFloat(progress.percent.replace('%', ''));
        if (percent % 10 === 0 || percent >= 99) {
          console.log(`[Main Process] Download progress: ${progress.percent}`);
        }
      }
      event.reply('download-progress', progress);

      if (!conversionSignalSent && progress && typeof progress.percent === 'string') {
        const currentPercent = parseFloat(progress.percent.replace('%',''));
        if (currentPercent >= 99.5) {
          if (ENABLE_DOWNLOAD_LOGS) {
            console.log('[Main Process] Download reported as essentially complete (>=99.5%).');
            console.log('[Main Process] conversion-phase-started sent (triggered by download >=99.5% completion).');
          }
          downloadReportedAsMostlyComplete = true; 
          event.reply('conversion-phase-started');
          conversionSignalSent = true;
        }
      }
    })
    .on('ytDlpEvent', (eventType, eventData) => {
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log(`[ytDlpEvent] ${eventType}: ${eventData}`);
      }

      // For playlist downloads, try to detect the current item and its title
      if (!isPlaylistDownload || typeof eventData !== 'string') {
        return;
      }

      // Update current/total item indices from "Downloading item X of Y" lines
      const itemMatch = eventData.match(/Downloading item\s+(\d+)\s+of\s+(\d+)/i);
      if (itemMatch) {
        currentItemIndex = parseInt(itemMatch[1], 10) || currentItemIndex;
        totalItems = parseInt(itemMatch[2], 10) || totalItems;
      }

      // Extract the file name from "Destination: ..." lines to infer the title
      const destMatch = eventData.match(/Destination:\s*(.+)$/i);
      if (destMatch) {
        const fullPath = destMatch[1].trim();
        const baseName = path.basename(fullPath);
        // Strip the extension to get a clean title
        currentItemTitle = baseName.replace(/\.[^/.]+$/, '');

        event.reply('playlist-item-update', {
          index: currentItemIndex,
          total: totalItems,
          title: currentItemTitle
        });
      }
    })
    .on('error', (error) => {
      console.error('Error during download:', error);
      // Clean up process reference on error
      activeDownloadProcesses.delete(processId);
      event.sender.downloadProcessId = null;
      event.reply('download-error', `Error: ${error.message || 'Unknown error'}`);
      // Trigger cleanup to prevent EBUSY errors on next operation
      performCleanup();
    })
    .on('close', (code) => {
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log('[Main Process] yt-dlp process close event fired. Exit code:', code);
      }
      
      // Clean up process reference
      activeDownloadProcesses.delete(processId);
      event.sender.downloadProcessId = null;
      
      // If process was killed (cancelled), don't send completion
      if (code === null || code === 143 || code === 'SIGTERM') {
        if (ENABLE_DOWNLOAD_LOGS) {
          console.log('[Main Process] Download was cancelled');
        }
        return;
      }
      
      // Fallback: If signal somehow wasn't sent, send it now.
      if (!conversionSignalSent) {
        if (ENABLE_DOWNLOAD_LOGS) {
          console.warn('[Main Process] \'close\' event: conversion-phase-started was missed. Sending now.');
        }
        event.reply('conversion-phase-started');
        // conversionSignalSent = true; // Not strictly needed here as it's the end, but good practice
      }
      
      // IMPORTANT: Delay sending 'download-complete' to allow the renderer's 
      // conversion simulation (e.g., 3 seconds) to visually complete.
      setTimeout(() => {
        const finalMessage = downloadPath 
            ? `Téléchargement terminé. Audio enregistré dans ${downloadPath}. (Le nom du fichier est basé sur le titre de la vidéo)`
            : `Téléchargement terminé: ${outputFilePath}`;
        if (ENABLE_DOWNLOAD_LOGS) {
          console.log(`[Main Process] Sending download-complete. URL: ${url}`);
        }
        event.reply('download-complete', finalMessage);
      }, 3500); // Give renderer ~3.5s (simulation is 3s)
    });

  } catch (error) {
    console.error('yt-dlp execution error:', error);
    activeDownloadProcesses.delete(processId);
    event.sender.downloadProcessId = null;
    event.reply('download-error', `Failed to download audio: ${error.message || 'Unknown error'}`);
    
    // Trigger cleanup to prevent EBUSY errors on next operation
    performCleanup();
  }
});

// Store active video info processes to allow cancellation
const activeVideoInfoProcesses = new Map();

// Store active download processes to allow cancellation
const activeDownloadProcesses = new Map();

ipcMain.handle('get-video-info', async (event, url) => {
  try {
    if (!url || !url.trim()) {
      return { error: 'Please provide a valid URL.' };
    }

    // Wait for any cleanup to complete before starting new operation
    await waitForCleanup();

    // Ensure we have a valid yt-dlp binary before proceeding
    const binaryPath = await ensureYtDlpBinary();
    if (!binaryPath) {
      return { error: 'Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.' };
    }

    console.log(`Getting video info for: ${url}`);
    
    return new Promise((resolve) => {
      const processId = Date.now() + Math.random(); // Unique ID for this process
      let isResolved = false;

      // Configure a timeout so we don't hang forever on problematic URLs
      const timeoutMs = 15000; // 15 seconds
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          activeVideoInfoProcesses.delete(processId);
          console.warn('[Main Process] Video info request timed out');
          resolve({
            error: 'La récupération des informations de la vidéo est trop longue ou a échoué.',
            timeout: true
          });
        }
      }, timeoutMs);
      
      // Get a fresh ytDlpWrap instance if needed
      const ytDlp = getYtDlpWrap(binaryPath);
      
      // Use execPromise for reliable output capture
      const promise = ytDlp.execPromise([
          url.trim(),
          '--print', '%(title)s',
          '--no-download',
          '--no-playlist',      // Avoid processing entire playlists/radios
          '--playlist-items', '1', // If treated as playlist, only take first item
          '--encoding', 'utf-8'
        ])
        .then(output => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            activeVideoInfoProcesses.delete(processId);
            const title = output.trim();
            console.log('Video title retrieved:', title);
            resolve({ title: title });
          }
        })
        .catch(error => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
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
            clearTimeout(timeoutId);
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

ipcMain.handle('get-playlist-info', async (event, url) => {
  try {
    if (!url || !url.trim()) {
      return { error: 'Please provide a valid URL.' };
    }

    // Wait for any cleanup to complete before starting new operation
    await waitForCleanup();

    // Ensure we have a valid yt-dlp binary before proceeding
    const binaryPath = await ensureYtDlpBinary();
    if (!binaryPath) {
      return { error: 'Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.' };
    }

    console.log(`Getting playlist info for: ${url}`);

    const ytDlp = getYtDlpWrap(binaryPath);
    const output = await ytDlp.execPromise([
      url.trim(),
      '--flat-playlist',
      '--dump-single-json',
      '--no-download',
      '--quiet',
      '--no-warnings',
      '--encoding', 'utf-8'
    ]);

    let playlistJson;
    try {
      playlistJson = JSON.parse(output);
    } catch (parseError) {
      console.error('[Main Process] Failed to parse playlist JSON:', parseError);
      console.error('[Main Process] Raw yt-dlp output (truncated):', String(output).slice(0, 500));
      return {
        error: 'Impossible de lire les informations de la playlist (JSON invalide renvoyé par yt-dlp).'
      };
    }

    const items = [];

    if (playlistJson && Array.isArray(playlistJson.entries)) {
      playlistJson.entries.forEach(entry => {
        if (!entry) return;

        const title = entry.title || 'Sans titre';
        let itemUrl = entry.url || entry.webpage_url || '';

        // If url looks like just an ID, convert it to a full watch URL
        if ((!itemUrl || !itemUrl.includes('://')) && (entry.id || entry.url)) {
          const idCandidate = entry.id || entry.url;
          if (typeof idCandidate === 'string' && idCandidate.length === 11 && !idCandidate.includes('://')) {
            itemUrl = `https://www.youtube.com/watch?v=${idCandidate}`;
          } else if (typeof idCandidate === 'string') {
            itemUrl = idCandidate;
          }
        }

        items.push({
          title,
          url: itemUrl || ''
        });
      });
    }

    return { items };
  } catch (error) {
    console.error('[Main Process] Error getting playlist info:', error);
    return {
      error: `Failed to get playlist info: ${error.message || 'Unknown error'}`,
      stack: error.stack
    };
  }
});

ipcMain.on('download-media', async (event, url, downloadPath, format, playlistMode = 'single') => {
  if (!url || !url.trim()) {
    event.reply('download-error', 'Please enter a valid URL.');
    return;
  }

  // Wait for any cleanup to complete before starting new operation
  await waitForCleanup();

  // Check if there's already an active download
  if (activeDownloadProcesses.size > 0) {
    console.error('[DOWNLOAD] ERROR: Another download is already in progress');
    event.reply('download-error', 'Un téléchargement est déjà en cours. Veuillez attendre qu\'il se termine.');
    return;
  }

  // Ensure we have a valid yt-dlp binary before proceeding
  const binaryPath = await ensureYtDlpBinary();
  if (!binaryPath) {
    event.reply('download-error', 'Error: Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.');
    return;
  }

  let outputFilePath;
  let conversionSignalSent = false;
  let downloadReportedAsMostlyComplete = false;
  const processId = Date.now() + Math.random(); // Unique ID for this download
  event.sender.downloadProcessId = processId;
  const isPlaylistDownload = playlistMode === 'playlist';
  let currentItemIndex = 1;
  let totalItems = 1;
  let currentItemTitle = null;

  try {
    if (downloadPath && fs.existsSync(downloadPath)) {
      outputFilePath = path.join(downloadPath, '%(title)s.%(ext)s');
      event.reply('download-progress', `Preparing to download to: ${downloadPath}`);
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log(`Attempting to download ${format} for: ${url} to directory ${downloadPath} with template %(title)s.%(ext)s`);
      }
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
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log(`Tentative de téléchargement de ${format} pour: ${url} vers ${outputFilePath}`);
      }
    }
    
    let execArgs;
    if (format === 'audio') {
      execArgs = [
        url,
        '-f', 'bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
      ];
    } else {
      execArgs = [
        url,
        '-f', 'bestvideo[fps<=60]+bestaudio/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
      ];
    }

    // For single-video mode, explicitly avoid playlist behavior
    if (playlistMode !== 'playlist') {
      execArgs.push('--no-playlist', '--playlist-items', '1');
    }

    execArgs.push('-o', outputFilePath, '--progress');

    // Ensure we have the latest ffmpeg path
    const currentFfmpegPath = await ensureFfmpegBinary();
    if (currentFfmpegPath) {
      execArgs.push('--ffmpeg-location', currentFfmpegPath);
    }

    // Get a fresh ytDlpWrap instance if needed
    const ytDlp = getYtDlpWrap(binaryPath);
    const downloadProcess = ytDlp.exec(execArgs);
    
    // Try to access the underlying child process
    // yt-dlp-wrap may expose it as spawnedProcess or childProcess
    let childProcess = null;
    const possibleProps = ['spawnedProcess', 'childProcess', 'process', '_process', 'spawnProcess', 'ytDlpProcess'];
    
    for (const prop of possibleProps) {
      if (downloadProcess[prop] && typeof downloadProcess[prop].kill === 'function') {
        childProcess = downloadProcess[prop];
        if (ENABLE_DOWNLOAD_LOGS) {
          console.error('[DOWNLOAD] Found child process at property:', prop);
        }
        break;
      }
    }
    
    // Store process reference for cancellation
    // Also try to get the PID if available
    let processPid = null;
    if (childProcess && childProcess.pid) {
      processPid = childProcess.pid;
    } else if (downloadProcess.pid) {
      processPid = downloadProcess.pid;
    }
    
    activeDownloadProcesses.set(processId, {
      process: childProcess,
      eventEmitter: downloadProcess,
      processPid: processPid,
      url: url,
      outputPath: outputFilePath
    });
    
    if (ENABLE_DOWNLOAD_LOGS) {
      console.error('[DOWNLOAD] Started. ProcessId:', processId, 'PID:', processPid);
    }

    await downloadProcess
    .on('progress', (progress) => {
      if (ENABLE_DOWNLOAD_LOGS && progress && typeof progress.percent === 'string') {
        const percent = parseFloat(progress.percent.replace('%', ''));
        if (percent % 10 === 0 || percent >= 99) {
          console.log(`[Main Process] Download progress: ${progress.percent}`);
        }
      }
      event.reply('download-progress', progress);

      if (!conversionSignalSent && progress && typeof progress.percent === 'string') {
        const currentPercent = parseFloat(progress.percent.replace('%',''));
        if (currentPercent >= 99.5) {
          if (ENABLE_DOWNLOAD_LOGS) {
            console.log('[Main Process] Download reported as essentially complete (>=99.5%)');
            console.log('[Main Process] conversion-phase-started sent (triggered by download >=99.5% completion).');
          }
          downloadReportedAsMostlyComplete = true; 
          event.reply('conversion-phase-started');
          conversionSignalSent = true;
        }
      }
    })
    .on('ytDlpEvent', (eventType, eventData) => {
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log(`[ytDlpEvent] ${eventType}: ${eventData}`);
      }

      // For playlist downloads, try to detect the current item and its title
      if (!isPlaylistDownload || typeof eventData !== 'string') {
        return;
      }

      // Update current/total item indices from "Downloading item X of Y" lines
      const itemMatch = eventData.match(/Downloading item\s+(\d+)\s+of\s+(\d+)/i);
      if (itemMatch) {
        currentItemIndex = parseInt(itemMatch[1], 10) || currentItemIndex;
        totalItems = parseInt(itemMatch[2], 10) || totalItems;
      }

      // Extract the file name from "Destination: ..." lines to infer the title
      const destMatch = eventData.match(/Destination:\s*(.+)$/i);
      if (destMatch) {
        const fullPath = destMatch[1].trim();
        const baseName = path.basename(fullPath);
        // Strip the extension to get a clean title
        currentItemTitle = baseName.replace(/\.[^/.]+$/, '');

        event.reply('playlist-item-update', {
          index: currentItemIndex,
          total: totalItems,
          title: currentItemTitle
        });
      }
    })
    .on('error', (error) => {
      console.error('Error during download:', error);
      // Clean up process reference on error
      activeDownloadProcesses.delete(processId);
      event.sender.downloadProcessId = null;
      event.reply('download-error', `Error: ${error.message || 'Unknown error'}`);
      // Trigger cleanup to prevent EBUSY errors on next operation
      performCleanup();
    })
    .on('close', (code) => {
      if (ENABLE_DOWNLOAD_LOGS) {
        console.log('[Main Process] yt-dlp process close event fired. Exit code:', code);
      }
      
      // Clean up process reference
      activeDownloadProcesses.delete(processId);
      event.sender.downloadProcessId = null;
      
      // If process was killed (cancelled), don't send completion
      if (code === null || code === 143 || code === 'SIGTERM') {
        if (ENABLE_DOWNLOAD_LOGS) {
          console.log('[Main Process] Download was cancelled');
        }
        return;
      }
      
      if (!conversionSignalSent) {
        if (ENABLE_DOWNLOAD_LOGS) {
          console.warn('[Main Process] \'close\' event: conversion-phase-started was missed. Sending now.');
        }
        event.reply('conversion-phase-started');
      }
      
      setTimeout(() => {
        const finalMessage = downloadPath 
            ? `Téléchargement terminé. ${format === 'audio' ? 'Audio' : 'Vidéo'} enregistré dans ${downloadPath}. (Le nom du fichier est basé sur le titre de la vidéo)`
            : `Téléchargement terminé: ${outputFilePath}`;
        if (ENABLE_DOWNLOAD_LOGS) {
          console.log(`[Main Process] Sending download-complete. URL: ${url}`);
        }
        event.reply('download-complete', finalMessage);
      }, 3500);
    });

  } catch (error) {
    console.error('yt-dlp execution error:', error);
    activeDownloadProcesses.delete(processId);
    event.sender.downloadProcessId = null;
    event.reply('download-error', `Failed to download ${format}: ${error.message || 'Unknown error'}`);
    
    // Trigger cleanup to prevent EBUSY errors on next operation
    performCleanup();
  }
});

ipcMain.handle('search-youtube', async (event, query, maxResults = 5) => {
  try {
    if (!query || !query.trim()) {
      return { error: 'Please enter a search query.' };
    }

  // Wait for any cleanup to complete before starting new operation
  await waitForCleanup();

  // Ensure we have a valid yt-dlp binary before proceeding
  const binaryPath = await ensureYtDlpBinary();
  if (!binaryPath) {
    return { error: 'Unable to find or download yt-dlp binary. Please ensure yt-dlp is installed on your system.' };
  }

  console.log(`Searching YouTube for: ${query}`);
  
  const searchQuery = `ytsearch${maxResults}:${query.trim()}`;
  
  // Get a fresh ytDlpWrap instance if needed
  const ytDlp = getYtDlpWrap(binaryPath);
  
  return new Promise((resolve) => { // No reject, always resolve with status
    const searchResults = [];
    
    ytDlp.execPromise([
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