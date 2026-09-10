const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from the current directory
app.use(express.static(__dirname));

// Function to find yt-dlp executable or python module
function getYtdlCmd() {
  const customExe = 'C:\\Users\\fuzzu Developer\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';
  if (fs.existsSync(customExe)) {
    return { cmd: customExe, argsPrefix: [] };
  }
  if (process.platform === 'win32') {
    return { cmd: 'python', argsPrefix: ['-m', 'yt_dlp'] };
  }
  // Linux / macOS (Render / Cloud environment)
  return { cmd: 'yt-dlp', argsPrefix: [] };
}

// Format duration helper (seconds to MM:SS or HH:MM:SS)
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const sec = parseInt(seconds, 10);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Clean filename for download header
function sanitizeFilename(title) {
  if (!title) return 'video';
  return title.replace(/[/\\?%*:|"<>]/g, '_').trim();
}

// Extract YouTube Video ID from input (URL or raw ID)
function parseYoutubeId(input) {
  if (!input) return null;
  const str = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  const match = str.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Helper to execute yt-dlp with automatic fallback
function spawnYtdl(extraArgs, onStdout, onStderr, onClose) {
  const { cmd, argsPrefix } = getYtdlCmd();
  const fullArgs = [...argsPrefix, ...extraArgs];

  const child = spawn(cmd, fullArgs);
  let hasErrored = false;

  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);

  child.on('error', err => {
    console.warn(`Primary yt-dlp command "${cmd}" error:`, err.message);
    hasErrored = true;
    // Fallback on Linux if 'yt-dlp' binary wasn't found in PATH
    if (cmd !== 'python3') {
      console.log('Attempting fallback to python3 -m yt_dlp...');
      const fallbackChild = spawn('python3', ['-m', 'yt_dlp', ...extraArgs]);
      fallbackChild.stdout.on('data', onStdout);
      fallbackChild.stderr.on('data', onStderr);
      fallbackChild.on('close', onClose);
      fallbackChild.on('error', fbErr => {
        console.error('Fallback python3 spawn error:', fbErr);
        onClose(1);
      });
    } else {
      onClose(1);
    }
  });

  child.on('close', code => {
    if (!hasErrored) onClose(code);
  });

  return child;
}

// API Endpoint: Autocomplete Suggestions
app.get('/api/suggest', (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  const suggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
  https.get(suggestUrl, (apiRes) => {
    let raw = '';
    apiRes.on('data', chunk => { raw += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        const suggestions = json[1] || [];
        res.json(suggestions);
      } catch (e) {
        res.json([]);
      }
    });
  }).on('error', () => {
    res.json([]);
  });
});

// API Endpoint: Search YouTube Videos
app.get('/api/search', (req, res) => {
  const query = req.query.q || req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Search query parameter (q) is required' });
  }

  const maxResults = parseInt(req.query.limit || '8', 10);
  const extraArgs = [
    '--no-warnings',
    '--no-check-certificates',
    '--geo-bypass',
    '-j',
    `ytsearch${maxResults}:${query}`
  ];

  let output = '';
  let errorOutput = '';

  spawnYtdl(
    extraArgs,
    data => { output += data.toString(); },
    data => { errorOutput += data.toString(); },
    code => {
      if (!output) {
        console.error('Search error output:', errorOutput);
        return res.status(500).json({ error: 'Search failed' });
      }

      try {
        const lines = output.trim().split('\n').filter(Boolean);
        const results = lines.map(line => {
          try {
            const item = JSON.parse(line);
            return {
              id: item.id,
              title: item.title,
              duration: formatDuration(item.duration),
              thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
              channel: item.uploader || item.channel || 'YouTube'
            };
          } catch (e) {
            return null;
          }
        }).filter(Boolean);

        return res.json({ results });
      } catch (e) {
        console.error('JSON parse error in search:', e);
        return res.status(500).json({ error: 'Invalid response from search engine' });
      }
    }
  );
});

