require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const httpService = require('./httpService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// List files and directories
app.get('/api/files', async (req, res) => {
  try {
    const remotePath = req.query.path || '/';
    console.log(`[API] Request to list files at path: ${remotePath}`);
    const files = await httpService.listFiles(remotePath);
    console.log(`[API] Returning ${files.length} files`);
    res.json(files);
  } catch (error) {
    console.error('[API] Error listing files:', error);
    res.status(500).json({ error: error.message || 'Unknown error occurred' });
  }
});

// Stream file from FTP
app.get('/api/stream', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Get file size for range requests
    const fileSize = await httpService.getFileSize(filePath);
    
    // Handle range requests for video/audio streaming
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': getContentType(filePath),
        'Cache-Control': 'no-cache'
      });

      await httpService.streamFile(filePath, res, start, end);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': getContentType(filePath),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });

      await httpService.streamFile(filePath, res);
    }
  } catch (error) {
    console.error('Error streaming file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get file info
app.get('/api/fileinfo', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const info = await httpService.getFileInfo(filePath);
    res.json(info);
  } catch (error) {
    console.error('Error getting file info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get direct stream URL (for VLC and external players)
app.get('/api/direct-stream-url', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const directUrl = httpService.getStreamUrl(filePath);
    res.json({ url: directUrl });
  } catch (error) {
    console.error('Error getting direct stream URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// Configure axios defaults
axios.defaults.timeout = 10000;
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Search subtitles using OpenSubtitles API
app.get('/api/subtitles/search', async (req, res) => {
  try {
    const query = req.query.q;
    const language = req.query.lang || 'en';
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Use OpenSubtitles REST API (free, no auth required for search)
    // Try the legacy REST API endpoint first
    let searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}/sublanguageid-${language}`;
    
    console.log(`[API] Searching subtitles: ${query} (${language})`);
    console.log(`[API] Using URL: ${searchUrl}`);
    
    let response;
    let data;
    
    try {
      response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      data = response.data;
    } catch (error) {
      // If legacy API fails, try alternative format
      console.log(`[API] Legacy API failed, trying alternative format...`);
      searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}`;
      try {
        response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        data = response.data;
      } catch (error2) {
        console.error(`[API] Both API attempts failed:`, error2.message);
        throw new Error(`OpenSubtitles API unavailable. Try searching manually on opensubtitles.org or subtitlecat.com`);
      }
    }
    
    // Handle different response formats
    let subtitles = [];
    if (Array.isArray(data)) {
      subtitles = data;
    } else if (data && data.data && Array.isArray(data.data)) {
      subtitles = data.data;
    } else if (data && data.subtitles && Array.isArray(data.subtitles)) {
      subtitles = data.subtitles;
    }
    
    // Format the results
    const formattedSubtitles = subtitles.map(sub => ({
      id: sub.IDSubtitleFile || sub.id,
      name: sub.SubFileName || sub.filename || sub.name,
      language: sub.LanguageName || sub.language || language,
      downloadUrl: sub.SubDownloadLink || sub.download_url || sub.url,
      format: sub.SubFormat || sub.format || 'srt',
      rating: sub.SubRating || sub.rating || '0',
      downloads: sub.SubDownloadsCnt || sub.downloads || 0
    })).filter(sub => sub.downloadUrl); // Filter out entries without download URLs

    console.log(`[API] Found ${formattedSubtitles.length} subtitles`);
    res.json(formattedSubtitles);
  } catch (error) {
    console.error('[API] Error searching subtitles:', error);
    res.status(500).json({ error: error.message || 'Failed to search subtitles' });
  }
});

// Download subtitle file (proxy to avoid CORS)
app.get('/api/subtitles/download', async (req, res) => {
  try {
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'Subtitle URL is required' });
    }

    console.log(`[API] Downloading subtitle from: ${url}`);
    
    // Download subtitle using axios
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'text' // Get as text, not JSON
    });
    
    const subtitleContent = response.data;
    
    // Set appropriate content type
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(subtitleContent);
  } catch (error) {
    console.error('[API] Error downloading subtitle:', error);
    res.status(500).json({ error: error.message || 'Failed to download subtitle' });
  }
});

// Helper function to determine content type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    // Video formats
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.ts': 'video/mp2t',
    '.mts': 'video/mp2t',
    // Audio formats
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/opus',
    '.wma': 'audio/x-ms-wma',
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    // Documents
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://0.0.0.0:${PORT}`);
  console.log(`HTTP server URL: ${process.env.HTTP_SERVER_URL || 'http://cdn.dflix.live'}`);
  
  // Log network IP addresses for easy access
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  console.log('\nAccess from other devices on your network:');
  Object.keys(networkInterfaces).forEach((iface) => {
    networkInterfaces[iface].forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        console.log(`  http://${details.address}:${PORT}`);
      }
    });
  });
});


