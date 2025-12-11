import React, { useState, useEffect } from 'react';
import FileBrowser from './components/FileBrowser.jsx';
import MediaPlayer from './components/MediaPlayer.jsx';
import FavoritesSection from './components/FavoritesSection.jsx';
import WatchLaterSection from './components/WatchLaterSection.jsx';
import { api } from './services/api';

// Helper to check if a path is likely a file (has extension)
const isFilePath = (path) => {
  if (!path || path === '/') return false;
  // Remove trailing slash if present
  const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
  // Check if it has a file extension (contains a dot in the last segment)
  const lastSegment = cleanPath.split('/').pop();
  return lastSegment.includes('.') && lastSegment.split('.').length > 1;
};

// Extract full filename from path (handles truncated names)
const getFullFileName = (file) => {
  // If name looks truncated (ends with .. or &gt;), extract from path
  if (file.name && (file.name.endsWith('..') || file.name.endsWith('&gt;') || file.name.includes('..&gt;'))) {
    if (file.path) {
      const pathParts = file.path.split('/');
      const fullName = pathParts[pathParts.length - 1];
      // Decode HTML entities
      const textarea = document.createElement("textarea");
      textarea.innerHTML = fullName;
      return textarea.value;
    }
  }
  // Decode HTML entities
  const textarea = document.createElement("textarea");
  textarea.innerHTML = file.name || '';
  return textarea.value;
};

// Extract file extension from path
const getFileExtension = (file) => {
  const fileName = file.path ? file.path.split('/').pop() : file.name;
  const ext = fileName.toLowerCase().split('.').pop();
  return ext;
};

// Helper to get parent directory from a path
const getParentPath = (path) => {
  if (!path || path === '/') return '/';
  const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
  const parent = cleanPath.split('/').slice(0, -1).join('/') || '/';
  return parent;
};

