const youtubeUrlInput = document.getElementById('youtubeUrl');
const downloadButton = document.getElementById('downloadButton');
const messageArea = document.getElementById('messageArea');
const downloadPathDisplay = document.getElementById('downloadPathDisplay');
const setPathButton = document.getElementById('setPathButton');
const progressContainer = document.getElementById('progressContainer');
const progressBarFill = document.getElementById('progressBarFill');
const progressBarText = document.getElementById('progressBarText');
const searchQuery = document.getElementById('searchQuery');
const searchButton = document.getElementById('searchButton');
const searchResults = document.getElementById('searchResults');
const completionNotification = document.getElementById('completionNotification');
const downloadMoreBtn = document.getElementById('downloadMoreBtn');
const settingsButton = document.getElementById('settingsButton');
const settingsPopup = document.getElementById('settingsPopup');
const closeSettingsPopup = document.getElementById('closeSettingsPopup');

const selectedVideoContainer = document.getElementById('selectedVideoContainer');
const selectedVideoTitle = document.getElementById('selectedVideoTitle');
const selectedVideoLabel = selectedVideoContainer
  ? selectedVideoContainer.querySelector('.selected-video-label')
  : null;
const playlistOptions = document.getElementById('playlistOptions');
const playlistSingleBtn = document.getElementById('playlistSingleBtn');
const playlistFullBtn = document.getElementById('playlistFullBtn');
const playlistDetails = document.getElementById('playlistDetails');
const playlistItemsList = document.getElementById('playlistItemsList');
const playlistDetailsHeader = document.getElementById('playlistDetailsHeader');
const backButton = document.getElementById('backButton');
const formatSelect = document.getElementById('formatSelect');
const pasteClipboardButton = document.getElementById('pasteClipboardButton');

// Binary download popup elements
const binaryDownloadPopup = document.getElementById('binaryDownloadPopup');
const closeBinaryDownloadPopup = document.getElementById('closeBinaryDownloadPopup');
const downloadYtDlpBtn = document.getElementById('downloadYtDlpBtn');
const downloadFfmpegBtn = document.getElementById('downloadFfmpegBtn');
const ytDlpStatus = document.getElementById('ytDlpStatus');
const ffmpegStatus = document.getElementById('ffmpegStatus');
const binaryDownloadProgress = document.getElementById('binaryDownloadProgress');
const binaryDownloadProgressText = document.getElementById('binaryDownloadProgressText');
const ytDlpBinaryItem = document.getElementById('ytDlpBinaryItem');
const ffmpegBinaryItem = document.getElementById('ffmpegBinaryItem');

// App update popup elements
const updatePopup = document.getElementById('updatePopup');
const closeUpdatePopup = document.getElementById('closeUpdatePopup');
const updateMessage = document.getElementById('updateMessage');
const currentVersionLabel = document.getElementById('currentVersionLabel');
const newVersionLabel = document.getElementById('newVersionLabel');
const updateReleaseNotes = document.getElementById('updateReleaseNotes');
const updateInitialActions = document.getElementById('updateInitialActions');
const updateProgressSection = document.getElementById('updateProgressSection');
const updateProgressText = document.getElementById('updateProgressText');
const updateReadyActions = document.getElementById('updateReadyActions');
const updateInstallBtn = document.getElementById('updateInstallBtn');
const updateRemindLaterBtn = document.getElementById('updateRemindLaterBtn');
const updateSkipBtn = document.getElementById('updateSkipBtn');
const updateRestartNowBtn = document.getElementById('updateRestartNowBtn');
const updateRestartLaterBtn = document.getElementById('updateRestartLaterBtn');

// Cancel download button
const cancelDownloadBtn = document.getElementById('cancelDownloadBtn');

// Title bar controls
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeRestoreBtn = document.getElementById('maximizeRestoreBtn');
const maximizeIcon = document.getElementById('maximizeIcon');
const restoreIcon = document.getElementById('restoreIcon');
const closeBtn = document.getElementById('closeBtn');

let currentDownloadPath = '';
let messageTimeout = null; // To store the timeout ID for the message area
let selectedVideoUrl = ''; // Store the selected video URL
let originalVideoUrl = ''; // Store the original URL (useful for playlists)
let isPlaylistUrl = false; // Track if current selection is a playlist URL
let playlistMode = 'single'; // 'single' | 'playlist'
const DOWNLOAD_PROGRESS_SCALE = 0.85; // Download part takes up 85% of the bar
let conversionSimulationActive = false;
let videoInfoController = null; // To control video info fetching
let currentPlaylistItems = [];
let isActivePlaylistDownload = false;
let lastPlaylistIndex = null;
let latestAvailableUpdateVersion = null;
let hasInitializedAutoUpdateUI = false;

// Language handling
const LANGUAGE_STORAGE_KEY = 'mytube_language';

function getStoredLanguage() {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && window.i18n && window.i18n.getSupportedLanguages().includes(stored)) {
            return stored;
        }
    } catch (e) {
        console.warn('Could not read stored language from localStorage:', e);
    }
    // Fallback to browser language if possible
    if (navigator && navigator.language) {
        const base = navigator.language.split('-')[0];
        if (window.i18n && window.i18n.getSupportedLanguages().includes(base)) {
            return base;
        }
    }
    return (window.i18n && window.i18n.getLanguage && window.i18n.getLanguage()) || 'fr';
}

function setStoredLanguage(lang) {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (e) {
        console.warn('Could not store language in localStorage:', e);
    }
}

function applyI18nToElement(element) {
    if (!window.i18n || !element) return;
    const key = element.getAttribute('data-i18n-key');
    if (key) {
        element.textContent = window.i18n.t(key);
    }
    const attrMapping = element.getAttribute('data-i18n-attr');
    if (attrMapping) {
        // Format: "attr:key,otherAttr:other.key"
        const mappings = attrMapping.split(',').map(v => v.trim()).filter(Boolean);
        mappings.forEach(mapping => {
            const parts = mapping.split(':');
            if (parts.length === 2) {
                const attr = parts[0].trim();
                const attrKey = parts[1].trim();
                const value = window.i18n.t(attrKey);
                if (value && attr) {
                    element.setAttribute(attr, value);
                }
            }
        });
    }
}

