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

// Search for movie/series metadata using TMDB API
app.get('/api/media/search', async (req, res) => {
  try {
    const query = req.query.q;
    const type = req.query.type || 'multi'; // 'movie', 'tv', or 'multi'
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const TMDB_API_KEY = process.env.TMDB_API_KEY || '8c4e4c4e4c4e4c4e4c4e4c4e4c4e4c4e'; // Default demo key (replace with your own)
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    
    console.log(`[API] Searching media: ${query} (type: ${type})`);
    
    let searchUrl;
    if (type === 'multi') {
      searchUrl = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;
    } else if (type === 'movie') {
      searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;
    } else if (type === 'tv') {
      searchUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "movie", "tv", or "multi"' });
    }
    
    let response;
    try {
      response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
    } catch (error) {
      console.error(`[API] TMDB API error:`, error.message);
      // Return empty results instead of error if API fails
      return res.json({ results: [], total_results: 0 });
    }
    
    const data = response.data;
    const results = (data.results || []).slice(0, 5).map(item => {
      const isMovie = item.media_type === 'movie' || type === 'movie';
      const isTV = item.media_type === 'tv' || type === 'tv';
      
      return {
        id: item.id,
        title: item.title || item.name,
        originalTitle: item.original_title || item.original_name,
        overview: item.overview || '',
        releaseDate: item.release_date || item.first_air_date,
        rating: item.vote_average || 0,
        voteCount: item.vote_count || 0,
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        mediaType: item.media_type || (isMovie ? 'movie' : 'tv'),
        genreIds: item.genre_ids || []
      };
    });
    
    console.log(`[API] Found ${results.length} media results`);
    res.json({ results, total_results: data.total_results || 0 });
  } catch (error) {
    console.error('[API] Error searching media:', error);
    // Return empty results instead of error
    res.json({ results: [], total_results: 0 });
  }
});

// Get detailed movie/series information
app.get('/api/media/details', async (req, res) => {
  try {
    const id = req.query.id;
    const type = req.query.type || 'movie'; // 'movie' or 'tv'
    
    if (!id) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const TMDB_API_KEY = process.env.TMDB_API_KEY || '8c4e4c4e4c4e4c4e4c4e4c4e4c4e4c4e'; // Default demo key (replace with your own)
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    
    const endpoint = type === 'tv' ? 'tv' : 'movie';
    const detailsUrl = `${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos`;
    
    console.log(`[API] Fetching media details: ${id} (type: ${type})`);
    
    let response;
    try {
      response = await axios.get(detailsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
    } catch (error) {
      console.error(`[API] TMDB API error:`, error.message);
      return res.status(500).json({ error: 'Failed to fetch media details' });
    }
    
    const data = response.data;
    const details = {
      id: data.id,
      title: data.title || data.name,
      originalTitle: data.original_title || data.original_name,
      overview: data.overview || '',
      releaseDate: data.release_date || data.first_air_date,
      rating: data.vote_average || 0,
      voteCount: data.vote_count || 0,
      popularity: data.popularity || 0,
      posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      backdropPath: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null,
      genres: (data.genres || []).map(g => g.name),
      runtime: data.runtime || data.episode_run_time?.[0] || null,
      tagline: data.tagline || '',
      status: data.status || '',
      mediaType: type,
      // TV specific
      numberOfSeasons: data.number_of_seasons || null,
      numberOfEpisodes: data.number_of_episodes || null,
      // Movie specific
      budget: data.budget || null,
      revenue: data.revenue || null,
      // Credits
      cast: (data.credits?.cast || []).slice(0, 10).map(actor => ({
        name: actor.name,
        character: actor.character,
        profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
      })),
      crew: (data.credits?.crew || []).slice(0, 5).map(member => ({
        name: member.name,
        job: member.job
      })),
      // Videos
      trailers: (data.videos?.results || [])
        .filter(v => v.type === 'Trailer' && v.site === 'YouTube')
        .slice(0, 3)
        .map(v => ({
          key: v.key,
          name: v.name,
          type: v.type
        }))
    };
    
    console.log(`[API] Fetched media details for: ${details.title}`);
    res.json(details);
  } catch (error) {
    console.error('[API] Error fetching media details:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch media details' });
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


