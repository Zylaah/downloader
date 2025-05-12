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
const saveSettingsButton = document.getElementById('saveSettingsButton');
const selectedVideoContainer = document.getElementById('selectedVideoContainer');
const selectedVideoTitle = document.getElementById('selectedVideoTitle');

// Title bar controls
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeRestoreBtn = document.getElementById('maximizeRestoreBtn');
const maximizeIcon = document.getElementById('maximizeIcon');
const restoreIcon = document.getElementById('restoreIcon');
const closeBtn = document.getElementById('closeBtn');

let currentDownloadPath = '';
let messageTimeout = null; // To store the timeout ID for the message area
let selectedVideoUrl = ''; // Store the selected video URL

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

saveSettingsButton.addEventListener('click', () => {
    settingsPopup.style.display = 'none';
});

// Close popup when clicking outside
settingsPopup.addEventListener('click', (e) => {
    if (e.target === settingsPopup) {
        settingsPopup.style.display = 'none';
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
    progressBarText.textContent = `${Math.round(percentNumber)}%`;
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
    window.electronAPI.removeAllListeners('download-complete');
    window.electronAPI.removeAllListeners('download-error');
    window.electronAPI.removeAllListeners('download-cancelled');
}

function resetUI() {
    // Hide the completion notification
    completionNotification.style.display = 'none';
    
    // Clear search field and results
    searchQuery.value = '';
    searchResults.style.display = 'none';
    
    // Reset selected video display
    selectedVideoContainer.style.display = 'none';
    selectedVideoTitle.textContent = '';
    
    // Reset selected video URL
    selectedVideoUrl = '';
    
    // Show download button
    downloadButton.disabled = false;
    downloadButton.style.display = 'inline-block';
    
    // Hide progress
    progressContainer.style.display = 'none';
    
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
        // Show the settings popup if no download path is set
        settingsPopup.style.display = 'flex';
        return;
    }

    resetListeners();
    
    // Hide the search results and download button
    searchResults.style.display = 'none';
    downloadButton.style.display = 'none';
    
    // Show progress
    progressContainer.style.display = 'block';
    updateProgressBar(0);
    
    // Clear any existing message
    displayUserMessage('', null);

    window.electronAPI.downloadAudio(selectedVideoUrl, currentDownloadPath);

    window.electronAPI.onDownloadProgress((progressData) => {
        let percentValueForBar = 0;

        if (typeof progressData === 'string') {
            const percentMatch = progressData.match(/(\d+\.?\d*)\s*%/);
            if (percentMatch && percentMatch[1]) {
                percentValueForBar = parseFloat(percentMatch[1]);
            }
        } else if (progressData && typeof progressData === 'object' && progressData.percent != null) {
            if (typeof progressData.percent === 'string') {
                percentValueForBar = parseFloat(progressData.percent.replace('%',''));
            } else if (typeof progressData.percent === 'number') {
                 percentValueForBar = progressData.percent;
            }
        }
        
        updateProgressBar(percentValueForBar);
    });

    window.electronAPI.onDownloadComplete((message) => {
        updateProgressBar(100);
        
        // Hide progress and show completion
        progressContainer.style.display = 'none';
        completionNotification.style.display = 'block';
        
        // Show a toast notification
        displayUserMessage('Téléchargement terminé avec succès !', 'complete');
        
        // Reset listeners
        resetListeners();
    });

    window.electronAPI.onDownloadError((errorMessage) => {
        displayUserMessage(errorMessage, 'error');
        
        // Hide progress and show download button again
        progressContainer.style.display = 'none';
        downloadButton.style.display = 'inline-block';
        
        resetListeners();
    });

    window.electronAPI.onDownloadCancelled(() => {
        // Reset UI
        progressContainer.style.display = 'none';
        downloadButton.style.display = 'inline-block';
        
        resetListeners();
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

// Function to search for YouTube videos
async function performSearch() {
    const query = searchQuery.value.trim();
    if (!query) {
        displayUserMessage('Veuillez entrer une requête de recherche', 'error');
        return;
    }

    // Show loading state
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
        searchButton.textContent = 'Rechercher';
    }
}

// Function to display search results
function displaySearchResults(results) {
    searchResults.innerHTML = '';
    
    results.forEach(video => {
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
            selectedVideoUrl = video.url;
            
            // Display selected video title
            selectedVideoTitle.textContent = video.title;
            selectedVideoContainer.style.display = 'block';
            
            // Hide search results
            searchResults.style.display = 'none';
            
            // Focus download button
            downloadButton.focus();
        });
        
        searchResults.appendChild(resultItem);
    });
    
    searchResults.style.display = 'block';
}

// Initialize the default path when the script loads
initializePath(); 