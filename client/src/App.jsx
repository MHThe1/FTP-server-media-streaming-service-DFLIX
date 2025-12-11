import React, { useState, useEffect } from 'react';
import FileBrowser from './components/FileBrowser.jsx';
import MediaPlayer from './components/MediaPlayer.jsx';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    // Update URL with file path
    const params = new URLSearchParams(window.location.search);
    params.set('path', file.path);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
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

  return (
    <div className="w-screen h-screen flex flex-col bg-[#121212]">
      <header className="bg-[#1a1a1a] px-4 sm:px-6 md:px-8 py-3 sm:py-4 border-b-2 border-[#007acc] shadow-lg">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden px-3 py-2 bg-[#007acc] text-white rounded text-sm hover:bg-[#005a9e] transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? '✕' : '☰'}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="m-0 text-lg sm:text-xl md:text-2xl text-[#e0e0e0] font-semibold truncate">HTTP Streaming Service</h1>
            <p className="mt-1 text-xs sm:text-sm text-[#888] hidden sm:block">Stream media files from your HTTP server</p>
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <div
          className={`
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            fixed lg:static
            top-0 left-0 h-full lg:h-auto
            w-[85vw] sm:w-[400px] max-w-[500px]
            bg-[#1e1e1e] border-r border-[#333]
            flex flex-col overflow-hidden
            z-50 lg:z-auto
            transition-transform duration-300 ease-in-out
            lg:transition-none
          `}
        >
          <FileBrowser
            onFileSelect={(file) => {
              handleFileSelect(file);
              setSidebarOpen(false); // Close sidebar on mobile when file is selected
            }}
            currentPath={currentPath}
            onPathChange={handlePathChange}
          />
        </div>
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 w-full">
          <MediaPlayer file={selectedFile} />
        </div>
      </div>
    </div>
  );
}

export default App;
