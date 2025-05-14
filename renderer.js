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
const backButton = document.getElementById('backButton');

// Title bar controls
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeRestoreBtn = document.getElementById('maximizeRestoreBtn');
const maximizeIcon = document.getElementById('maximizeIcon');
const restoreIcon = document.getElementById('restoreIcon');
const closeBtn = document.getElementById('closeBtn');

let currentDownloadPath = '';
let messageTimeout = null; // To store the timeout ID for the message area
let selectedVideoUrl = ''; // Store the selected video URL
const DOWNLOAD_PROGRESS_SCALE = 0.85; // Download part takes up 85% of the bar
let conversionSimulationActive = false;

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
}

function resetUI() {
    // Hide the completion notification
    completionNotification.style.display = 'none';
    
    // Clear search field and results
    searchQuery.value = '';
    searchResults.style.display = 'none';
    
    // Show search input again
    document.querySelector('.search-container').style.display = 'flex';
    
    // Reset selected video display
    selectedVideoContainer.style.display = 'none';
    selectedVideoTitle.textContent = '';
    
    // Hide back button
    backButton.style.display = 'none';
    
    // Reset selected video URL
    selectedVideoUrl = '';
    
    // Show download button
    downloadButton.disabled = false;
    downloadButton.style.display = 'inline-block';
    
    // Hide progress
    progressContainer.style.display = 'none';
    
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
    updateProgressBar(0); 
    progressBarText.textContent = 'Préparation...'; 
    displayUserMessage('', null);

    window.electronAPI.downloadAudio(selectedVideoUrl, currentDownloadPath);

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

    window.electronAPI.onDownloadComplete((message) => {
        if (window.conversionSimulationInterval) {
            clearInterval(window.conversionSimulationInterval);
            window.conversionSimulationInterval = null;
        }
        progressContainer.style.display = 'none'; // Hide the progress bar container

        selectedVideoContainer.style.display = 'none';
        completionNotification.style.display = 'block';
        displayUserMessage('Téléchargement terminé avec succès !', 'complete');
        resetListeners();
    });

    window.electronAPI.onDownloadError((errorMessage) => {
        displayUserMessage(errorMessage, 'error');
        progressContainer.style.display = 'none';
        downloadButton.style.display = 'inline-block';
        conversionSimulationActive = false;
        if (window.conversionSimulationInterval) {
            clearInterval(window.conversionSimulationInterval);
        }
        resetListeners();
    });

    window.electronAPI.onDownloadCancelled(() => {
        progressContainer.style.display = 'none';
        downloadButton.style.display = 'inline-block';
        conversionSimulationActive = false;
        if (window.conversionSimulationInterval) {
            clearInterval(window.conversionSimulationInterval);
        }
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
            
            // Hide search input section
            document.querySelector('.search-container').style.display = 'none';
            
            // Show back button
            backButton.style.display = 'flex';
            
            // Focus download button
            downloadButton.focus();
        });
        
        searchResults.appendChild(resultItem);
    });
    
    searchResults.style.display = 'block';
}

// Back button functionality
backButton.addEventListener('click', () => {
    // Show search container again
    document.querySelector('.search-container').style.display = 'flex';
    
    // Show search results
    searchResults.style.display = 'block';
    
    // Hide selected video container
    selectedVideoContainer.style.display = 'none';
    
    // Hide back button
    backButton.style.display = 'none';
    
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

// Initialize the default path when the script loads
initializePath(); 