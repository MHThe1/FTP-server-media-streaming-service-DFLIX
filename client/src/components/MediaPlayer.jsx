"use client"

import { useState, useEffect, useRef } from "react"
import { MediaPlayer, MediaProvider, CaptionButton } from "@vidstack/react"
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default"
import "@vidstack/react/player/styles/default/theme.css"
import "@vidstack/react/player/styles/default/layouts/video.css"
import "./MediaPlayer.css"
import { api } from "../services/api"

// Helper function to decode HTML entities
const decodeHtmlEntities = (str) => {
  const textarea = document.createElement("textarea")
  textarea.innerHTML = str
  return textarea.value
}

// Helper function to extract file extension
const getFileExtension = (fileName) => {
  let decodedName = decodeHtmlEntities(fileName)
  decodedName = decodedName.replace(/&[a-z]+;/gi, "").trim()
  const parts = decodedName.split(".")
  if (parts.length < 2) {
    return null
  }
  let ext = parts[parts.length - 1].toLowerCase().trim()
  ext = ext.replace(/[^a-z0-9]/g, "")
  return ext || null
}

// Helper function to convert SRT to VTT
const convertSRTtoVTT = (srtContent) => {
  let vtt = 'WEBVTT\n\n'
  const blocks = srtContent.split(/\n\s*\n/)
  
  blocks.forEach(block => {
    const lines = block.trim().split('\n')
    if (lines.length >= 3) {
      const timecode = lines[1].replace(/,/g, '.')
      const text = lines.slice(2).join('\n')
      vtt += `${timecode}\n${text}\n\n`
    }
  })
  
  return vtt
}

// Helper function to apply subtitle delay
const applySubtitleDelay = (mediaElement, delaySeconds) => {
  if (!mediaElement) return
  
  const tracks = mediaElement.textTracks
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    if (track.kind === 'subtitles' || track.kind === 'captions') {
      // Adjust cue timing
      if (track.cues) {
        for (let j = 0; j < track.cues.length; j++) {
          const cue = track.cues[j]
          cue.startTime += delaySeconds
          cue.endTime += delaySeconds
        }
      }
    }
  }
}

// Helper function to add subtitle track to media element
const addSubtitleTrack = (mediaElement, subtitleUrl, language = 'en', label = 'Subtitle', delay = 0) => {
  if (!mediaElement) return

  // Remove existing subtitle tracks
  const tracks = mediaElement.textTracks
  for (let i = tracks.length - 1; i >= 0; i--) {
    if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
      const track = tracks[i]
      track.mode = 'disabled'
    }
  }

  // Add new subtitle track
  const track = document.createElement('track')
  track.kind = 'subtitles'
  track.src = subtitleUrl
  track.srclang = language
  track.label = label
  track.default = true
  
  // Apply delay when track is loaded
  track.addEventListener('load', () => {
    if (delay !== 0 && track.cues) {
      for (let i = 0; i < track.cues.length; i++) {
        const cue = track.cues[i]
        cue.startTime += delay
        cue.endTime += delay
      }
    }
  })
  
  mediaElement.appendChild(track)
}

