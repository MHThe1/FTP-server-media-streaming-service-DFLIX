# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm run install-all
```

This will install dependencies for both the backend and frontend.

## Step 2: Configure HTTP Server

Create a `.env` file in the root directory with your HTTP server URL:

```env
# HTTP Server Configuration
HTTP_SERVER_URL=http://cdn.dflix.live

# Server Configuration
PORT=5000
```

### Configuration Options:

- **HTTP_SERVER_URL**: The base URL of your HTTP server that serves directory listings (e.g., `http://cdn.dflix.live`)
- **PORT**: Backend server port (default: 5000)

**Note**: No authentication is needed - this works with public HTTP directory listings.

## Step 3: Start the Application

### Development Mode (Recommended)

Run both backend and frontend together:

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:5000
- React frontend on http://localhost:3000

### Or Run Separately

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run client
```

## Step 4: Open in Browser

Navigate to http://localhost:3000 in your web browser.

## How It Works

1. The backend fetches HTML directory listings from the HTTP server
2. It parses the HTML to extract file and directory information
3. Files are streamed through the backend proxy to handle CORS
4. The React frontend displays a modern file browser interface

## Troubleshooting

### Connection Issues

1. **Check HTTP server URL**: Verify the URL is correct and accessible
2. **Test the URL**: Open `http://cdn.dflix.live/` in your browser to confirm it shows directory listings
3. **Check format**: The server should return HTML directory listings (nginx-style), not JSON
4. **CORS**: If you see CORS errors, the backend proxy should handle this

### Port Already in Use

If port 5000 is already in use:
1. Change `PORT` in `.env` to a different port (e.g., 5001)
2. Update `client/src/services/api.js` and change the `API_BASE_URL` or create a `client/.env` file with:
   ```
   REACT_APP_API_URL=http://localhost:5001/api
   ```

### Streaming Not Working

1. Check browser console for errors (F12)
2. Verify the file format is supported (MP4, WebM, MP3, etc.)
3. Check backend server logs for HTTP request errors
4. Ensure the HTTP server allows direct file access

### Parsing Errors

If files aren't showing up:
1. Check the HTML format returned by your server
2. The parser expects nginx-style directory listings
3. You may need to adjust `server/httpService.js` for different HTML formats

## Next Steps

- Browse files using the left sidebar
- Click on media files to start streaming
- Use the built-in player controls to play/pause/seek