function applyTranslations() {
    if (!window.i18n) return;

    // Simple elements with data-i18n-key
    document.querySelectorAll('[data-i18n-key]').forEach(el => applyI18nToElement(el));
    // Elements with data-i18n-attr (placeholder, title, etc.)
    document.querySelectorAll('[data-i18n-attr]').forEach(el => applyI18nToElement(el));

    // Dynamic text that depends on UI state
    const selectedFormat = formatSelect ? formatSelect.value : 'audio';
    if (downloadButton) {
        if (selectedFormat === 'audio') {
            downloadButton.textContent = window.i18n.t('download.audioButton');
        } else {
            downloadButton.textContent = window.i18n.t('download.videoButton');
        }
    }

    // Titlebar control tooltips
    if (minimizeBtn) {
        minimizeBtn.title = window.i18n.t('titlebar.minimize');
    }
    if (maximizeRestoreBtn) {
        maximizeRestoreBtn.title = window.i18n.t('titlebar.maximize');
    }
    if (closeBtn) {
        closeBtn.title = window.i18n.t('titlebar.close');
    }
}

function highlightCurrentLanguageButton(lang) {
    const buttons = document.querySelectorAll('.language-option-btn');
    buttons.forEach((btn) => {
        const btnLang = btn.getAttribute('data-lang');
        btn.classList.toggle('active', btnLang === lang);
    });
}

function initLanguageHandling() {
    if (!window.i18n) return;

    const initialLang = getStoredLanguage();
    window.i18n.changeLanguage(initialLang).then((effectiveLang) => {
        setStoredLanguage(effectiveLang);
        applyTranslations();
        highlightCurrentLanguageButton(effectiveLang);
    });

    window.i18n.onLanguageChanged((lng) => {
        applyTranslations();
        highlightCurrentLanguageButton(lng);
    });

    const buttons = document.querySelectorAll('.language-option-btn');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang');
            if (!lang) return;
            window.i18n.changeLanguage(lang).then((effectiveLang) => {
                setStoredLanguage(effectiveLang);
                applyTranslations();
                highlightCurrentLanguageButton(effectiveLang);
            });
        });
    });
}

// Window controls event listeners
if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });
}

if (maximizeRestoreBtn) {
    maximizeRestoreBtn.addEventListener('click', () => {
        window.electronAPI.maximizeRestoreWindow();
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });
}

// Settings popup
settingsButton.addEventListener('click', () => {
    settingsPopup.style.display = 'flex';
});

closeSettingsPopup.addEventListener('click', () => {
    settingsPopup.style.display = 'none';
});



// Close popup when clicking outside
settingsPopup.addEventListener('click', (e) => {
    if (e.target === settingsPopup) {
        settingsPopup.style.display = 'none';
    }
});

// Binary download popup handlers
closeBinaryDownloadPopup.addEventListener('click', () => {
    binaryDownloadPopup.style.display = 'none';
});

binaryDownloadPopup.addEventListener('click', (e) => {
    if (e.target === binaryDownloadPopup) {
        binaryDownloadPopup.style.display = 'none';
    }
});

// Download yt-dlp binary
downloadYtDlpBtn.addEventListener('click', async () => {
    downloadYtDlpBtn.disabled = true;
    ytDlpStatus.textContent = window.i18n.t('binaries.downloading');
    ytDlpStatus.className = 'binary-item-status downloading';
    binaryDownloadProgress.style.display = 'block';
    binaryDownloadProgressText.textContent = window.i18n.t('binaries.downloadingYtDlp');
    
    try {
        const result = await window.electronAPI.downloadYtDlpBinary();
        if (result.success) {
            ytDlpStatus.textContent = window.i18n.t('binaries.available');
            ytDlpStatus.className = 'binary-item-status available';
            downloadYtDlpBtn.style.display = 'none';
            ytDlpBinaryItem.style.display = 'none';
            binaryDownloadProgressText.textContent = window.i18n.t('binaries.ytDlpDownloaded');
            setTimeout(() => {
                binaryDownloadProgress.style.display = 'none';
                // Check if both binaries are now available and close popup
                if (ffmpegStatus.className.includes('available') || ffmpegBinaryItem.style.display === 'none') {
                    binaryDownloadPopup.style.display = 'none';
                }
            }, 2000);
        } else {
            ytDlpStatus.textContent = window.i18n.t('binaries.errorPrefix') + ' ' + (result.error || window.i18n.t('binaries.downloadFailed'));
            ytDlpStatus.className = 'binary-item-status error';
            downloadYtDlpBtn.disabled = false;
            binaryDownloadProgress.style.display = 'none';
        }
    } catch (error) {
        console.error('Error downloading yt-dlp:', error);
        ytDlpStatus.textContent = window.i18n.t('binaries.errorPrefix') + ' ' + error.message;
        ytDlpStatus.className = 'binary-item-status error';
        downloadYtDlpBtn.disabled = false;
        binaryDownloadProgress.style.display = 'none';
    }
});

// Download ffmpeg binary
downloadFfmpegBtn.addEventListener('click', async () => {
    downloadFfmpegBtn.disabled = true;
    ffmpegStatus.textContent = window.i18n.t('binaries.downloading');
    ffmpegStatus.className = 'binary-item-status downloading';
    binaryDownloadProgress.style.display = 'block';
    binaryDownloadProgressText.textContent = window.i18n.t('binaries.downloadingFfmpeg');
    
    try {
        const result = await window.electronAPI.downloadFfmpegBinary();
        if (result.success) {
            ffmpegStatus.textContent = window.i18n.t('binaries.available');
            ffmpegStatus.className = 'binary-item-status available';
            downloadFfmpegBtn.style.display = 'none';
            ffmpegBinaryItem.style.display = 'none';
            binaryDownloadProgressText.textContent = window.i18n.t('binaries.ffmpegDownloaded');
            setTimeout(() => {
                binaryDownloadProgress.style.display = 'none';
                // Check if both binaries are now available and close popup
                if (ytDlpStatus.className.includes('available') || ytDlpBinaryItem.style.display === 'none') {
                    binaryDownloadPopup.style.display = 'none';
                }
            }, 2000);
        } else {
            ffmpegStatus.textContent = window.i18n.t('binaries.errorPrefix') + ' ' + (result.error || window.i18n.t('binaries.downloadFailed'));
            ffmpegStatus.className = 'binary-item-status error';
            downloadFfmpegBtn.disabled = false;
            binaryDownloadProgress.style.display = 'none';
        }
    } catch (error) {
        console.error('Error downloading ffmpeg:', error);
        ffmpegStatus.textContent = window.i18n.t('binaries.errorPrefix') + ' ' + error.message;
        ffmpegStatus.className = 'binary-item-status error';
        downloadFfmpegBtn.disabled = false;
        binaryDownloadProgress.style.display = 'none';
    }
});

