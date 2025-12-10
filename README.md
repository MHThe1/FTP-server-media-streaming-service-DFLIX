# HTTP Directory Streaming Service

A React.js frontend with Node.js backend that allows you to stream media files (video/audio) from an HTTP server that serves directory listings (like nginx directory index).

## Features

- 📁 Browse files and directories from HTTP directory listings
- 🎬 Stream video files (MP4, WebM, OGG)
- 🎵 Stream audio files (MP3, WAV, M4A, FLAC, OGG)
- 📱 Responsive design
- ⚡ HTTP range request support for efficient streaming
- 🎨 Modern, dark-themed UI
- 🔓 No authentication required (works with public HTTP directory listings)

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Access to an HTTP server with directory listings enabled

## Installation

1. Clone or download this repository

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd client
npm install
cd ..
```

Or install all at once:
```bash
npm run install-all
```

## Configuration

1. Create a `.env` file in the root directory:

```env
# HTTP Server Configuration
HTTP_SERVER_URL=http://cdn.dflix.live

# Server Configuration
PORT=5000
```

### Configuration Options

- `HTTP_SERVER_URL`: The base URL of your HTTP server with directory listings (default: `http://cdn.dflix.live`)
- `PORT`: Backend server port (default: 5000)

## Running the Application

### Development Mode

Run both backend and frontend concurrently:
```bash
npm run dev
```

Or run them separately:

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Production Build

1. Build the React app:
```bash
npm run build
```

2. Start the production server:
```bash
node server/index.js
```

## Usage

1. Start the application (see above)
2. Open your browser to http://localhost:3000
3. Browse files and directories using the left sidebar
4. Click on a media file to start streaming
5. Use the built-in video/audio player controls

## Supported File Formats

### Video
- MP4
- WebM
- OGG

### Audio
- MP3
- WAV
- M4A
- FLAC
- OGG

## How It Works

The service:
1. Fetches HTML directory listings from the HTTP server
2. Parses the HTML to extract file and directory information
3. Proxies file streaming through the backend to handle CORS and range requests
4. Displays a modern file browser interface in React

## Project Structure

```
http-streaming-service/
├── server/
│   ├── index.js          # Express server and API routes
│   └── httpService.js    # HTTP directory listing parser and file operations
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileBrowser.js    # File browser component
│   │   │   ├── FileBrowser.css
│   │   │   ├── MediaPlayer.js    # Media player component
│   │   │   └── MediaPlayer.css
│   │   ├── services/
│   │   │   └── api.js            # API service
│   │   ├── App.js
│   │   └── App.css
│   └── package.json
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/files?path=/` - List files in a directory (parses HTML directory listing)
- `GET /api/stream?path=/file.mp4` - Stream a file (supports HTTP range requests)
- `GET /api/fileinfo?path=/file.mp4` - Get file information

## Troubleshooting

### Connection Issues

- Verify the `HTTP_SERVER_URL` in `.env` is correct and accessible
- Check if the server returns HTML directory listings (not JSON or other formats)
- Ensure the server is publicly accessible
- Check browser console for CORS errors

### Streaming Issues

- Ensure your browser supports the media format
- Check browser console for errors
- Verify the file path is correct
- Some servers may have rate limiting

### Port Conflicts

- Change the `PORT` in `.env` if port 5000 is in use
- Update `REACT_APP_API_URL` in `client/.env` if you change the backend port

### Parsing Issues

- The service expects nginx-style HTML directory listings
- If your server uses a different format, you may need to adjust the parser in `server/httpService.js`

## License

MIT