function App() {
  // Get initial path from URL or default to '/'
  const getInitialPath = () => {
    const params = new URLSearchParams(window.location.search);
    const pathParam = params.get('path');
    return pathParam || '/';
  };

  const [selectedFile, setSelectedFile] = useState(null);
  const [currentPath, setCurrentPath] = useState(() => {
    const initialPath = getInitialPath();
    // If the initial path is a file, return its parent directory
    return isFilePath(initialPath) ? getParentPath(initialPath) : initialPath;
  });
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [relatedFiles, setRelatedFiles] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Autoplay and autostart settings (persisted in localStorage)
  const [autoplay, setAutoplay] = useState(() => {
    const saved = localStorage.getItem('autoplay');
    return saved !== null ? saved === 'true' : true; // Default to true
  });
  const [autostart, setAutostart] = useState(() => {
    const saved = localStorage.getItem('autostart');
    return saved !== null ? saved === 'true' : false; // Default to false
  });
  
  // Save autoplay/autostart to localStorage when they change
  useEffect(() => {
    localStorage.setItem('autoplay', autoplay.toString());
  }, [autoplay]);
  
  useEffect(() => {
    localStorage.setItem('autostart', autostart.toString());
  }, [autostart]);

  // Update URL when path changes (but not during initial file load)
  useEffect(() => {
    // Skip URL update during initial load if we're restoring a file
    if (isInitialLoad) {
      return;
    }

    // Only update URL if no file is selected (directory navigation)
    if (!selectedFile) {
      const params = new URLSearchParams(window.location.search);
      if (currentPath === '/') {
        params.delete('path');
      } else {
        params.set('path', currentPath);
      }
      
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      
      // Use replaceState to avoid adding to browser history
      window.history.replaceState({}, '', newUrl);
    }
  }, [currentPath, selectedFile, isInitialLoad]);

  // Restore file selection from URL on initial load
  useEffect(() => {
    const initialPath = getInitialPath();
    if (isFilePath(initialPath)) {
      // Load file info and set as selected file
      api.getFileInfo(initialPath)
        .then((fileInfo) => {
          setSelectedFile({
            ...fileInfo,
            type: 'file'
          });
          setIsInitialLoad(false);
        })
        .catch((err) => {
          console.error('Error loading file info on reload:', err);
          // If it fails, treat it as a directory path
          setCurrentPath(initialPath);
          setIsInitialLoad(false);
        });
    } else {
      setIsInitialLoad(false);
    }
  }, []); // Only run on initial mount

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = getInitialPath();
      if (isFilePath(path)) {
        // Load file info
        api.getFileInfo(path)
          .then((fileInfo) => {
            setSelectedFile({
              ...fileInfo,
              type: 'file'
            });
            setCurrentPath(getParentPath(path));
          })
          .catch((err) => {
            console.error('Error loading file info on navigation:', err);
            setCurrentPath(path);
            setSelectedFile(null);
          });
      } else {
        setCurrentPath(path);
        setSelectedFile(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load related files when a file is selected (for autoplay)
  useEffect(() => {
    if (!selectedFile) {
      setRelatedFiles([]);
      return;
    }

    const loadRelatedFiles = async () => {
      try {
        // Load related files from the same directory
        const parentPath = getParentPath(selectedFile.path);
        const fileList = await api.listFiles(parentPath);
        const mediaFiles = fileList.filter(f => {
          if (f.type !== 'file') return false;
          const ext = getFileExtension(f);
          const videoExts = ['mp4', 'webm', 'ogg', 'ogv', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts', 'mpg', 'mpeg'];
          const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'oga', 'opus', 'wma'];
          return videoExts.includes(ext) || audioExts.includes(ext);
        });

        // Sort files naturally (for series episodes) - use full filename from path
        mediaFiles.sort((a, b) => {
          const nameA = getFullFileName(a);
          const nameB = getFullFileName(b);
          return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        });

        setRelatedFiles(mediaFiles);
      } catch (err) {
        console.error('Error loading related files:', err);
      }
    };

    loadRelatedFiles();
  }, [selectedFile]);

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    // Update URL with file path
    const params = new URLSearchParams(window.location.search);
    params.set('path', file.path);
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  const handlePathChange = (path) => {
    setCurrentPath(path);
    setSelectedFile(null); // Clear selection when navigating
    // Update URL with directory path
    const params = new URLSearchParams(window.location.search);
    if (path === '/') {
      params.delete('path');
    } else {
      params.set('path', path);
    }
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  };

  const handleBackToBrowser = () => {
    setSelectedFile(null);
    // Update URL to current directory
    const params = new URLSearchParams(window.location.search);
    if (currentPath === '/') {
      params.delete('path');
    } else {
      params.set('path', currentPath);
    }
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  };

  const handleGoHome = () => {
    setSelectedFile(null);
    setCurrentPath('/');
    const params = new URLSearchParams(window.location.search);
    params.delete('path');
    window.history.pushState({}, '', window.location.pathname);
  };

  // Handle autoplay - when current file ends, play next related file (only if autoplay is enabled)
  const handleMediaEnded = () => {
    if (autoplay && relatedFiles.length > 0) {
      const currentIndex = relatedFiles.findIndex(f => f.path === selectedFile.path);
      if (currentIndex >= 0 && currentIndex < relatedFiles.length - 1) {
        const nextFile = relatedFiles[currentIndex + 1];
        setSelectedFile(nextFile);
      }
    }
  };

  // If file is selected, show full-screen player
  if (selectedFile) {
    const currentIndex = relatedFiles.findIndex(f => f.path === selectedFile.path);

    return (
      <div className="w-screen h-screen bg-black relative overflow-hidden">
        {/* Controls overlay */}
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between gap-4">
          {/* Logo/Home button */}
          <button
            onClick={handleGoHome}
            className="px-4 py-2 bg-black/70 hover:bg-black/90 text-white rounded-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 backdrop-blur-sm font-semibold text-lg"
            aria-label="Go to home"
          >
            PirateFlix
          </button>
          
          {/* Back button */}
          <button
            onClick={handleBackToBrowser}
            className="px-4 py-2 bg-black/70 hover:bg-black/90 text-white rounded-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 backdrop-blur-sm"
            aria-label="Back to library"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span className="hidden sm:inline font-medium">Back to Library</span>
          </button>
          
          {/* Settings Toggles */}
          <div className="flex items-center gap-3">
            {/* Autoplay Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoplay}
                onChange={(e) => setAutoplay(e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                autoplay ? 'bg-[#00A8E1]' : 'bg-white/20'
              }`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                  autoplay ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-white/70 text-xs font-medium hidden sm:inline group-hover:text-white transition-colors">
                Autoplay
              </span>
            </label>
            
            {/* Autostart Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                autostart ? 'bg-[#00A8E1]' : 'bg-white/20'
              }`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                  autostart ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-white/70 text-xs font-medium hidden sm:inline group-hover:text-white transition-colors">
                Autostart
              </span>
            </label>
          </div>
        </div>
        <MediaPlayer 
          file={selectedFile} 
          onEnded={handleMediaEnded}
          autoplayNext={currentIndex >= 0 && currentIndex < relatedFiles.length - 1}
          autostart={autostart}
        />
      </div>
    );
  }

  // Otherwise, show full-screen browser
  return (
    <div className="w-screen h-screen flex flex-col bg-[#0f1419] overflow-hidden">
      <header className="bg-[#1a2332] border-b border-white/5 px-4 sm:px-6 md:px-8 py-3 sm:py-4 flex-shrink-0 z-30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button
              onClick={handleGoHome}
              className="m-0 text-lg sm:text-xl md:text-2xl text-white font-semibold truncate hover:text-[#00A8E1] transition-colors cursor-pointer"
            >
              PirateFlix
            </button>
          </div>
          {/* Settings Toggles */}
          <div className="flex items-center gap-3 mr-2">
            {/* Autoplay Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoplay}
                onChange={(e) => setAutoplay(e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                autoplay ? 'bg-[#00A8E1]' : 'bg-white/20'
              }`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                  autoplay ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-white/70 text-xs font-medium hidden sm:inline group-hover:text-white transition-colors">
                Autoplay
              </span>
            </label>
            
            {/* Autostart Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                autostart ? 'bg-[#00A8E1]' : 'bg-white/20'
              }`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                  autostart ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-white/70 text-xs font-medium hidden sm:inline group-hover:text-white transition-colors">
                Autostart
              </span>
            </label>
          </div>
          
          {/* Search Bar - Amazon Prime style */}
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <div className="relative">
                <svg 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-10 pr-10 py-2 bg-white/10 border border-white/20 rounded text-white placeholder-white/40 focus:outline-none focus:border-[#00A8E1] focus:bg-white/15 transition-all text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                    aria-label="Clear search"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <button
              className="sm:hidden p-2 text-white/70 hover:text-white transition-colors"
              aria-label="Search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      {currentPath === '/' ? (
        <div className="flex-1 overflow-y-auto">
          {/* Favorites Section */}
          <FavoritesSection
            onFileSelect={handleFileSelect}
            onPathChange={handlePathChange}
            refreshTrigger={refreshTrigger}
          />
          
          {/* File Browser */}
          <FileBrowser
            onFileSelect={handleFileSelect}
            currentPath={currentPath}
            onPathChange={handlePathChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isHomepage={true}
            onFavoritesChange={() => setRefreshTrigger(prev => prev + 1)}
            onWatchLaterChange={() => setRefreshTrigger(prev => prev + 1)}
          />
          
          {/* Watch Later Section */}
          <WatchLaterSection
            onFileSelect={handleFileSelect}
            onPathChange={handlePathChange}
            refreshTrigger={refreshTrigger}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <FileBrowser
            onFileSelect={handleFileSelect}
            currentPath={currentPath}
            onPathChange={handlePathChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
      )}
    </div>
  );
}

export default App;