// Listen for main process telling us window is maximized/unmaximized
window.electronAPI.onWindowMaximized(() => {
    maximizeIcon.style.display = 'none';
    restoreIcon.style.display = 'inline';
    maximizeRestoreBtn.title = 'Restore Down';
});

window.electronAPI.onWindowUnmaximized(() => {
    maximizeIcon.style.display = 'inline';
    restoreIcon.style.display = 'none';
    maximizeRestoreBtn.title = 'Maximize';
});

function displayUserMessage(text, type) {
    if (messageTimeout) {
        clearTimeout(messageTimeout);
        messageArea.classList.remove('active');
    }

    messageArea.textContent = text;
    messageArea.className = ''; // Reset classes
    
    if (type) {
        messageArea.classList.add(`message-${type}`);
    }

    if (text) {
        messageArea.classList.add('active');

        messageTimeout = setTimeout(() => {
            messageArea.classList.remove('active');
        }, 3000);
    } else {
        messageArea.classList.remove('active');
    }
}

function updateProgressBar(percentInput) {
    let percentNumber = 0;
    if (typeof percentInput === 'string') {
        percentNumber = parseFloat(percentInput.replace('%', ''));
    } else if (typeof percentInput === 'number') {
        percentNumber = percentInput;
    }

    if (isNaN(percentNumber)) {
        percentNumber = 0;
    }
    percentNumber = Math.max(0, Math.min(100, percentNumber)); // Clamp between 0 and 100

    progressBarFill.style.width = `${percentNumber}%`;
}

async function initializePath() {
    try {
        const defaultPath = await window.electronAPI.getDefaultDownloadPath();
        if (defaultPath) {
            currentDownloadPath = defaultPath;
            downloadPathDisplay.textContent = defaultPath;
            downloadPathDisplay.title = defaultPath; 
        }
    } catch (error) {
        console.error('Error getting default download path:', error);
        downloadPathDisplay.textContent = 'Could not get default path';
    }
}

function resetListeners() {
    window.electronAPI.removeAllListeners('download-progress');
    window.electronAPI.removeAllListeners('conversion-phase-started');
    window.electronAPI.removeAllListeners('download-complete');
    window.electronAPI.removeAllListeners('download-error');
    window.electronAPI.removeAllListeners('download-cancelled');
    window.electronAPI.removeAllListeners('playlist-item-update');
}

function resetUI() {
    // Cancel any ongoing video info request
    if (videoInfoController) {
        window.electronAPI.cancelVideoInfo();
        videoInfoController = null;
    }
    
    // Hide the completion notification
    completionNotification.style.display = 'none';
    
    // Clear search field and results
    searchQuery.value = '';
    searchResults.style.display = 'none';
    
    // Show search input again
    document.querySelector('.search-container').style.display = 'flex';
    
    // Show format selection container
    document.querySelector('.format-selection').style.display = 'block';
    
    // Reset selected video display
    selectedVideoContainer.style.display = 'none';
    selectedVideoTitle.textContent = '';
    // Restore label/title visibility in case they were hidden for
    // full-playlist download mode.
    if (selectedVideoLabel) {
        selectedVideoLabel.style.display = 'block';
    }
    selectedVideoTitle.style.display = 'block';

    // Reset playlist details
    if (playlistDetails) {
        playlistDetails.style.display = 'none';
    }
    if (playlistItemsList) {
        playlistItemsList.innerHTML = '';
    }
    if (playlistDetailsHeader) {
        playlistDetailsHeader.textContent = '';
    }
    currentPlaylistItems = [];
    isActivePlaylistDownload = false;
    lastPlaylistIndex = null;
    
    // Hide back button
    backButton.style.display = 'none';
    
    // Reset selected video / playlist state
    selectedVideoUrl = '';
    originalVideoUrl = '';
    isPlaylistUrl = false;
    playlistMode = 'single';
    updatePlaylistUI();
    
    // Hide download button (should only appear after video info is retrieved)
    downloadButton.disabled = false;
    downloadButton.style.display = 'none';
    
    // Hide progress
    progressContainer.style.display = 'none';
    cancelDownloadBtn.style.display = 'none'; // Hide cancel button
    
    // Clear any running simulation
    if (window.conversionSimulationInterval) {
        clearInterval(window.conversionSimulationInterval);
        window.conversionSimulationInterval = null;
    }
    
    // Reset progress bar text
    progressBarText.textContent = '0%';
    conversionSimulationActive = false; // Reset simulation flag
    
    // Focus on search field
    searchQuery.focus();
}

setPathButton.addEventListener('click', async () => {
    try {
        const selectedPath = await window.electronAPI.selectDownloadPath();
        if (selectedPath) {
            currentDownloadPath = selectedPath;
            downloadPathDisplay.textContent = selectedPath;
            downloadPathDisplay.title = selectedPath;
            // Automatically close the popup after path selection
            settingsPopup.style.display = 'none';
        }
    } catch (error) {
        console.error('Error selecting download path:', error);
        displayUserMessage(window.i18n.t('download.errorSettingDownloadPath'), 'error'); 
    }
});

