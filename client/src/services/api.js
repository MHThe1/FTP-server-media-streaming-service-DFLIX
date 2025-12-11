// Use relative URL for proxy when in development, or absolute URL if specified
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = {
  async listFiles(path = '/') {
    try {
      const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to list files: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  getStreamUrl(filePath) {
    return `${API_BASE_URL}/stream?path=${encodeURIComponent(filePath)}`;
  },

  async getFileInfo(filePath) {
    try {
      const response = await fetch(`${API_BASE_URL}/fileinfo?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error(`Failed to get file info: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async searchSubtitles(query, language = 'en') {
    try {
      const response = await fetch(`${API_BASE_URL}/subtitles/search?q=${encodeURIComponent(query)}&lang=${language}`);
      if (!response.ok) {
        throw new Error(`Failed to search subtitles: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  getSubtitleDownloadUrl(subtitleUrl) {
    return `${API_BASE_URL}/subtitles/download?url=${encodeURIComponent(subtitleUrl)}`;
  }
};

