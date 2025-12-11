import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

// Helper function to decode HTML entities
const decodeHtmlEntities = (str) => {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
};

const FileBrowser = ({ onFileSelect, currentPath, onPathChange }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  const loadFiles = async (path) => {
    setLoading(true);
    setError(null);
    try {
      const fileList = await api.listFiles(path);
      console.log('Loaded files:', fileList);
      setFiles(fileList);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load files';
      setError(errorMessage);
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = (file) => {
    if (file.type === 'directory') {
      onPathChange(file.path);
    } else {
      onFileSelect(file);
    }
  };

  const handleBack = () => {
    if (currentPath === '/') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    onPathChange(parentPath);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const isMediaFile = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    const videoExts = ['mp4', 'webm', 'ogg', 'ogv', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'oga', 'opus', 'wma'];
    return videoExts.includes(ext) || audioExts.includes(ext);
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col bg-[#1e1e1e] text-[#e0e0e0]">
        <div className="p-6 sm:p-10 text-center text-[#888] text-sm sm:text-base">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col bg-[#1e1e1e] text-[#e0e0e0]">
        <div className="p-6 sm:p-10 text-center text-[#f44336] text-sm sm:text-base">Error: {error}</div>
        <button 
          onClick={() => loadFiles(currentPath)}
          className="mx-auto mt-4 px-4 py-2 bg-[#007acc] text-white rounded hover:bg-[#005a9e] active:scale-95 transition-colors touch-manipulation"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] text-[#e0e0e0]">
      <div className="p-3 sm:p-4 border-b border-[#333] flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 bg-[#252525]">
        <button 
          onClick={handleBack} 
          disabled={currentPath === '/'}
          className="px-3 sm:px-4 py-2 sm:py-2 bg-[#007acc] text-white rounded text-sm transition-colors disabled:bg-[#444] disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:bg-[#005a9e] active:enabled:scale-95 touch-manipulation"
        >
          ← Back
        </button>
        <div className="text-[#888] text-xs sm:text-sm font-mono truncate px-2 sm:px-0">Path: {currentPath}</div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 sm:p-2.5">
        {files.length === 0 ? (
          <div className="p-6 sm:p-10 text-center text-[#888] text-sm sm:text-base">No files found</div>
        ) : (
          files.map((file, index) => (
            <div
              key={index}
              className={`flex items-center p-3 sm:p-3 mb-1.5 bg-[#2a2a2a] rounded cursor-pointer transition-all border border-transparent active:bg-[#333] active:border-[#007acc] sm:hover:bg-[#333] sm:hover:border-[#007acc] sm:hover:translate-x-1 touch-manipulation ${
                isMediaFile(file.name) ? 'border-l-4 border-l-[#4caf50]' : ''
              } ${file.type === 'directory' ? 'border-l-4 border-l-[#ff9800]' : ''}`}
              onClick={() => handleFileClick(file)}
            >
              <div className="text-xl sm:text-2xl mr-3 sm:mr-4 w-6 sm:w-8 text-center flex-shrink-0">
                {file.type === 'directory' ? '📁' : isMediaFile(file.name) ? '🎬' : '📄'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm sm:text-[15px] font-medium text-[#e0e0e0] mb-1 break-words">{decodeHtmlEntities(file.name)}</div>
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs text-[#888]">
                  {file.type === 'file' && <span className="font-mono">{formatSize(file.size)}</span>}
                  {file.modified && <span className="font-mono hidden sm:inline">{formatDate(file.modified)}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FileBrowser;