downloadButton.addEventListener('click', () => {
    if (!selectedVideoUrl) {
        displayUserMessage(window.i18n.t('download.mustSelectVideo'), 'error'); 
        return;
    }
    
    if (!currentDownloadPath) {
        displayUserMessage(window.i18n.t('download.mustSetDownloadPath'), 'error');
        settingsPopup.style.display = 'flex';
        return;
    }

    resetListeners();
    conversionSimulationActive = false; // Reset before new download
    
    searchResults.style.display = 'none';
    downloadButton.style.display = 'none';
    backButton.style.display = 'none';
    progressContainer.style.display = 'block';
    cancelDownloadBtn.style.display = 'inline-block'; // Show cancel button
    updateProgressBar(0); 
    progressBarText.textContent = window.i18n.t('download.preparing'); 
    displayUserMessage('', null);

    const selectedFormat = formatSelect.value;
    const effectivePlaylistMode = isPlaylistUrl && playlistMode === 'playlist' ? 'playlist' : 'single';
    isActivePlaylistDownload = (effectivePlaylistMode === 'playlist');
    lastPlaylistIndex = null;

    // For full-playlist downloads, visually declutter: only show the
    // playlist list, hide the "Vidéo sélectionnée" label, the title
    // and the playlist mode buttons.
    if (effectivePlaylistMode === 'playlist') {
        if (playlistDetails) {
            playlistDetails.style.display = 'block';
        }
        if (selectedVideoLabel) {
            selectedVideoLabel.style.display = 'none';
        }
        selectedVideoTitle.style.display = 'none';
        if (playlistOptions) {
            playlistOptions.style.display = 'none';
        }
    }

    // Clear any previous highlighting on playlist items
    if (playlistItemsList && playlistItemsList.children.length) {
        Array.from(playlistItemsList.children).forEach(li => {
            li.classList.remove('current', 'completed');
        });
    }

    window.electronAPI.downloadMedia(selectedVideoUrl, currentDownloadPath, selectedFormat, effectivePlaylistMode);

    window.electronAPI.onDownloadProgress((progressData) => {
        console.log('[Renderer] Received download-progress event with data:', JSON.stringify(progressData)); 
        if (conversionSimulationActive) {
            console.log('[Renderer] Conversion simulation active, ignoring download-progress event.');
            return; 
        }

        let actualDownloadPercent = 0;
        let isPreparing = false;

        if (typeof progressData === 'string') {
            // This will likely be the initial "Preparing to download..." message
            if (progressData.toLowerCase().includes('preparing') || progressData.toLowerCase().includes('début')) {
                isPreparing = true;
            } else {
                // Attempt to parse if it's an unexpected string format with a percentage
                const percentMatch = progressData.match(/(\d+\.?\d*)\s*%/);
                if (percentMatch && percentMatch[1]) {
                    actualDownloadPercent = parseFloat(percentMatch[1]);
                }
            }
        } else if (progressData && typeof progressData === 'object' && progressData.percent != null) {
            if (typeof progressData.percent === 'string') {
                actualDownloadPercent = parseFloat(progressData.percent.replace('%',''));
            } else if (typeof progressData.percent === 'number') {
                 actualDownloadPercent = progressData.percent;
            }
        }
        
        // Ensure actualDownloadPercent is a number for calculations
        if (isNaN(actualDownloadPercent)) actualDownloadPercent = 0;

        const overallProgressPercent = actualDownloadPercent * DOWNLOAD_PROGRESS_SCALE;
        updateProgressBar(overallProgressPercent);

        if (isPreparing) {
            progressBarText.textContent = window.i18n.t('download.preparing');
        } else if (actualDownloadPercent >= 99.5) {
            // Once download is effectively 100%, show a finalization message 
            // before conversion-phase-started event updates it to "Conversion..."
            progressBarText.textContent = window.i18n.t('download.finalizing');
        } else {
            progressBarText.textContent = window.i18n.t('download.progress', { percent: Math.round(actualDownloadPercent) });
        }
    });

    window.electronAPI.onConversionPhaseStarted(() => {
        if (conversionSimulationActive) return; 
        conversionSimulationActive = true;
        console.log("Conversion phase started signal received by renderer.");
        // Text is now explicitly "Conversion en cours..."
        progressBarText.textContent = window.i18n.t('download.converting');
        // Ensure bar is at least at the starting point of conversion visually
        updateProgressBar(DOWNLOAD_PROGRESS_SCALE * 100);
        simulateConversionProgress(DOWNLOAD_PROGRESS_SCALE * 100, 100, 3000); 
    });

    window.electronAPI.onPlaylistItemUpdate((info) => {
        if (!info || !isActivePlaylistDownload) {
            return;
        }

        const { index, total, title } = info;
        if (typeof index === 'number') {
            lastPlaylistIndex = index;
        }

        // Highlight current and completed items in the playlist list
        if (playlistItemsList && playlistItemsList.children.length) {
            const children = Array.from(playlistItemsList.children);
            const safeIndex = Math.min(children.length, Math.max(1, index || 1)) - 1;

            children.forEach((li, liIndex) => {
                li.classList.remove('current');
                if (typeof index === 'number' && liIndex < safeIndex) {
                    li.classList.add('completed');
                } else {
                    li.classList.remove('completed');
                }
            });

            const currentLi = children[safeIndex];
            if (currentLi) {
                currentLi.classList.add('current');
            }
        }
    });

    window.electronAPI.onDownloadComplete((message) => {
        if (window.conversionSimulationInterval) {
            clearInterval(window.conversionSimulationInterval);
            window.conversionSimulationInterval = null;
        }
        progressContainer.style.display = 'none'; // Hide the progress bar container
        cancelDownloadBtn.style.display = 'none'; // Hide cancel button

        selectedVideoContainer.style.display = 'none';
        completionNotification.style.display = 'block';
        displayUserMessage(window.i18n.t('download.completionNotification'), 'complete');
        isActivePlaylistDownload = false;
        lastPlaylistIndex = null;
        resetListeners();
    });

    window.electronAPI.onDownloadError((errorMessage) => {
        displayUserMessage(errorMessage, 'error');
        progressContainer.style.display = 'none';
        cancelDownloadBtn.style.display = 'none'; // Hide cancel button
        downloadButton.style.display = 'inline-block';
        conversionSimulationActive = false;
        if (window.conversionSimulationInterval) {
            clearInterval(window.conversionSimulationInterval);
        }
        isActivePlaylistDownload = false;
        lastPlaylistIndex = null;
        resetListeners();
    });

    window.electronAPI.onDownloadCancelled(() => {
        // Clear any running simulation
        conversionSimulationActive = false;
        if (window.conversionSimulationInterval) {
            clearInterval(window.conversionSimulationInterval);
            window.conversionSimulationInterval = null;
        }
        
        // Reset all listeners
        resetListeners();
        
        // Reset UI back to search screen
        resetUI();
        
        displayUserMessage('Téléchargement annulé', 'error');
    });
});

