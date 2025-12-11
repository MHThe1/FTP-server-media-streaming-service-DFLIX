import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';

const SubtitleLoader = ({ player, fileName, onSubtitleLoad }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [subtitles, setSubtitles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subtitleUrl, setSubtitleUrl] = useState('');
  const [autoSearching, setAutoSearching] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  // Extract movie/show name from filename for subtitle search
  const extractMediaName = (filename) => {
    // Remove common patterns like year, quality, etc.
    let name = filename
      .replace(/\([0-9]{4}\)/, '') // Remove year
      .replace(/WEBRip|DVDRip|BluRay|HDTV|x264|x265|HEVC|H264|1080p|720p|480p/gi, '')
      .replace(/\.mkv|\.mp4|\.avi|\.mov|\.webm/gi, '')
      .replace(/[._]/g, ' ')
      .trim();
    
    // Take first few words as the title
    const words = name.split(' ').filter(w => w.length > 0);
    return words.slice(0, 5).join(' ');
  };

  // Auto-search when panel opens
  useEffect(() => {
    if (isOpen && fileName && !autoSearching && subtitles.length === 0) {
      autoSearchSubtitles();
    }
  }, [isOpen, fileName]);

  const autoSearchSubtitles = async () => {
    if (!fileName) return;
    
    setAutoSearching(true);
    setLoading(true);
    setError(null);
    
    try {
      const mediaName = extractMediaName(fileName);
      if (!mediaName || mediaName.length < 3) {
        setLoading(false);
        setAutoSearching(false);
        return;
      }

      const results = await api.searchSubtitles(mediaName, selectedLanguage);
      setSubtitles(results || []);
    } catch (err) {
      console.error('Auto-search error:', err);
      // Don't show error for auto-search, just log it
    } finally {
      setLoading(false);
      setAutoSearching(false);
    }
  };

  const searchSubtitles = async () => {
    if (!fileName) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const mediaName = extractMediaName(fileName);
      if (!mediaName || mediaName.length < 3) {
        setError('Please provide a valid media file name');
        setLoading(false);
        return;
      }

      const results = await api.searchSubtitles(mediaName, selectedLanguage);
      setSubtitles(results || []);
      
      if (!results || results.length === 0) {
        setError('No subtitles found. Try a different language or search manually.');
      }
    } catch (err) {
      setError('Failed to search subtitles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSubtitleFromUrl = async (url) => {
    if (!player || !url) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use proxy if it's an OpenSubtitles URL, otherwise direct fetch
      let subtitleUrl = url;
      if (url.includes('opensubtitles.org') || url.includes('opensubtitles.com')) {
        subtitleUrl = api.getSubtitleDownloadUrl(url);
      }
      
      // Fetch subtitle file
      const response = await fetch(subtitleUrl);
      if (!response.ok) throw new Error('Failed to fetch subtitle');
      
      let text = await response.text();
      
      // Convert SRT to VTT if needed
      let vttContent = text;
      if (url.includes('.srt') || text.startsWith('1\n') || /^\d+\n\d{2}:\d{2}:\d{2}/.test(text)) {
        vttContent = convertSRTtoVTT(text);
      }
      
      // Create a blob URL for the subtitle
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      
      // Get the underlying media element from Vidstack player
      const mediaElement = player?.querySelector('video') || player?.querySelector('audio');
      if (!mediaElement) {
        throw new Error('Media element not found');
      }
      
      // Remove existing subtitles
      const tracks = mediaElement.textTracks;
      for (let i = tracks.length - 1; i >= 0; i--) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
          const track = tracks[i];
          track.mode = 'disabled';
          if (track.cueList) {
            for (let j = track.cueList.length - 1; j >= 0; j--) {
              track.removeCue(track.cueList[j]);
            }
          }
        }
      }
      
      // Add subtitle track using native HTML5 API
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.src = blobUrl;
      track.srclang = selectedLanguage;
      track.label = 'Loaded Subtitle';
      track.default = true;
      mediaElement.appendChild(track);
      
      if (onSubtitleLoad) {
        onSubtitleLoad(blobUrl);
      }
      
      setIsOpen(false);
      setError(null);
    } catch (err) {
      setError('Failed to load subtitle: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUrl = () => {
    if (subtitleUrl.trim()) {
      loadSubtitleFromUrl(subtitleUrl.trim());
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        
        // Convert SRT to VTT if needed
        let vttContent = content;
        if (file.name.endsWith('.srt')) {
          vttContent = convertSRTtoVTT(content);
        }
        
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);
        
        // Get the underlying media element from Vidstack player
        const mediaElement = player?.querySelector('video') || player?.querySelector('audio');
        if (!mediaElement) {
          throw new Error('Media element not found');
        }
        
        // Remove existing subtitles
        const tracks = mediaElement.textTracks;
        for (let i = tracks.length - 1; i >= 0; i--) {
          if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
            const track = tracks[i];
            track.mode = 'disabled';
            if (track.cueList) {
              for (let j = track.cueList.length - 1; j >= 0; j--) {
                track.removeCue(track.cueList[j]);
              }
            }
          }
        }
        
        // Add subtitle track using native HTML5 API
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.src = blobUrl;
        track.srclang = 'en';
        track.label = file.name;
        track.default = true;
        mediaElement.appendChild(track);
        
        if (onSubtitleLoad) {
          onSubtitleLoad(blobUrl);
        }
        
        setIsOpen(false);
        setError(null);
      } catch (err) {
        setError('Failed to load file: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const convertSRTtoVTT = (srtContent) => {
    let vtt = 'WEBVTT\n\n';
    const blocks = srtContent.split(/\n\s*\n/);
    
    blocks.forEach(block => {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const timecode = lines[1].replace(/,/g, '.');
        const text = lines.slice(2).join('\n');
        vtt += `${timecode}\n${text}\n\n`;
      }
    });
    
    return vtt;
  };

  // Position panel relative to button
  useEffect(() => {
    if (isOpen && buttonRef.current && panelRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const panel = panelRef.current;
      
      // Try to position panel below the button first
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const panelHeight = panel.offsetHeight || 400; // fallback height
      
      if (spaceBelow >= panelHeight + 20 || spaceBelow > spaceAbove) {
        // Position below the button
        panel.style.top = `${buttonRect.bottom + 10}px`;
        panel.style.transform = 'translateY(0)';
      } else {
        // Position above the button
        panel.style.top = `${buttonRect.top - panelHeight - 10}px`;
        panel.style.transform = 'translateY(0)';
      }
      
      // Position horizontally - align to right edge of button
      panel.style.right = `${window.innerWidth - buttonRect.right}px`;
      
      // Ensure it doesn't go off the right edge
      if (buttonRect.right - 400 < 0) {
        panel.style.right = '20px';
      }
      
      // Ensure it doesn't go off the left edge
      if (buttonRect.right + 400 > window.innerWidth) {
        panel.style.right = '20px';
      }
    }
  }, [isOpen, subtitles.length]);

  const getSubtitleCatUrl = () => {
    const mediaName = extractMediaName(fileName);
    return `https://www.subtitlecat.com/index.php?search=${encodeURIComponent(mediaName)}`;
  };

  return (
    <div className="relative inline-block" style={{ zIndex: 10000 }}>
      <button 
        ref={buttonRef}
        className="bg-white/10 border border-white/20 text-white px-3 py-2 rounded text-sm font-bold transition-all ml-2.5 hover:bg-white/20 hover:border-white/30 relative"
        style={{ zIndex: 10001 }}
        onClick={() => setIsOpen(!isOpen)}
        title="Load Subtitles"
      >
        <span>CC</span>
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-transparent"
            style={{ zIndex: 99998 }}
            onClick={() => setIsOpen(false)}
          ></div>
          <div 
            ref={panelRef} 
            className="fixed bg-[#2a2a2a] border border-[#444] rounded-lg shadow-lg w-[400px] max-w-[90vw] max-h-[80vh] overflow-y-auto"
            style={{ zIndex: 99999 }}
          >
            <div className="flex justify-between items-center p-4 border-b border-[#444]">
              <h4 className="m-0 text-[#e0e0e0] text-base">Load Subtitles</h4>
              <button 
                onClick={() => setIsOpen(false)}
                className="bg-transparent border-none text-[#888] text-2xl cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
            
            <div className="p-4">
              {/* Auto-search results */}
              {subtitles.length > 0 && (
                <div className="mb-5">
                  <label className="block mb-2 text-[#ccc] text-sm font-medium">Found Subtitles ({subtitles.length}):</label>
                  <div className="max-h-[200px] overflow-y-auto border border-[#444] rounded bg-[#1e1e1e]">
                    {subtitles.slice(0, 10).map((sub, index) => (
                      <div 
                        key={sub.id || index} 
                        className="p-3 border-b border-[#333] cursor-pointer transition-colors hover:bg-[#2a2a2a] last:border-b-0"
                        onClick={() => loadSubtitleFromUrl(sub.downloadUrl)}
                      >
                        <div className="text-[#e0e0e0] text-sm font-medium mb-1">{sub.name}</div>
                        <div className="text-xs text-[#888] flex gap-2 flex-wrap">
                          <span>{sub.language}</span>
                          {sub.downloads && <span>• {sub.downloads} downloads</span>}
                          {sub.rating && <span>• ⭐ {sub.rating}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search controls */}
              <div className="mb-5">
                <div className="flex gap-2 items-center">
                  <select 
                    value={selectedLanguage} 
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-[#444] rounded text-[#e0e0e0] text-sm cursor-pointer focus:outline-none focus:border-[#007acc]"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="ar">Arabic</option>
                    <option value="zh">Chinese</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                  </select>
                  <button 
                    onClick={searchSubtitles} 
                    disabled={loading}
                    className="px-4 py-2 bg-[#007acc] text-white rounded text-sm transition-colors whitespace-nowrap hover:enabled:bg-[#005a9e] disabled:bg-[#555] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? 'Searching...' : 'Search Again'}
                  </button>
                </div>
              </div>

              {/* Manual URL input */}
              <div className="mb-5">
                <label className="block mb-2 text-[#ccc] text-sm font-medium">Subtitle URL (VTT or SRT):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://example.com/subtitle.vtt"
                    value={subtitleUrl}
                    onChange={(e) => setSubtitleUrl(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-[#444] rounded text-[#e0e0e0] text-sm focus:outline-none focus:border-[#007acc]"
                  />
                  <button 
                    onClick={handleManualUrl} 
                    disabled={loading}
                    className="px-4 py-2 bg-[#007acc] text-white rounded text-sm transition-colors hover:enabled:bg-[#005a9e] disabled:bg-[#555] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Load
                  </button>
                </div>
              </div>
              
              {/* File upload */}
              <div className="mb-5">
                <label className="block mb-2 text-[#ccc] text-sm font-medium">Upload Subtitle File:</label>
                <input
                  type="file"
                  accept=".srt,.vtt,.ass"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="w-full p-2 bg-[#1e1e1e] border border-[#444] rounded text-[#e0e0e0] cursor-pointer disabled:opacity-60"
                />
              </div>
              
              {error && (
                <div className="p-2.5 bg-red-500/20 border border-red-500 rounded text-red-500 text-sm mb-4">{error}</div>
              )}

              {loading && autoSearching && (
                <div className="p-2.5 text-center text-[#007acc] text-sm bg-[#007acc]/10 border border-[#007acc]/30 rounded mb-4">Auto-searching subtitles...</div>
              )}
              
              <div className="p-4 bg-[#007acc]/10 border border-[#007acc]/30 rounded text-xs text-white/60">
                <p className="m-0 mb-2 text-[#ccc]"><strong>Tips:</strong></p>
                <ul className="m-0 pl-5">
                  <li className="my-1 leading-relaxed">Subtitles are automatically searched when you open this panel</li>
                  <li className="my-1 leading-relaxed">Click on any found subtitle to load it</li>
                  <li className="my-1 leading-relaxed">You can also search on <a href={getSubtitleCatUrl()} target="_blank" rel="noopener noreferrer" className="text-[#007acc] no-underline hover:underline">SubtitleCat.com</a> and paste the download URL</li>
                  <li className="my-1 leading-relaxed">SRT files are automatically converted to VTT</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SubtitleLoader;
