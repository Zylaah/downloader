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
    ytDlpStatus.textContent = 'Téléchargement...';
    ytDlpStatus.className = 'binary-item-status downloading';
    binaryDownloadProgress.style.display = 'block';
    binaryDownloadProgressText.textContent = 'Téléchargement de yt-dlp...';
    
    try {
        const result = await window.electronAPI.downloadYtDlpBinary();
        if (result.success) {
            ytDlpStatus.textContent = 'Disponible';
            ytDlpStatus.className = 'binary-item-status available';
            downloadYtDlpBtn.style.display = 'none';
            ytDlpBinaryItem.style.display = 'none';
            binaryDownloadProgressText.textContent = 'yt-dlp téléchargé avec succès!';
            setTimeout(() => {
                binaryDownloadProgress.style.display = 'none';
                // Check if both binaries are now available and close popup
                if (ffmpegStatus.className.includes('available') || ffmpegBinaryItem.style.display === 'none') {
                    binaryDownloadPopup.style.display = 'none';
                }
            }, 2000);
        } else {
            ytDlpStatus.textContent = 'Erreur: ' + (result.error || 'Échec du téléchargement');
            ytDlpStatus.className = 'binary-item-status error';
            downloadYtDlpBtn.disabled = false;
            binaryDownloadProgress.style.display = 'none';
        }
    } catch (error) {
        console.error('Error downloading yt-dlp:', error);
        ytDlpStatus.textContent = 'Erreur: ' + error.message;
        ytDlpStatus.className = 'binary-item-status error';
        downloadYtDlpBtn.disabled = false;
        binaryDownloadProgress.style.display = 'none';
    }
});

// Download ffmpeg binary
downloadFfmpegBtn.addEventListener('click', async () => {
    downloadFfmpegBtn.disabled = true;
    ffmpegStatus.textContent = 'Téléchargement...';
    ffmpegStatus.className = 'binary-item-status downloading';
    binaryDownloadProgress.style.display = 'block';
    binaryDownloadProgressText.textContent = 'Téléchargement de FFmpeg...';
    
    try {
        const result = await window.electronAPI.downloadFfmpegBinary();
        if (result.success) {
            ffmpegStatus.textContent = 'Disponible';
            ffmpegStatus.className = 'binary-item-status available';
            downloadFfmpegBtn.style.display = 'none';
            ffmpegBinaryItem.style.display = 'none';
            binaryDownloadProgressText.textContent = 'FFmpeg téléchargé avec succès!';
            setTimeout(() => {
                binaryDownloadProgress.style.display = 'none';
                // Check if both binaries are now available and close popup
                if (ytDlpStatus.className.includes('available') || ytDlpBinaryItem.style.display === 'none') {
                    binaryDownloadPopup.style.display = 'none';
                }
            }, 2000);
        } else {
            ffmpegStatus.textContent = 'Erreur: ' + (result.error || 'Échec du téléchargement');
            ffmpegStatus.className = 'binary-item-status error';
            downloadFfmpegBtn.disabled = false;
            binaryDownloadProgress.style.display = 'none';
        }
    } catch (error) {
        console.error('Error downloading ffmpeg:', error);
        ffmpegStatus.textContent = 'Erreur: ' + error.message;
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
        displayUserMessage('Error setting download path', 'error'); 
    }
});