// "Download More" button click handler
downloadMoreBtn.addEventListener('click', resetUI);

// Search functionality
searchButton.addEventListener('click', performSearch);
searchQuery.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// Format selection change handler
formatSelect.addEventListener('change', () => {
    const selectedFormat = formatSelect.value;
    if (selectedFormat === 'audio') {
        downloadButton.textContent = window.i18n.t('download.audioButton');
    } else if (selectedFormat === 'video') {
        downloadButton.textContent = window.i18n.t('download.videoButton');
    }
});

// Paste clipboard button handler
pasteClipboardButton.addEventListener('click', async () => {
    try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText.trim()) {
            searchQuery.value = clipboardText.trim();
            searchQuery.focus();
        }
    } catch (error) {
        console.error('Failed to read clipboard:', error);
        displayUserMessage(window.i18n.t('clipboard.errorRead'), 'error');
    }
});

// Function to check if a string is a YouTube URL
function isYouTubeUrl(str) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)[a-zA-Z0-9_-]{11}/;
    return youtubeRegex.test(str);
}

// Function to detect if a YouTube URL refers to a playlist/mix/radio
function isYouTubePlaylistUrl(str) {
    try {
        const parsed = new URL(str);
        if (parsed.searchParams.has('list')) return true;
        if (parsed.pathname.includes('/playlist')) return true;
        return false;
    } catch (e) {
        return false;
    }
}

// Normalize a YouTube URL to a canonical single-video link
// This strips playlist/radio parameters so we always download just that video.
function normalizeYouTubeUrl(url) {
    try {
        const parsed = new URL(url);
        let videoId = null;

        // youtu.be short links
        if (parsed.hostname.includes('youtu.be')) {
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (parts.length > 0) {
                videoId = parts[0];
            }
        }

        // Standard watch URLs with ?v=
        if (!videoId && parsed.searchParams.has('v')) {
            videoId = parsed.searchParams.get('v');
        }

        // Embed or /v/ URLs
        if (!videoId && (parsed.pathname.includes('/embed/') || parsed.pathname.includes('/v/'))) {
            const segments = parsed.pathname.split('/').filter(Boolean);
            const idx = segments.findIndex(seg => seg === 'embed' || seg === 'v');
            if (idx !== -1 && segments[idx + 1]) {
                videoId = segments[idx + 1];
            }
        }

        // Fallback: try to match a video ID pattern in the whole string
        if (!videoId) {
            const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (match && match[1]) {
                videoId = match[1];
            }
        }

        if (!videoId || videoId.length !== 11) {
            return url; // Return original if we can't confidently extract an ID
        }

        return `https://www.youtube.com/watch?v=${videoId}`;
    } catch (e) {
        // If URL parsing fails, just return the original string
        return url;
    }
}

// Update playlist UI state
function updatePlaylistUI() {
    if (!playlistOptions || !playlistSingleBtn || !playlistFullBtn) return;

    if (isPlaylistUrl) {
        playlistOptions.style.display = 'block';
        if (playlistMode === 'playlist') {
            playlistFullBtn.classList.add('active');
            playlistSingleBtn.classList.remove('active');
        } else {
            playlistSingleBtn.classList.add('active');
            playlistFullBtn.classList.remove('active');
        }
    } else {
        playlistOptions.style.display = 'none';
        playlistSingleBtn.classList.add('active');
        playlistFullBtn.classList.remove('active');
    }
}

async function performSearch() {
    const query = searchQuery.value.trim();
    if (!query) {
        displayUserMessage(window.i18n.t('search.invalidQuery'), 'error');
        return;
    }

    // Check if the input is a YouTube URL
    if (isYouTubeUrl(query)) {
        // Handle direct URL input
        originalVideoUrl = query;
        isPlaylistUrl = isYouTubePlaylistUrl(query);
        playlistMode = 'single'; // Default to single video
        selectedVideoUrl = normalizeYouTubeUrl(query);
        
        // Show loading state while fetching video info
        selectedVideoTitle.textContent = window.i18n.t('playlist.fetchingVideoInfo');
        selectedVideoContainer.style.display = 'block';
        
        // Clear and hide search results and search container
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';
        document.querySelector('.search-container').style.display = 'none';
        
        // Hide format selection container
        document.querySelector('.format-selection').style.display = 'none';
        
        // Show back button
        backButton.style.display = 'flex';
        
        try {
            // Mark that we have an active video info request
            videoInfoController = true;
            
            // Fetch video info to get the title, using normalized URL
            const videoInfo = await window.electronAPI.getVideoInfo(selectedVideoUrl);
            
            // Check if request was cancelled
            if (!videoInfoController) {
                return;
            }
            
            if (videoInfo && videoInfo.cancelled) {
                return;
            }
            
            if (videoInfo && videoInfo.title) {
                selectedVideoTitle.textContent = `${videoInfo.title}`;
            } else {
                selectedVideoTitle.textContent = window.i18n.t('search.videoFromLink');
            }
            
            // Only show playlist/single options after we have attempted to retrieve video info
            updatePlaylistUI();
            
            // Show download button only after successful video info retrieval
            downloadButton.style.display = 'inline-block';
            downloadButton.focus();
        } catch (error) {
            // Check if request was cancelled
            if (!videoInfoController) {
                return;
            }
            console.error('Error fetching video info:', error);
            selectedVideoTitle.textContent = window.i18n.t('search.videoFromLink');
            
            // Show download button even if title fetch failed
            downloadButton.style.display = 'inline-block';
            // Still update playlist options once we've attempted to retrieve info
            updatePlaylistUI();
        } finally {
            // Clear the controller
            videoInfoController = null;
        }
        
        displayUserMessage(window.i18n.t('search.youtubeLinkDetected'), 'success');
        return;
    }

    // Show loading state for search
    searchButton.disabled = true;
    searchButton.textContent = window.i18n.t('search.searching');
    searchResults.innerHTML = `<div class="search-result-item">${window.i18n.t('search.searching')}</div>`;
    searchResults.style.display = 'block';
    
    // Hide completion notification if it's showing
    completionNotification.style.display = 'none';

    try {
        const result = await window.electronAPI.searchYoutube(query, 10);
        
        if (result.error) {
            displayUserMessage(result.error, 'error');
            searchResults.style.display = 'none';
            return;
        }

        if (result.results && result.results.length > 0) {
            displaySearchResults(result.results);
        } else {
            searchResults.innerHTML = '<div class="search-result-item">Aucun résultat trouvé</div>';
        }
    } catch (error) {
        console.error('Search error:', error);
        displayUserMessage(window.i18n.t('search.error'), 'error');
        searchResults.style.display = 'none';
    } finally {
        searchButton.disabled = false;
        searchButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
    }
}

