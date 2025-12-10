require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`HTTP server URL: ${process.env.HTTP_SERVER_URL || 'http://cdn.dflix.live'}`);
});