downloadButton.addEventListener('click', () => {
    if (!selectedVideoUrl) {
        displayUserMessage('Veuillez sélectionner une vidéo d\'abord', 'error'); 
        return;
    }
    
    if (!currentDownloadPath) {
        displayUserMessage('Veuillez définir un emplacement de téléchargement', 'error');
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
    progressBarText.textContent = 'Préparation...'; 
    displayUserMessage('', null);

    const selectedFormat = formatSelect.value;
    const effectivePlaylistMode = isPlaylistUrl && playlistMode === 'playlist' ? 'playlist' : 'single';
    isActivePlaylistDownload = (effectivePlaylistMode === 'playlist');
    lastPlaylistIndex = null;

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
            progressBarText.textContent = 'Préparation...';
        } else if (actualDownloadPercent >= 99.5) {
            // Once download is effectively 100%, show a finalization message 
            // before conversion-phase-started event updates it to "Conversion..."
            progressBarText.textContent = 'Finalisation du téléchargement...';
        } else {
            progressBarText.textContent = `Téléchargement: ${Math.round(actualDownloadPercent)}%`;
        }
    });

    window.electronAPI.onConversionPhaseStarted(() => {
        if (conversionSimulationActive) return; 
        conversionSimulationActive = true;
        console.log("Conversion phase started signal received by renderer.");
        // Text is now explicitly "Conversion en cours..."
        progressBarText.textContent = 'Conversion en cours...';
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
        displayUserMessage('Téléchargement terminé avec succès !', 'complete');
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
        downloadButton.textContent = "Télécharger l'audio";
    } else if (selectedFormat === 'video') {
        downloadButton.textContent = "Télécharger la vidéo";
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
        displayUserMessage('Impossible de lire le presse-papiers', 'error');
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
        displayUserMessage('Veuillez entrer une requête de recherche ou un lien YouTube', 'error');
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
        selectedVideoTitle.textContent = 'Récupération des informations de la vidéo...';
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
                selectedVideoTitle.textContent = 'Vidéo sélectionnée depuis le lien';
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
            selectedVideoTitle.textContent = 'Vidéo sélectionnée depuis le lien';
            
            // Show download button even if title fetch failed
            downloadButton.style.display = 'inline-block';
            // Still update playlist options once we've attempted to retrieve info
            updatePlaylistUI();
        } finally {
            // Clear the controller
            videoInfoController = null;
        }
        
        displayUserMessage('Lien YouTube détecté et sélectionné', 'success');
        return;
    }

    // Show loading state for search
    searchButton.disabled = true;
    searchButton.textContent = 'Recherche...';
    searchResults.innerHTML = '<div class="search-result-item">Recherche en cours...</div>';
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
        displayUserMessage('Erreur lors de la recherche', 'error');
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
            displayUserMessage('Impossible d\'annuler le téléchargement', 'error');
        }
    } catch (error) {
        console.error('Error cancelling download:', error);
        displayUserMessage('Erreur lors de l\'annulation', 'error');
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
            playlistDetailsHeader.textContent = `Playlist complète (${currentPlaylistItems.length} vidéos)`;
            return;
        }

        playlistDetails.style.display = 'block';
        playlistDetailsHeader.textContent = 'Chargement de la playlist...';
        playlistItemsList.innerHTML = '';
        currentPlaylistItems = [];

        try {
            const info = await window.electronAPI.getPlaylistInfo(originalVideoUrl || selectedVideoUrl);
            if (info && Array.isArray(info.items) && info.items.length > 0) {
                currentPlaylistItems = info.items;
                playlistDetailsHeader.textContent = `Playlist complète (${info.items.length} vidéos)`;
                playlistItemsList.innerHTML = '';

                info.items.forEach((item, index) => {
                    const li = document.createElement('li');
                    li.className = 'playlist-item';
                    li.textContent = `${index + 1}. ${item.title || 'Vidéo sans titre'}`;
                    playlistItemsList.appendChild(li);
                });
            } else if (info && info.error) {
                playlistDetailsHeader.textContent = 'Impossible de récupérer la playlist';
                playlistItemsList.innerHTML = '';
                displayUserMessage(info.error, 'error');
            } else {
                playlistDetailsHeader.textContent = 'Aucun élément dans cette playlist';
                playlistItemsList.innerHTML = '';
            }
        } catch (error) {
            console.error('Error fetching playlist info:', error);
            playlistDetailsHeader.textContent = 'Erreur lors de la récupération de la playlist';
            playlistItemsList.innerHTML = '';
            displayUserMessage('Erreur lors de la récupération de la playlist', 'error');
        }
    });
}

// Initialize the default path when the script loads
initializePath();

// Check yt-dlp and ffmpeg availability and show popup if needed
checkAndShowBinaryPopup();