// Function to display search results
function displaySearchResults(results) {
    searchResults.innerHTML = '';
    
    results.forEach(video => {
        const normalizedUrl = normalizeYouTubeUrl(video.url || '');
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        
        resultItem.innerHTML = `
            <div class="search-result-info">
                <div class="search-result-title">${video.title}</div>
                <div class="search-result-duration">${video.duration}</div>
            </div>
        `;
        
        // Add click event to select this video
        resultItem.addEventListener('click', () => {
            originalVideoUrl = video.url || '';
            isPlaylistUrl = isYouTubePlaylistUrl(originalVideoUrl);
            playlistMode = 'single'; // Default to single video on new selection
            selectedVideoUrl = normalizedUrl || video.url;
            updatePlaylistUI();
            
            // Display selected video title
            selectedVideoTitle.textContent = video.title;
            selectedVideoContainer.style.display = 'block';
            
            // Hide search results
            searchResults.style.display = 'none';
            
            // Hide search input section
            document.querySelector('.search-container').style.display = 'none';
            
            // Hide format selection container
            document.querySelector('.format-selection').style.display = 'none';
            
            // Show back button
            backButton.style.display = 'flex';
            
            // Show download button when video is selected
            downloadButton.style.display = 'inline-block';
            downloadButton.focus();
        });
        
        searchResults.appendChild(resultItem);
    });
    
    searchResults.style.display = 'block';
}

// Back button functionality
backButton.addEventListener('click', () => {
    // Cancel any ongoing video info request
    if (videoInfoController) {
        window.electronAPI.cancelVideoInfo();
        videoInfoController = null;
    }
    
    // Show search container again
    document.querySelector('.search-container').style.display = 'flex';
    // Clear the search / URL input
    searchQuery.value = '';
    
    // Only show search results if there are results to display
    if (searchResults.innerHTML.trim() !== '') {
        searchResults.style.display = 'block';
    } else {
        searchResults.style.display = 'none';
    }
    
    // Show format selection container
    document.querySelector('.format-selection').style.display = 'block';
    
    // Hide selected video container
    selectedVideoContainer.style.display = 'none';
    if (playlistDetails) {
        playlistDetails.style.display = 'none';
    }
    if (playlistItemsList) {
        playlistItemsList.innerHTML = '';
    }
    if (playlistDetailsHeader) {
        playlistDetailsHeader.textContent = '';
    }
    currentPlaylistItems = [];
    isActivePlaylistDownload = false;
    lastPlaylistIndex = null;
    originalVideoUrl = '';
    isPlaylistUrl = false;
    playlistMode = 'single';
    updatePlaylistUI();
    
    // Hide back button
    backButton.style.display = 'none';
    
    // Hide download button when returning to initial state
    downloadButton.style.display = 'none';
    
    // Clear the selection
    selectedVideoUrl = '';
});

// Modified simulateConversionProgress to accept start/end points
function simulateConversionProgress(startPercentOverall, endPercentOverall, duration) {
    const steps = 30; 
    const increment = (endPercentOverall - startPercentOverall) / steps;
    const interval = duration / steps;
    
    let currentOverallPercent = startPercentOverall;
    let step = 0;
    
    if (window.conversionSimulationInterval) {
        clearInterval(window.conversionSimulationInterval);
    }
    
    window.conversionSimulationInterval = setInterval(() => {
        step++;
        currentOverallPercent = startPercentOverall + (step * increment);
        currentOverallPercent = Math.min(currentOverallPercent, endPercentOverall); 
        
        updateProgressBar(currentOverallPercent);
        // progressBarText is NOT set here, allowing "Conversion en cours..." to persist
        
        if (step >= steps || currentOverallPercent >= endPercentOverall) {
            clearInterval(window.conversionSimulationInterval);
            window.conversionSimulationInterval = null;
        }
    }, interval);
}

// Check yt-dlp availability at startup
async function checkYtDlpAvailability() {
  try {
    const result = await window.electronAPI.checkYtDlpAvailability();
    if (!result.available) {
      console.log('yt-dlp not available:', result.error);
      ytDlpStatus.textContent = 'Non disponible';
      ytDlpStatus.className = 'binary-item-status error';
      downloadYtDlpBtn.style.display = 'inline-block';
      return false;
    } else {
      console.log('yt-dlp binary available at:', result.path);
      ytDlpStatus.textContent = 'Disponible';
      ytDlpStatus.className = 'binary-item-status available';
      downloadYtDlpBtn.style.display = 'none';
      ytDlpBinaryItem.style.display = 'none';
      return true;
    }
  } catch (error) {
    console.error('Error checking yt-dlp availability:', error);
    ytDlpStatus.textContent = 'Erreur de vérification';
    ytDlpStatus.className = 'binary-item-status error';
    downloadYtDlpBtn.style.display = 'inline-block';
    return false;
  }
}

// Check ffmpeg availability at startup
async function checkFfmpegAvailability() {
  try {
    const result = await window.electronAPI.checkFfmpegAvailability();
    if (!result.available) {
      console.log('ffmpeg not available:', result.error);
      ffmpegStatus.textContent = 'Non disponible';
      ffmpegStatus.className = 'binary-item-status error';
      downloadFfmpegBtn.style.display = 'inline-block';
      return false;
    } else {
      console.log('ffmpeg binary available at:', result.path);
      ffmpegStatus.textContent = 'Disponible';
      ffmpegStatus.className = 'binary-item-status available';
      downloadFfmpegBtn.style.display = 'none';
      ffmpegBinaryItem.style.display = 'none';
      return true;
    }
  } catch (error) {
    console.error('Error checking ffmpeg availability:', error);
    ffmpegStatus.textContent = 'Erreur de vérification';
    ffmpegStatus.className = 'binary-item-status error';
    downloadFfmpegBtn.style.display = 'inline-block';
    return false;
  }
}