const MediaPlayerComponent = ({ file }) => {
  const [isVideo, setIsVideo] = useState(false)
  const [isAudio, setIsAudio] = useState(false)
  const [fileInfo, setFileInfo] = useState(null)
  const [error, setError] = useState(null)
  const [showSubtitleLoader, setShowSubtitleLoader] = useState(false)
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false)
  const [subtitleUrl, setSubtitleUrl] = useState('')
  const [subtitleSettings, setSubtitleSettings] = useState({
    fontSize: 20,
    fontFamily: 'Arial, sans-serif',
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.95)',
    position: 'bottom', // 'bottom', 'top', 'middle'
    delay: 0, // in seconds
  })
  const playerRef = useRef(null)
  const subtitleStyleRef = useRef(null)
  const playerContainerRef = useRef(null)
  const isSettingVolumeRef = useRef(false) // Flag to prevent saving when we programmatically set volume

  // Get saved volume from localStorage
  const getSavedVolume = () => {
    const savedVolume = localStorage.getItem('mediaPlayerVolume')
    if (savedVolume !== null) {
      const volume = parseFloat(savedVolume)
      if (volume >= 0 && volume <= 1) {
        return volume
      }
    }
    return 1 // Default to 1 if nothing saved
  }

  // Initialize volume state from localStorage
  const [initialVolume] = useState(() => getSavedVolume())

  // Handle mouse wheel volume control
  useEffect(() => {
    const container = playerContainerRef.current
    if (!container) return

    const handleWheel = (e) => {
      // Only change volume if not scrolling a control or menu
      const target = e.target
      if (target.closest('[data-media-menu]') || target.closest('[data-media-volume-slider]') || target.closest('input') || target.closest('select')) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const player = playerRef.current
      if (!player) return

      // Get current volume from media element
      const playerEl = player.el || player
      const mediaElement = playerEl?.querySelector?.('video') || playerEl?.querySelector?.('audio')
      if (!mediaElement) return

      const currentVolume = mediaElement.volume

      // Calculate new volume (deltaY: negative = scroll up = increase volume)
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      const newVolume = Math.max(0, Math.min(1, currentVolume + delta))

      // Set volume on media element
      isSettingVolumeRef.current = true
      mediaElement.volume = newVolume
      setTimeout(() => {
        isSettingVolumeRef.current = false
      }, 100)

      // Save to localStorage
      if (!isInitializingRef.current) {
        localStorage.setItem('mediaPlayerVolume', newVolume.toString())
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // Track if we're initializing to prevent saving during setup
  const isInitializingRef = useRef(true)
  
  useEffect(() => {
    // Mark initialization as complete after a delay
    const timer = setTimeout(() => {
      isInitializingRef.current = false
    }, 1000)
    return () => clearTimeout(timer)
  }, [file])

  useEffect(() => {
    if (!file) {
      setError(null)
      setIsVideo(false)
      setIsAudio(false)
      setFileInfo(null)
      return
    }

    setError(null)

    const ext = getFileExtension(file.name)

    // Extended video formats
    const videoExts = [
      "mp4",
      "webm",
      "ogg",
      "ogv",
      "mkv",
      "avi",
      "mov",
      "wmv",
      "flv",
      "m4v",
      "3gp",
      "ts",
      "mts",
      "mpg",
      "mpeg",
    ]

    // Extended audio formats
    const audioExts = ["mp3", "wav", "ogg", "m4a", "flac", "aac", "oga", "opus", "wma"]

    const isLargeFile = file.size && file.size > 100 * 1024 * 1024
    const hasNoExtension = !ext
    const videoKeywords = ["webrip", "dvdrip", "bluray", "hdtv", "x264", "x265", "hevc", "h264"]
    const hasVideoKeywords = videoKeywords.some((keyword) => file.name.toLowerCase().includes(keyword))

    setIsVideo(videoExts.includes(ext) || (hasNoExtension && (isLargeFile || hasVideoKeywords)))
    setIsAudio(audioExts.includes(ext))

    // Load file info
    api
      .getFileInfo(file.path)
      .then((info) => setFileInfo(info))
      .catch((err) => {
        console.error("Error loading file info:", err)
        setError(err.message)
      })
  }, [file])

  // Apply subtitle styles - must be before early returns
  useEffect(() => {
    if (!subtitleStyleRef.current) {
      subtitleStyleRef.current = document.createElement('style')
      document.head.appendChild(subtitleStyleRef.current)
    }

    const { fontSize, fontFamily, color, backgroundColor, textShadow, position } = subtitleSettings
    
    let positionCSS = ''
    let containerPositionCSS = ''
    switch (position) {
      case 'top':
        containerPositionCSS = 'top: 10% !important; bottom: auto !important; transform: none !important;'
        break
      case 'middle':
        containerPositionCSS = 'top: 50% !important; bottom: auto !important; transform: translateY(-50%) !important;'
        break
      case 'bottom':
      default:
        containerPositionCSS = 'bottom: 78px !important; top: auto !important; transform: none !important;'
        break
    }

    subtitleStyleRef.current.textContent = `
      /* Target video element cues directly - ::cue doesn't support positioning */
      .netflix-player video::cue,
      .netflix-player video::cue(v),
      .netflix-player [data-media-player] video::cue,
      .netflix-player [data-media-player] video::cue(v) {
        font-size: ${fontSize}px !important;
        font-family: ${fontFamily} !important;
        color: ${color} !important;
        background-color: ${backgroundColor} !important;
        text-shadow: ${textShadow} !important;
        padding: 10px 16px !important;
        border-radius: 4px !important;
        line-height: 1.5 !important;
        text-align: center !important;
        max-width: 85% !important;
        margin: 0 auto !important;
      }
      
      /* Target Vidstack caption container - this supports positioning */
      .netflix-player [data-media-captions],
      .netflix-player [data-media-player] [data-media-captions],
      .netflix-player [data-media-player] [data-media-captions] > * {
        font-size: ${fontSize}px !important;
        font-family: ${fontFamily} !important;
        color: ${color} !important;
        background-color: ${backgroundColor} !important;
        text-shadow: ${textShadow} !important;
        padding: 10px 16px !important;
        border-radius: 4px !important;
        line-height: 1.5 !important;
        text-align: center !important;
        max-width: 85% !important;
        margin: 0 auto !important;
        ${containerPositionCSS}
      }
      
      /* Override Vidstack CSS variables */
      .netflix-player [data-media-player] {
        --media-cue-font-size: ${fontSize}px !important;
        --media-cue-color: ${color} !important;
        --media-cue-bg: ${backgroundColor} !important;
        --media-captions-offset: ${position === 'bottom' ? '78px' : position === 'top' ? '10%' : '50%'} !important;
      }
      
      /* Force update on video element */
      .netflix-player [data-media-player] video {
        font-size: ${fontSize}px;
      }
    `
  }, [subtitleSettings])

  if (!file) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white/70 p-6 sm:p-10">
          <p className="text-sm sm:text-base my-2.5 px-4">Select a media file from the browser to start streaming</p>
        </div>
      </div>
    )
  }

  if (error && !isVideo && !isAudio) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-[#f44336] p-6 sm:p-10">
          <p className="text-sm sm:text-base px-4">Error loading file: {error}</p>
        </div>
      </div>
    )
  }

  const streamUrl = api.getStreamUrl(file.path)
  const ext = getFileExtension(file.name)

  // Determine MIME type
  const mimeTypes = {
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    ogv: "video/ogg",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",
    ts: "video/mp2t",
    mts: "video/mp2t",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
  }

  const isLargeFile = file.size && file.size > 100 * 1024 * 1024
  const videoKeywords = ["webrip", "dvdrip", "bluray", "hdtv", "x264", "x265", "hevc", "h264"]
  const hasVideoKeywords = videoKeywords.some((keyword) => file.name.toLowerCase().includes(keyword))
  const shouldTryAsVideo = isVideo || (isLargeFile && !isAudio) || hasVideoKeywords

  const formatSize = (bytes) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  }

  // Load subtitle from URL or file
  const loadSubtitleManually = async (url) => {
    if (!playerRef.current || !url) return

    try {
      // Use proxy if it's an OpenSubtitles URL, otherwise direct fetch
      let subtitleUrl = url
      if (url.includes('opensubtitles.org') || url.includes('opensubtitles.com')) {
        subtitleUrl = api.getSubtitleDownloadUrl(url)
      }

      // Fetch subtitle
      const response = await fetch(subtitleUrl)
      if (!response.ok) throw new Error('Failed to fetch subtitle')

      let text = await response.text()
      let vttContent = text
      if (url.includes('.srt') || text.startsWith('1\n') || /^\d+\n\d{2}:\d{2}:\d{2}/.test(text)) {
        vttContent = convertSRTtoVTT(text)
      }

      // Create blob URL
      const blob = new Blob([vttContent], { type: 'text/vtt' })
      const blobUrl = URL.createObjectURL(blob)

      // Get media element from Vidstack player
      const playerEl = playerRef.current?.el || playerRef.current
      const mediaElement = playerEl?.querySelector('video') || playerEl?.querySelector('audio')
      if (mediaElement) {
        addSubtitleTrack(mediaElement, blobUrl, 'en', 'Loaded Subtitle', subtitleSettings.delay)
        setShowSubtitleLoader(false)
        setSubtitleUrl('')
      }
    } catch (err) {
      console.error('Failed to load subtitle:', err)
      setError('Failed to load subtitle: ' + err.message)
    }
  }

  // Handle file upload for subtitles
  const handleSubtitleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target.result
        let vttContent = content
        if (file.name.endsWith('.srt')) {
          vttContent = convertSRTtoVTT(content)
        }

        const blob = new Blob([vttContent], { type: 'text/vtt' })
        const blobUrl = URL.createObjectURL(blob)

        const playerEl = playerRef.current?.el || playerRef.current
        const mediaElement = playerEl?.querySelector('video') || playerEl?.querySelector('audio')
        if (mediaElement) {
          addSubtitleTrack(mediaElement, blobUrl, 'en', file.name, subtitleSettings.delay)
          setShowSubtitleLoader(false)
        }
      } catch (err) {
        console.error('Failed to load subtitle file:', err)
        setError('Failed to load subtitle file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  // Custom CaptionButton component that always shows and allows manual loading
  const CustomCaptionButton = () => {
    const [hasActiveTrack, setHasActiveTrack] = useState(false)
    
    useEffect(() => {
      // Check for active text tracks
      const checkTracks = () => {
        const playerEl = playerRef.current?.el || playerRef.current
        const mediaElement = playerEl?.querySelector('video') || playerEl?.querySelector('audio')
        if (mediaElement) {
          const tracks = Array.from(mediaElement.textTracks || [])
          const active = tracks.some(track => track.mode === 'showing')
          setHasActiveTrack(active)
        }
      }
      
      // Check initially and on track changes
      checkTracks()
      const interval = setInterval(checkTracks, 500)
      
      return () => clearInterval(interval)
    }, [])
    
    return (
      <div className="relative" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          className="media-caption-button"
          data-media-caption-button
          data-active={hasActiveTrack}
          style={{ 
            display: 'flex !important', 
            visibility: 'visible !important',
            width: '40px',
            height: '40px',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            opacity: hasActiveTrack ? 1 : 0.9
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            
            const playerEl = playerRef.current?.el || playerRef.current
            const mediaElement = playerEl?.querySelector('video') || playerEl?.querySelector('audio')
            const tracks = mediaElement ? Array.from(mediaElement.textTracks || []) : []
            const hasTracks = tracks.length > 0
            const activeTrack = tracks.find(track => track.mode === 'showing')
            
            if (activeTrack) {
              // Toggle off active track
              activeTrack.mode = 'hidden'
            } else if (hasTracks) {
              // Enable first available track
              const firstTrack = tracks.find(track => track.kind === 'subtitles' || track.kind === 'captions')
              if (firstTrack) {
                firstTrack.mode = 'showing'
              }
            } else {
              // No tracks - show loader
              setShowSubtitleLoader(true)
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowSubtitleSettings(true)
          }}
          title="Closed Captions (Right-click for settings)"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h12M6 12h8M6 16h4" />
          </svg>
        </button>
        {showSubtitleLoader && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-[99998]"
              onClick={() => setShowSubtitleLoader(false)}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#2a2a2a] border border-[#444] rounded-lg shadow-lg w-[95vw] sm:w-[500px] max-w-[90vw] p-4 sm:p-6 z-[99999] max-h-[90vh] overflow-y-auto">
              <h3 className="text-white text-base sm:text-lg font-semibold mb-3 sm:mb-4">Load Subtitles</h3>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">Subtitle URL:</label>
                  <input
                    type="text"
                    value={subtitleUrl}
                    onChange={(e) => setSubtitleUrl(e.target.value)}
                    placeholder="https://example.com/subtitle.vtt"
                    className="w-full px-3 py-2.5 sm:py-2 bg-[#1a1a1a] border border-[#444] rounded text-white text-sm focus:outline-none focus:border-[#e50914] touch-manipulation"
                  />
                  <button
                    onClick={() => subtitleUrl && loadSubtitleManually(subtitleUrl)}
                    className="mt-2 w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-[#e50914] text-white rounded hover:bg-[#f40612] active:scale-95 transition-colors text-sm touch-manipulation"
                  >
                    Load from URL
                  </button>
                </div>
                <div className="border-t border-[#444] pt-3 sm:pt-4">
                  <label className="block text-white text-xs sm:text-sm mb-2">Or upload a file:</label>
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    onChange={handleSubtitleFileUpload}
                    className="w-full px-3 py-2.5 sm:py-2 bg-[#1a1a1a] border border-[#444] rounded text-white text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[#e50914] file:text-white hover:file:bg-[#f40612] touch-manipulation"
                  />
                </div>
                <button
                  onClick={() => setShowSubtitleLoader(false)}
                  className="w-full px-4 py-2.5 sm:py-2 bg-[#444] text-white rounded hover:bg-[#555] active:scale-95 transition-colors text-sm touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
        {showSubtitleSettings && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-[99998]"
              onClick={() => setShowSubtitleSettings(false)}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#2a2a2a] border border-[#444] rounded-lg shadow-lg w-[95vw] sm:w-[600px] max-w-[90vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6 z-[99999]">
              <h3 className="text-white text-base sm:text-lg font-semibold mb-3 sm:mb-4">Subtitle Settings</h3>
              <div className="space-y-3 sm:space-y-4">
                {/* Font Size */}
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">
                    Font Size: {subtitleSettings.fontSize}px
                  </label>
                  <input
                    type="range"
                    min="12"
                    max="48"
                    value={subtitleSettings.fontSize}
                    onChange={(e) => setSubtitleSettings({ ...subtitleSettings, fontSize: parseInt(e.target.value) })}
                    className="w-full touch-manipulation"
                  />
                </div>

                {/* Font Family */}
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">Font Family:</label>
                  <select
                    value={subtitleSettings.fontFamily}
                    onChange={(e) => setSubtitleSettings({ ...subtitleSettings, fontFamily: e.target.value })}
                    className="w-full px-3 py-2.5 sm:py-2 bg-[#1a1a1a] border border-[#444] rounded text-white text-sm focus:outline-none focus:border-[#e50914] touch-manipulation"
                  >
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Helvetica, sans-serif">Helvetica</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="'Courier New', monospace">Courier New</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="Georgia, serif">Georgia</option>
                  </select>
                </div>

                {/* Text Color */}
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">Text Color:</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={subtitleSettings.color}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, color: e.target.value })}
                      className="w-12 sm:w-16 h-10 rounded cursor-pointer touch-manipulation"
                    />
                    <input
                      type="text"
                      value={subtitleSettings.color}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, color: e.target.value })}
                      className="flex-1 px-3 py-2.5 sm:py-2 bg-[#1a1a1a] border border-[#444] rounded text-white text-sm focus:outline-none focus:border-[#e50914] touch-manipulation"
                      placeholder="#ffffff"
                    />
                  </div>
                </div>

                {/* Background Color */}
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">Background Color:</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={subtitleSettings.backgroundColor.replace(/rgba?\([^)]+\)/, (match) => {
                        const rgba = match.match(/\d+/g)
                        if (rgba && rgba.length >= 3) {
                          const r = parseInt(rgba[0])
                          const g = parseInt(rgba[1])
                          const b = parseInt(rgba[2])
                          return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
                        }
                        return '#000000'
                      })}
                      onChange={(e) => {
                        const hex = e.target.value
                        const r = parseInt(hex.slice(1, 3), 16)
                        const g = parseInt(hex.slice(3, 5), 16)
                        const b = parseInt(hex.slice(5, 7), 16)
                        setSubtitleSettings({ ...subtitleSettings, backgroundColor: `rgba(${r}, ${g}, ${b}, 0.7)` })
                      }}
                      className="w-12 sm:w-16 h-10 rounded cursor-pointer touch-manipulation"
                    />
                    <input
                      type="text"
                      value={subtitleSettings.backgroundColor}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, backgroundColor: e.target.value })}
                      className="flex-1 px-3 py-2.5 sm:py-2 bg-[#1a1a1a] border border-[#444] rounded text-white text-sm focus:outline-none focus:border-[#e50914] touch-manipulation"
                      placeholder="rgba(0, 0, 0, 0.7)"
                    />
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">Position:</label>
                  <select
                    value={subtitleSettings.position}
                    onChange={(e) => setSubtitleSettings({ ...subtitleSettings, position: e.target.value })}
                    className="w-full px-3 py-2.5 sm:py-2 bg-[#1a1a1a] border border-[#444] rounded text-white text-sm focus:outline-none focus:border-[#e50914] touch-manipulation"
                  >
                    <option value="bottom">Bottom</option>
                    <option value="middle">Middle</option>
                    <option value="top">Top</option>
                  </select>
                </div>

                {/* Delay */}
                <div>
                  <label className="block text-white text-xs sm:text-sm mb-2">
                    Delay: {subtitleSettings.delay > 0 ? '+' : ''}{subtitleSettings.delay.toFixed(1)}s
                  </label>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="0.1"
                    value={subtitleSettings.delay}
                    onChange={(e) => {
                      const delay = parseFloat(e.target.value)
                      setSubtitleSettings({ ...subtitleSettings, delay })
                      // Apply delay to existing tracks
                      const playerEl = playerRef.current?.el || playerRef.current
                      const mediaElement = playerEl?.querySelector('video') || playerEl?.querySelector('audio')
                      if (mediaElement) {
                        applySubtitleDelay(mediaElement, delay)
                      }
                    }}
                    className="w-full touch-manipulation"
                  />
                  <div className="flex justify-between text-xs text-white/60 mt-1">
                    <span>-10s</span>
                    <span>0s</span>
                    <span>+10s</span>
                  </div>
                </div>

                <div className="border-t border-[#444] pt-3 sm:pt-4">
                  <button
                    onClick={() => {
                      setSubtitleSettings({
                        fontSize: 20,
                        fontFamily: 'Arial, sans-serif',
                        color: '#ffffff',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.95)',
                        position: 'bottom',
                        delay: 0,
                      })
                    }}
                    className="w-full px-4 py-2.5 sm:py-2 bg-[#444] text-white rounded hover:bg-[#555] active:scale-95 transition-colors text-sm mb-2 touch-manipulation"
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={() => setShowSubtitleSettings(false)}
                    className="w-full px-4 py-2.5 sm:py-2 bg-[#e50914] text-white rounded hover:bg-[#f40612] active:scale-95 transition-colors text-sm touch-manipulation"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Auto-load subtitles when video metadata is loaded
  const handleLoadedMetadata = async () => {
    if (!isVideo || !file) return

    try {
      // Extract media name for subtitle search
      const extractMediaName = (filename) => {
        let name = filename
          .replace(/\([0-9]{4}\)/, '')
          .replace(/WEBRip|DVDRip|BluRay|HDTV|x264|x265|HEVC|H264|1080p|720p|480p/gi, '')
          .replace(/\.mkv|\.mp4|\.avi|\.mov|\.webm/gi, '')
          .replace(/[._]/g, ' ')
          .trim()
        const words = name.split(' ').filter(w => w.length > 0)
        return words.slice(0, 5).join(' ')
      }

      const mediaName = extractMediaName(file.name)
      if (!mediaName || mediaName.length < 3) return

      // Search for subtitles
      const results = await api.searchSubtitles(mediaName, 'en')
      if (!results || results.length === 0) return

      // Get the first result
      const firstSubtitle = results[0]
      if (!firstSubtitle.downloadUrl) return

      // Get subtitle URL (use proxy if needed)
      let subtitleUrl = firstSubtitle.downloadUrl
      if (subtitleUrl.includes('opensubtitles.org') || subtitleUrl.includes('opensubtitles.com')) {
        subtitleUrl = api.getSubtitleDownloadUrl(subtitleUrl)
      }

      // Fetch and convert subtitle
      const response = await fetch(subtitleUrl)
      if (!response.ok) return

      let text = await response.text()
      let vttContent = text
      if (subtitleUrl.includes('.srt') || text.startsWith('1\n') || /^\d+\n\d{2}:\d{2}:\d{2}/.test(text)) {
        vttContent = convertSRTtoVTT(text)
      }

      // Create blob URL
      const blob = new Blob([vttContent], { type: 'text/vtt' })
      const blobUrl = URL.createObjectURL(blob)

      // Get media element from Vidstack player
      const playerEl = playerRef.current?.el || playerRef.current
      const mediaElement = playerEl?.querySelector('video') || playerEl?.querySelector('audio')
      if (mediaElement) {
        addSubtitleTrack(mediaElement, blobUrl, firstSubtitle.language || 'en', firstSubtitle.languageName || 'Subtitle', subtitleSettings.delay)
      }
    } catch (err) {
      console.error('Auto-load subtitle error:', err)
      // Silently fail - subtitles are optional
    }
  }

  return (
    <div 
      ref={playerContainerRef}
      className="w-full h-full flex flex-col bg-black text-white relative"
      onWheel={(e) => {
        // Prevent default scrolling when changing volume
        const target = e.target
        if (!target.closest('[data-media-menu]') && !target.closest('[data-media-volume-slider]') && !target.closest('input') && !target.closest('select')) {
          e.preventDefault()
        }
      }}
    >
      <MediaPlayer
        ref={playerRef}
        className="w-full h-full netflix-player"
        title={decodeHtmlEntities(file.name)}
        src={isVideo || shouldTryAsVideo || isAudio ? streamUrl : undefined}
        crossOrigin="anonymous"
        playsInline
        googleCast={{}}
        volume={initialVolume}
        onVolumeChange={(e) => {
          // Save volume changes to localStorage (but not during initialization or when we programmatically set it)
          if (!isInitializingRef.current && !isSettingVolumeRef.current) {
            const volume = e.detail ?? e.target?.volume ?? 1
            const savedVolume = localStorage.getItem('mediaPlayerVolume')
            // Don't save if it's 1.0 and we have a different saved value (likely reset to default)
            if (!(volume === 1.0 && savedVolume !== null && parseFloat(savedVolume) !== 1.0)) {
              localStorage.setItem('mediaPlayerVolume', volume.toString())
            }
          }
        }}
        onError={(e) => {
          console.error("MediaPlayer error:", e)
          const error = e.detail || e.target?.error
          if (error) {
            let errorMsg = "Playback error"
            if (error.code === 4) {
              errorMsg = "Media format not supported. The browser may not support this codec."
            } else if (error.message) {
              errorMsg = error.message
            }
            setError(errorMsg)
          }
        }}
        onLoadedData={() => {
          console.log("Video loaded successfully")
        }}
        onProviderSetup={() => {
          // Ensure persisted volume is applied when provider is ready
          const savedVolume = getSavedVolume()
          setTimeout(() => {
            const player = playerRef.current
            if (player) {
              const playerEl = player.el || player
              const mediaElement = playerEl?.querySelector?.('video') || playerEl?.querySelector?.('audio')
              if (mediaElement && Math.abs(mediaElement.volume - savedVolume) > 0.01) {
                isSettingVolumeRef.current = true
                mediaElement.volume = savedVolume
                setTimeout(() => {
                  isSettingVolumeRef.current = false
                }, 100)
              }
            }
          }, 100)
        }}
        onLoadedMetadata={() => {
          // Ensure persisted volume is applied and load subtitles when metadata loads
          const savedVolume = getSavedVolume()
          const player = playerRef.current
          if (player) {
            const playerEl = player.el || player
            const mediaElement = playerEl?.querySelector?.('video') || playerEl?.querySelector?.('audio')
            if (mediaElement && Math.abs(mediaElement.volume - savedVolume) > 0.01) {
              isSettingVolumeRef.current = true
              mediaElement.volume = savedVolume
              setTimeout(() => {
                isSettingVolumeRef.current = false
              }, 100)
            }
          }
          handleLoadedMetadata()
        }}
      >
        <MediaProvider />
        <div className="absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 pointer-events-none media-playing:opacity-0 media-paused:opacity-100">
          <div className="p-3 sm:p-5 px-4 sm:px-10 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex justify-between items-center mb-2 sm:mb-2.5 pointer-events-auto relative" style={{ zIndex: 10000 }}>
              <h3 className="m-0 text-base sm:text-lg md:text-xl text-white flex-1 break-words font-medium drop-shadow-lg">
                {decodeHtmlEntities(file.name)}
              </h3>
            </div>
            {fileInfo && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-5 text-xs text-white/70 font-mono items-start sm:items-center pointer-events-auto">
                <span>Size: {formatSize(fileInfo.size)}</span>
                {fileInfo.modified && <span className="hidden sm:inline">Modified: {new Date(fileInfo.modified).toLocaleString()}</span>}
              </div>
            )}
          </div>
        </div>
        {isVideo || shouldTryAsVideo ? (
          <DefaultVideoLayout 
            icons={defaultLayoutIcons}
            slots={{
              // Replace with custom caption button that always shows
              captionButton: <CustomCaptionButton />,
            }}
          />
        ) : isAudio ? (
          <DefaultVideoLayout icons={defaultLayoutIcons} />
        ) : null}
        {error && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white bg-black/90 p-4 sm:p-7 rounded-lg z-[100] max-w-[90vw] sm:max-w-[500px] mx-4">
            <p className="my-2.5 text-sm sm:text-base">{error}</p>
            <p className="text-xs sm:text-sm text-white/70 mt-3 sm:mt-4">
              Note: Some formats (like MKV) may not play in all browsers. The browser needs to support the video
              codec (H.264, VP8, VP9, etc.)
            </p>
          </div>
        )}
      </MediaPlayer>
    </div>
  )
}

export default MediaPlayerComponent