// API Endpoint: Analyze / Fetch Video Info
app.get('/api/info', (req, res) => {
  const input = req.query.url || req.query.v || req.query.q;
  if (!input) {
    return res.status(400).json({ error: 'URL or Video ID parameter is required' });
  }

  const videoId = parseYoutubeId(input);
  const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : input;

  const extraArgs = [
    '--no-warnings',
    '--no-check-certificates',
    '--geo-bypass',
    '-j',
    targetUrl
  ];

  let output = '';
  let errorOutput = '';

  spawnYtdl(
    extraArgs,
    data => { output += data.toString(); },
    data => { errorOutput += data.toString(); },
    code => {
      if (!output) {
        console.error('Info extraction error:', errorOutput);
        return res.status(500).json({ error: 'Could not fetch video information. Please check the URL.' });
      }

    try {
      const data = JSON.parse(output);
      const id = data.id || videoId;
      const title = data.title || 'YouTube Video';
      const duration = formatDuration(data.duration);
      const thumbnail = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
      const fallbackThumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const channel = data.uploader || data.channel || 'YouTube';

      // Define standardized Video Formats
      const videoFormats = [
        { quality: '1080p', ext: 'mp4', label: '1080p (.mp4)', formatId: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', note: 'Full HD' },
        { quality: '720p', ext: 'mp4', label: '720p (.mp4)', formatId: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best', note: 'HD' },
        { quality: '480p', ext: 'mp4', label: '480p (.mp4)', formatId: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best', note: 'Medium' },
        { quality: '360p', ext: 'mp4', label: '360p (.mp4)', formatId: 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/18/best[height<=360]', note: 'Standard' },
        { quality: '240p', ext: 'mp4', label: '240p (.mp4)', formatId: 'bestvideo[height<=240][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=240]+bestaudio/best[height<=240]', note: 'Low' }
      ];

      // Define standardized Audio Formats
      const audioFormats = [
        { bitrate: '320 kbps', ext: 'mp3', label: 'MP3 (320 kbps)', formatId: 'bestaudio/best', note: 'High Quality Audio' },
        { bitrate: '256 kbps', ext: 'mp3', label: 'MP3 (256 kbps)', formatId: 'bestaudio/best', note: 'Good Quality' },
        { bitrate: '128 kbps', ext: 'mp3', label: 'MP3 (128 kbps)', formatId: 'bestaudio/best', note: 'Standard Audio' },
        { bitrate: 'm4a', ext: 'm4a', label: 'Audio (.m4a)', formatId: 'bestaudio[ext=m4a]/bestaudio/best', note: 'M4A Audio Stream' }
      ];

      return res.json({
        id,
        title,
        duration,
        thumbnail,
        fallbackThumb,
        channel,
        videoFormats,
        audioFormats
      });
    } catch (e) {
      console.error('Info JSON parse error:', e);
      return res.status(500).json({ error: 'Failed to process video info' });
    }
  });
});

// Active download progress store for real-time SSE progress updates
const activeDownloads = new Map();

// API Endpoint: Real-time Download Progress SSE Stream
app.get('/api/download-progress', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing download id parameter');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (res.flushHeaders) res.flushHeaders();

  let download = activeDownloads.get(id);
  if (!download) {
    download = { percent: 1, status: 'Downloading 1%', clients: new Set() };
    activeDownloads.set(id, download);
  }

  download.clients.add(res);

  // Immediately send initial progress state
  res.write(`data: ${JSON.stringify({ percent: download.percent, status: download.status })}\n\n`);

  req.on('close', () => {
    if (download) {
      download.clients.delete(res);
    }
  });
});

function updateProgress(id, percent, status) {
  let download = activeDownloads.get(id);
  if (!download) {
    download = { percent: 1, status: 'Downloading 1%', clients: new Set() };
    activeDownloads.set(id, download);
  }
  download.percent = Math.min(100, Math.max(1, percent));
  if (status) download.status = status;

  const payload = JSON.stringify({ percent: download.percent, status: download.status });
  for (const client of download.clients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      // Ignore client write errors
    }
  }
}

// API Endpoint: Download Video or Audio Stream
app.get('/api/download', (req, res) => {
  const { url, v, format, type, title, id } = req.query;
  const targetId = parseYoutubeId(url || v);
  if (!targetId) {
    return res.status(400).send('Invalid or missing YouTube URL/ID');
  }

  const downloadId = id || (`dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  const videoUrl = `https://www.youtube.com/watch?v=${targetId}`;
  const cleanTitle = sanitizeFilename(title || 'y2mate_download');
  const isAudio = type === 'audio';
  const ext = isAudio ? (format === 'm4a' ? 'm4a' : 'mp3') : 'mp4';
  const rawFormat = (format || '').replace(/ /g, '+');
  const formatArg = rawFormat || (isAudio ? 'bestaudio/best' : 'bestvideo[height<=1080]+bestaudio/best');

  const tempDir = path.join(__dirname, 'temp_downloads');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempFilePath = path.join(tempDir, `${downloadId}.${ext}`);

  const { cmd, argsPrefix } = getYtdlCmd();
  const args = [
    ...argsPrefix,
    '--newline',
    '-f', formatArg,
    isAudio ? '--extract-audio' : '--merge-output-format',
    isAudio ? undefined : 'mp4',
    isAudio ? '--audio-format' : undefined,
    isAudio ? ext : undefined,
    '-o', tempFilePath,
    videoUrl
  ].filter(Boolean);

  updateProgress(downloadId, 1, 'Downloading 1%');

  const child = spawn(cmd, args);

  let destCount = 0;
  let isMultiStream = false;
  let currentPercent = 1;

  const parseProgressOutput = (data) => {
    const str = data.toString();

    if (str.includes('Downloading 2 format(s)') || str.includes('Downloading 3 format(s)')) {
      isMultiStream = true;
    }

    if (str.includes('[download] Destination:')) {
      destCount++;
    }

    const percentMatch = str.match(/\[download\]\s+([\d\.]+)%/);
    if (percentMatch) {
      const rawP = parseFloat(percentMatch[1]);
      if (!isNaN(rawP)) {
        let overallP = rawP;
        if (isMultiStream) {
          if (destCount <= 1) {
            overallP = 1 + (rawP * 0.59); // Stream 1: 1% to 60%
          } else {
            overallP = 60 + (rawP * 0.35); // Stream 2: 60% to 95%
          }
        } else {
          overallP = 1 + (rawP * 0.94); // Single stream: 1% to 95%
        }
        overallP = Math.min(95, Math.max(1, overallP));
        if (overallP > currentPercent) {
          currentPercent = overallP;
          updateProgress(downloadId, currentPercent, `Downloading ${Math.round(currentPercent)}%`);
        }
      }
    } else if (str.includes('[ExtractAudio]') || str.includes('[Merger]') || str.includes('[ffmpeg]')) {
      if (currentPercent < 96) {
        currentPercent = 96;
        updateProgress(downloadId, 96, 'Processing...');
      }
    }
  };

  child.stdout.on('data', parseProgressOutput);
  child.stderr.on('data', data => {
    console.warn('Download stderr:', data.toString());
    parseProgressOutput(data);
  });

  child.on('close', code => {
    if (code === 0 && fs.existsSync(tempFilePath)) {
      updateProgress(downloadId, 99, 'Sending file...');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(cleanTitle)}.${ext}"`);
      res.setHeader('Content-Type', isAudio ? (ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg') : 'video/mp4');

      const fileStream = fs.createReadStream(tempFilePath);
      fileStream.pipe(res);

      fileStream.on('end', () => {
        updateProgress(downloadId, 100, 'Completed!');
        fs.unlink(tempFilePath, () => {});
        setTimeout(() => { activeDownloads.delete(downloadId); }, 5000);
      });

      fileStream.on('error', (err) => {
        console.error('File stream error:', err);
        updateProgress(downloadId, 0, 'Failed');
        fs.unlink(tempFilePath, () => {});
      });
    } else {
      console.error(`Download child process exited with code ${code}`);
      updateProgress(downloadId, 0, 'Failed');
      if (!res.headersSent) {
        res.status(500).send('Failed to process video download');
      }
      if (fs.existsSync(tempFilePath)) {
        fs.unlink(tempFilePath, () => {});
      }
    }
  });

  child.on('error', err => {
    console.error('Download spawn error:', err);
    updateProgress(downloadId, 0, 'Failed');
    if (!res.headersSent) {
      res.status(500).send('Download process failed');
    }
    if (fs.existsSync(tempFilePath)) {
      fs.unlink(tempFilePath, () => {});
    }
  });

  req.on('close', () => {
    if (!res.writableEnded) {
      child.kill('SIGKILL');
      if (fs.existsSync(tempFilePath)) {
        fs.unlink(tempFilePath, () => {});
      }
    }
  });
});

// Handle form post fallbacks (e.g. /search, /convert)
app.all(['/search', '/search/', '/convert', '/convert/'], (req, res) => {
  const query = req.body?.q || req.query?.q || req.body?.videoId;
  if (query) {
    return res.redirect(`/?q=${encodeURIComponent(query)}`);
  }
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Y2Mate Web Server is running on http://localhost:${PORT}`);
  console.log(`  Developed by aks0dev (aks0) · GitHub: https://github.com/aks0dev/`);
  console.log(`====================================================`);
});

