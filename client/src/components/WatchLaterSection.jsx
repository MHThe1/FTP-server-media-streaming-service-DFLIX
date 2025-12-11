import React, { useState, useEffect } from 'react';
import { watchLaterService } from '../services/storage';
import { api } from '../services/api';

// Extract full filename from path
const getFullFileName = (file) => {
  if (file.name && (file.name.endsWith('..') || file.name.endsWith('&gt;') || file.name.includes('..&gt;'))) {
    if (file.path) {
      const pathParts = file.path.split('/');
      const fullName = pathParts[pathParts.length - 1];
      const textarea = document.createElement("textarea");
      textarea.innerHTML = fullName;
      return textarea.value;
    }
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = file.name || '';
  return textarea.value;
};

// Extract media name from directory name
const extractMediaName = (dir) => {
  const dirName = dir.path ? dir.path.split('/').pop() : dir.name;
  let name = dirName
    .replace(/\([0-9]{4}\)/, '') // Remove year
    .replace(/S\d{2}E\d{2}/gi, '') // Remove season/episode
    .replace(/Season\s*\d+/gi, '') // Remove season
    .replace(/Episode\s*\d+/gi, '') // Remove episode
    .replace(/WEBRip|DVDRip|BluRay|HDTV|x264|x265|HEVC|H264|1080p|720p|480p|2160p|4K/gi, '')
    .replace(/\.mkv|\.mp4|\.avi|\.mov|\.webm|\.m4v|\.wmv|\.flv/gi, '')
    .replace(/[._]/g, ' ')
    .trim();
  const words = name.split(' ').filter(w => w.length > 0);
  return words.slice(0, 5).join(' ');
};

const WatchLaterSection = ({ onFileSelect, onPathChange, refreshTrigger }) => {
  const [watchLater, setWatchLater] = useState([]);
  const [mediaDetails, setMediaDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(new Set());

  useEffect(() => {
    loadWatchLater();
  }, [refreshTrigger]);

  const loadWatchLater = () => {
    const items = watchLaterService.getAll();
    // Only show directories
    const directories = items.filter(f => f.type === 'directory');
    setWatchLater(directories);
    
    // Load media details for directories
    directories.forEach(dir => {
      loadMediaDetails(dir);
    });
  };

  const loadMediaDetails = async (dir) => {
    const dirPath = dir.path;
    if (mediaDetails[dirPath] || loadingDetails.has(dirPath)) return;
    
    setLoadingDetails(prev => new Set(prev).add(dirPath));
    
    try {
      const mediaName = extractMediaName(dir);
      if (!mediaName || mediaName.length < 3) {
        setLoadingDetails(prev => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
        return;
      }

      // Search for media
      const searchResults = await api.searchMedia(mediaName, 'multi');
      if (searchResults.results && searchResults.results.length > 0) {
        const firstResult = searchResults.results[0];
        if (firstResult.id) {
          // Get full details
          const details = await api.getMediaDetails(firstResult.id, firstResult.mediaType);
          setMediaDetails(prev => ({
            ...prev,
            [dirPath]: details
          }));
        }
      }
    } catch (err) {
      console.error('Error loading media details for', dir.name, err);
    } finally {
      setLoadingDetails(prev => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  };

  const handleRemove = (e, dirPath) => {
    e.stopPropagation();
    watchLaterService.remove(dirPath);
    // Remove from media details
    setMediaDetails(prev => {
      const next = { ...prev };
      delete next[dirPath];
      return next;
    });
    loadWatchLater();
  };

  const handleItemClick = (dir) => {
    onPathChange(dir.path);
  };

  if (watchLater.length === 0) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8 border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-white">Watch Later</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {watchLater.map((dir, index) => {
            const details = mediaDetails[dir.path];
            const isLoading = loadingDetails.has(dir.path);
            const posterUrl = details?.posterPath;
            const dirName = getFullFileName(dir);
            
            return (
              <div
                key={index}
                className="group cursor-pointer relative"
                onClick={() => handleItemClick(dir)}
              >
                <div className="relative aspect-[2/3] bg-gradient-to-br from-[#1a2332] to-[#0f1419] rounded-lg overflow-hidden border border-white/10 hover:border-[#00A8E1]/50 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-[#00A8E1]/20">
                  {/* Poster Image */}
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={dirName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-[#00A8E1] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-6xl sm:text-7xl md:text-8xl opacity-80">
                        📁
                      </span>
                    </div>
                  )}
                  
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  
                  {/* Remove Button */}
                  <button
                    onClick={(e) => handleRemove(e, dir.path)}
                    className="absolute top-2 right-2 z-10 p-2 bg-black/70 hover:bg-red-600/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove from watch later"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                  
                  {/* Info Overlay on Hover */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/95 to-transparent">
                    <h3 className="text-sm font-semibold text-white mb-1 line-clamp-2">
                      {details?.title || dirName}
                    </h3>
                    {details?.releaseDate && (
                      <div className="text-xs text-white/70">
                        {new Date(details.releaseDate).getFullYear()}
                      </div>
                    )}
                  </div>
                  
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                    <div className="w-16 h-16 bg-[#00A8E1] rounded-full flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-1">
                        <polygon points="8 5 8 19 19 12 8 5"/>
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Title below card (mobile) */}
                <div className="mt-2 px-1 sm:hidden">
                  <p className="text-xs text-white/80 font-medium truncate">
                    {details?.title || dirName}
                  </p>
                  {details?.releaseDate && (
                    <p className="text-xs text-white/50">
                      {new Date(details.releaseDate).getFullYear()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WatchLaterSection;

