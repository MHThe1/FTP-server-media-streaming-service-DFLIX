const https = require('https');
const http = require('http');
const { parse } = require('url');
const { JSDOM } = require('jsdom');

class HTTPService {
  constructor() {
    this.baseUrl = process.env.HTTP_SERVER_URL || 'http://cdn.dflix.live';
  }

  async fetchHTML(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = parse(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  parseDirectoryListing(html, currentPath) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const files = [];

    // Find all links in the <pre> tag (typical for nginx directory listings)
    const pre = document.querySelector('pre');
    if (!pre) {
      console.log('No <pre> tag found in HTML, trying alternative parsing...');
      // Fallback: try to find links anywhere in the document
      const allLinks = document.querySelectorAll('a');
      allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href !== '../' && !href.startsWith('http')) {
          const name = link.textContent.trim();
          if (name && name !== '../') {
            const isDirectory = href.endsWith('/');
            const cleanName = name.replace(/\/$/, '');
            let filePath = currentPath === '/' ? `/${cleanName}` : `${currentPath}/${cleanName}`;
            files.push({
              name: cleanName,
              type: isDirectory ? 'directory' : 'file',
              size: 0,
              modified: null,
              path: filePath
            });
          }
        }
      });
      return files;
    }

    // Get the innerHTML to preserve the structure
    const preHTML = pre.innerHTML;
    const lines = preHTML.split('\n').filter(line => line.trim());
    
    lines.forEach((line) => {
      // Skip empty lines or parent directory
      if (!line.trim() || line.includes('../') || line.includes('href="../"')) {
        return;
      }

      // Parse the line - format: <a href="name/">name/</a> followed by spaces, then date time size
      // Example: <a href="Movies/">Movies/</a>                                            07-Dec-2025 10:36                   -
      
      // Extract the link and name using regex
      const linkMatch = line.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
      if (!linkMatch) {
        return;
      }

      let href = linkMatch[1];
      let name = linkMatch[2].trim();
      
      // Skip parent directory
      if (href === '../' || name === '../') {
        return;
      }

      // Decode URL-encoded href and name (e.g., "TV%20Series" -> "TV Series")
      try {
        href = decodeURIComponent(href);
        name = decodeURIComponent(name);
      } catch (e) {
        // If decoding fails, use original values
      }

      const isDirectory = href.endsWith('/') || name.endsWith('/');
      // Use href for path building (it's the actual path), name for display
      const cleanHref = href.replace(/\/$/, ''); // Remove trailing slash
      const cleanName = name.replace(/\/$/, ''); // Remove trailing slash

      // Extract the rest of the line after the link
      // Remove the link HTML and get what's after it
      const afterLink = line.replace(/<a[^>]*>.*?<\/a>/, '').trim();
      const parts = afterLink.split(/\s+/).filter(p => p && p !== '');
      
      let size = 0;
      let date = null;

      // Parse date and size
      // Format: DD-MMM-YYYY HH:MM size (or "-" for directories)
      // Example: "07-Dec-2025 10:36 -" or "07-Dec-2025 10:36 1234567"
      if (parts.length >= 2) {
        // Try to parse date (format: DD-MMM-YYYY HH:MM)
        const dateStr = parts.slice(0, 2).join(' ');
        try {
          // Parse date like "07-Dec-2025 10:36"
          const dateMatch = dateStr.match(/(\d{2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2})/);
          if (dateMatch) {
            const [, day, month, year, hour, minute] = dateMatch;
            const monthMap = {
              'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
              'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
            };
            if (monthMap[month] !== undefined) {
              date = new Date(parseInt(year), monthMap[month], parseInt(day), parseInt(hour), parseInt(minute));
              if (isNaN(date.getTime())) {
                date = null;
              }
            }
          } else {
            // Try standard Date parsing as fallback
            date = new Date(dateStr);
            if (isNaN(date.getTime())) {
              date = null;
            }
          }
        } catch (e) {
          date = null;
        }

        // Last part should be size or "-"
        if (parts.length >= 3) {
          const sizeStr = parts[parts.length - 1];
          if (sizeStr !== '-' && !isNaN(parseInt(sizeStr))) {
            size = parseInt(sizeStr);
          }
        } else if (parts.length === 2 && parts[1] !== '-') {
          // Sometimes size might be in the second part if format is different
          const sizeStr = parts[1];
          if (!isNaN(parseInt(sizeStr))) {
            size = parseInt(sizeStr);
          }
        }
      }

      // Build the full path using the href (which is the actual path on server)
      // The href is relative to currentPath, so we need to handle it correctly
      let filePath;
      if (currentPath === '/') {
        filePath = `/${cleanHref}`;
      } else {
        // If href starts with /, it's absolute, otherwise it's relative
        if (cleanHref.startsWith('/')) {
          filePath = cleanHref;
        } else {
          filePath = `${currentPath}/${cleanHref}`;
        }
      }

      files.push({
        name: cleanName,
        type: isDirectory ? 'directory' : 'file',
        size: size,
        modified: date ? date.toISOString() : null,
        path: filePath
      });
    });

    console.log(`Parsed ${files.length} files from directory listing`);
    return files;
  }

  async listFiles(remotePath = '/') {
    try {
      // Build the URL
      let url = this.baseUrl;
      if (remotePath !== '/') {
        url += remotePath;
        if (!remotePath.endsWith('/')) {
          url += '/';
        }
      } else {
        url += '/';
      }

      console.log(`Fetching directory listing from: ${url}`);

      // Fetch the HTML directory listing
      const html = await this.fetchHTML(url);
      
      if (!html || html.length === 0) {
        console.log('Received empty HTML response');
        return [];
      }

      console.log(`Received HTML (${html.length} bytes)`);
      
      // Parse the HTML to extract file/directory information
      const files = this.parseDirectoryListing(html, remotePath);
      
      return files;
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  async getFileSize(filePath) {
    try {
      const url = this.baseUrl + filePath;
      const parsedUrl = parse(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      return new Promise((resolve, reject) => {
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.path,
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };

        const req = client.request(options, (res) => {
          const contentLength = res.headers['content-length'];
          if (contentLength) {
            resolve(parseInt(contentLength));
          } else {
            // If no content-length header, we can't determine size
            resolve(0);
          }
          res.resume(); // Consume response
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      });
    } catch (error) {
      console.error('Error getting file size:', error);
      throw error;
    }
  }

  async getFileInfo(filePath) {
    try {
      const size = await this.getFileSize(filePath);
      const name = filePath.split('/').pop();
      
      return {
        name: name,
        size: size,
        modified: null, // We can't get this from HEAD request easily
        path: filePath
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  getStreamUrl(filePath) {
    return this.baseUrl + filePath;
  }

  async streamFile(filePath, response, start = 0, end = null) {
    const url = this.baseUrl + filePath;
    const parsedUrl = parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      // Add range header if specified
      if (start > 0 || end !== null) {
        if (end !== null) {
          headers['Range'] = `bytes=${start}-${end}`;
        } else {
          headers['Range'] = `bytes=${start}-`;
        }
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET',
        headers: headers
      };

      const req = client.request(options, (res) => {
        // Forward status code and headers
        if (!response.headersSent) {
          response.statusCode = res.statusCode;
          Object.keys(res.headers).forEach(key => {
            // Don't forward certain headers
            if (key.toLowerCase() !== 'content-encoding' && 
                key.toLowerCase() !== 'transfer-encoding') {
              response.setHeader(key, res.headers[key]);
            }
          });
        }

        // Pipe the response
        res.pipe(response);

        res.on('end', () => {
          resolve();
        });

        res.on('error', (error) => {
          if (!response.headersSent) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      req.on('error', (error) => {
        if (!response.headersSent) {
          reject(error);
        } else {
          resolve();
        }
      });

      req.setTimeout(30000, () => {
        req.destroy();
        if (!response.headersSent) {
          reject(new Error('Request timeout'));
        } else {
          resolve();
        }
      });

      req.end();
    });
  }
}

// Export singleton instance
module.exports = new HTTPService();