// Show binary download popup if needed
async function checkAndShowBinaryPopup() {
  const ytDlpAvailable = await checkYtDlpAvailability();
  const ffmpegAvailable = await checkFfmpegAvailability();
  
  if (!ytDlpAvailable || !ffmpegAvailable) {
    // Show items that need downloading
    if (!ytDlpAvailable) {
      ytDlpBinaryItem.style.display = 'flex';
    }
    if (!ffmpegAvailable) {
      ffmpegBinaryItem.style.display = 'flex';
    }
    binaryDownloadPopup.style.display = 'flex';
  } else {
    binaryDownloadPopup.style.display = 'none';
  }
}

// Normalize release notes (GitHub HTML -> readable plain text)
function formatReleaseNotes(rawNotes) {
    if (!rawNotes || typeof rawNotes !== 'string') {
        return '';
    }

    // Preserve basic structure: paragraphs and line breaks
    let html = rawNotes
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const text = (tempDiv.textContent || tempDiv.innerText || '').trim();

    if (!text) {
        return '';
    }

    if (text.length > 1500) {
        return text.slice(0, 1500) + '…';
    }
    return text;
}

// Handle application auto-updates with custom UI
function initAutoUpdateHandling() {
    if (!window.electronAPI || !window.electronAPI.checkForUpdates) {
        return;
    }

    if (hasInitializedAutoUpdateUI) {
        return;
    }
    hasInitializedAutoUpdateUI = true;

    const openUpdatePopup = () => {
        if (!updatePopup) return;
        updatePopup.style.display = 'flex';
    };

    const closeUpdatePopupInternal = () => {
        if (!updatePopup) return;
        updatePopup.style.display = 'none';
        if (updateProgressSection) {
            updateProgressSection.style.display = 'none';
        }
        if (updateInitialActions) {
            updateInitialActions.style.display = 'flex';
        }
        if (updateReadyActions) {
            updateReadyActions.style.display = 'none';
        }
    };

    if (closeUpdatePopup) {
        closeUpdatePopup.addEventListener('click', () => {
            closeUpdatePopupInternal();
        });
    }

    if (updateRemindLaterBtn) {
        updateRemindLaterBtn.addEventListener('click', () => {
            closeUpdatePopupInternal();
        });
    }

    if (updateSkipBtn) {
        updateSkipBtn.addEventListener('click', async () => {
            try {
                if (latestAvailableUpdateVersion) {
                    await window.electronAPI.skipUpdateVersion(latestAvailableUpdateVersion);
                }
            } catch (error) {
                console.error('Failed to skip update version:', error);
            }
            closeUpdatePopupInternal();
        });
    }

    if (updateInstallBtn) {
        updateInstallBtn.addEventListener('click', async () => {
            if (updateInitialActions) {
                updateInitialActions.style.display = 'none';
            }
            if (updateProgressSection) {
                updateProgressSection.style.display = 'block';
            }
            if (updateReadyActions) {
                updateReadyActions.style.display = 'none';
            }
            if (updateProgressText) {
                updateProgressText.textContent = window.i18n.t('update.preparingDownload');
            }

            try {
                await window.electronAPI.startUpdateDownload();
            } catch (error) {
                console.error('Failed to start update download:', error);
                displayUserMessage(window.i18n.t('update.errorStartingDownload'), 'error');
                closeUpdatePopupInternal();
            }
        });
    }

    if (updateRestartNowBtn) {
        updateRestartNowBtn.addEventListener('click', async () => {
            try {
                await window.electronAPI.installUpdateNow();
            } catch (error) {
                console.error('Failed to install update:', error);
                displayUserMessage(window.i18n.t('update.errorInstalling'), 'error');
            }
        });
    }

    if (updateRestartLaterBtn) {
        updateRestartLaterBtn.addEventListener('click', () => {
            closeUpdatePopupInternal();
        });
    }

    window.electronAPI.onUpdateAvailable((info) => {
        if (!info || !updatePopup) return;

        latestAvailableUpdateVersion = info.version || null;

        if (currentVersionLabel) {
            currentVersionLabel.textContent = info.currentVersion || '-';
        }
        if (newVersionLabel) {
            newVersionLabel.textContent = info.version || '-';
        }

        if (info.releaseNotes && typeof info.releaseNotes === 'string' && updateReleaseNotes) {
            const notes = formatReleaseNotes(info.releaseNotes);
            if (notes) {
                updateReleaseNotes.style.display = 'block';
                updateReleaseNotes.textContent = notes;
            } else {
                updateReleaseNotes.style.display = 'none';
                updateReleaseNotes.textContent = '';
            }
        } else if (updateReleaseNotes) {
            updateReleaseNotes.style.display = 'none';
            updateReleaseNotes.textContent = '';
        }

        if (updateMessage) {
            updateMessage.textContent = window.i18n.t('update.availableMessage');
        }

        if (updateInitialActions) {
            updateInitialActions.style.display = 'flex';
        }
        if (updateProgressSection) {
            updateProgressSection.style.display = 'none';
        }
        if (updateReadyActions) {
            updateReadyActions.style.display = 'none';
        }

        openUpdatePopup();
    });

    window.electronAPI.onUpdateDownloadProgress((progress) => {
        if (!updatePopup || !updateProgressSection || !updateProgressText) return;

        if (updateInitialActions) {
            updateInitialActions.style.display = 'none';
        }
        updateProgressSection.style.display = 'block';
        if (updateReadyActions) {
            updateReadyActions.style.display = 'none';
        }

        let percent = 0;
        if (progress && typeof progress.percent === 'number') {
            percent = Math.round(progress.percent);
        }
        
        const unit = window.i18n.t('update.sizeUnit');
        let text;
        
        if (progress && typeof progress.transferred === 'number' && typeof progress.total === 'number' && typeof progress.bytesPerSecond === 'number') {
            // Full progress with size and speed
            const transferredMb = (progress.transferred / 1024 / 1024).toFixed(1);
            const totalMb = (progress.total / 1024 / 1024).toFixed(1);
            const speedMb = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
            text = window.i18n.t('update.downloadProgressFull', {
                percent: percent,
                transferred: transferredMb,
                total: totalMb,
                speed: speedMb,
                unit: unit
            });
        } else if (progress && typeof progress.transferred === 'number' && typeof progress.total === 'number') {
            // Progress with size only
            const transferredMb = (progress.transferred / 1024 / 1024).toFixed(1);
            const totalMb = (progress.total / 1024 / 1024).toFixed(1);
            text = window.i18n.t('update.downloadProgressWithSize', {
                percent: percent,
                transferred: transferredMb,
                total: totalMb,
                unit: unit
            });
        } else if (progress && typeof progress.bytesPerSecond === 'number') {
            // Progress with speed only
            const speedMb = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
            text = window.i18n.t('update.downloadProgressWithSpeed', {
                percent: percent,
                speed: speedMb,
                unit: unit
            });
        } else {
            // Basic progress only
            text = window.i18n.t('update.downloadProgress', { percent: percent });
        }

        updateProgressText.textContent = text;
    });

    window.electronAPI.onUpdateDownloaded((info) => {
        if (!updatePopup) return;

        if (info && info.version) {
            latestAvailableUpdateVersion = info.version;
            if (newVersionLabel) {
                newVersionLabel.textContent = info.version;
            }
        }

        if (updateProgressSection) {
            updateProgressSection.style.display = 'none';
        }
        if (updateInitialActions) {
            updateInitialActions.style.display = 'none';
        }
        if (updateReadyActions) {
            updateReadyActions.style.display = 'flex';
        }
        if (updateMessage) {
            updateMessage.textContent = window.i18n.t('update.downloadCompletedMessage');
        }
    });

    window.electronAPI.onUpdateError((info) => {
        const message = info && info.message
            ? info.message
            : 'Erreur lors de la vérification des mises à jour.';
        displayUserMessage(message, 'error');
        closeUpdatePopupInternal();
    });

    // We intentionally do not show anything when there is no update to avoid noise
    window.electronAPI.onUpdateNotAvailable(() => {
        // no-op
    });

    // Trigger a one-time check for updates when the UI is ready
    window.electronAPI.checkForUpdates().catch((error) => {
        console.error('Error checking for app updates:', error);
    });
}

// Cancel download button handler
cancelDownloadBtn.addEventListener('click', async () => {
    try {
        const result = await window.electronAPI.cancelDownload();
        if (result.success) {
            displayUserMessage('Téléchargement annulé', 'error');
            
            // Clear any running simulation
            conversionSimulationActive = false;
            if (window.conversionSimulationInterval) {
                clearInterval(window.conversionSimulationInterval);
                window.conversionSimulationInterval = null;
            }
            
            // Reset all listeners
            resetListeners();
            
            // Reset UI back to search screen
            resetUI();
        } else {
            displayUserMessage(window.i18n.t('download.cannotCancel'), 'error');
        }
    } catch (error) {
        console.error('Error cancelling download:', error);
        displayUserMessage(window.i18n.t('download.cancellationError'), 'error');
    }
});

// Playlist option buttons handlers
if (playlistSingleBtn && playlistFullBtn) {
    playlistSingleBtn.addEventListener('click', () => {
        if (!isPlaylistUrl) return;
        playlistMode = 'single';
        selectedVideoUrl = normalizeYouTubeUrl(originalVideoUrl || selectedVideoUrl);
        updatePlaylistUI();
        // Just hide playlist details, keep cached items so we can
        // restore them instantly if the user switches back to
        // "Playlist complète" without changing the URL.
        if (playlistDetails) {
            playlistDetails.style.display = 'none';
        }
        isActivePlaylistDownload = false;
        lastPlaylistIndex = null;
    });
    
    playlistFullBtn.addEventListener('click', async () => {
        if (!isPlaylistUrl) return;
        playlistMode = 'playlist';
        if (originalVideoUrl) {
            selectedVideoUrl = originalVideoUrl;
        }
        updatePlaylistUI();

        if (!playlistDetails || !playlistItemsList || !playlistDetailsHeader) {
            return;
        }

        // If we already have playlist data for this URL, just show it
        // without re-fetching from yt-dlp.
        if (currentPlaylistItems && currentPlaylistItems.length > 0) {
            playlistDetails.style.display = 'block';
            playlistDetailsHeader.textContent = window.i18n.t('playlist.fullWithCount', { count: currentPlaylistItems.length });
            return;
        }

        playlistDetails.style.display = 'block';
        playlistDetailsHeader.textContent = window.i18n.t('playlist.loading');
        playlistItemsList.innerHTML = '';
        currentPlaylistItems = [];

        try {
            const info = await window.electronAPI.getPlaylistInfo(originalVideoUrl || selectedVideoUrl);
            if (info && Array.isArray(info.items) && info.items.length > 0) {
                currentPlaylistItems = info.items;
                playlistDetailsHeader.textContent = window.i18n.t('playlist.fullWithCount', { count: info.items.length });
                playlistItemsList.innerHTML = '';

                info.items.forEach((item, index) => {
                    const li = document.createElement('li');
                    li.className = 'playlist-item';
                    li.textContent = `${index + 1}. ${item.title || window.i18n.t('playlist.untitledVideo')}`;
                    playlistItemsList.appendChild(li);
                });
            } else if (info && info.error) {
                playlistDetailsHeader.textContent = window.i18n.t('playlist.cannotRetrieve');
                playlistItemsList.innerHTML = '';
                displayUserMessage(info.error, 'error');
            } else {
                playlistDetailsHeader.textContent = window.i18n.t('playlist.none');
                playlistItemsList.innerHTML = '';
            }
        } catch (error) {
            console.error('Error fetching playlist info:', error);
            playlistDetailsHeader.textContent = window.i18n.t('playlist.errorRetrieving');
            playlistItemsList.innerHTML = '';
            displayUserMessage(window.i18n.t('playlist.errorRetrieving'), 'error');
        }
    });
}

// Initialize the default path when the script loads
initializePath();

// Check yt-dlp and ffmpeg availability and show popup if needed
checkAndShowBinaryPopup();

// Check for application updates on startup and handle custom UI
initAutoUpdateHandling();

// Initialize i18n / language handling
initLanguageHandling();