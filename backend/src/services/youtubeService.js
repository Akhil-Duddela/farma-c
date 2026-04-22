const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream/promises');
const axios = require('axios');
const { google } = require('googleapis');
const { withRetry } = require('../utils/retry');
const { ensureFreshTokens } = require('./youtubeTokenService');

const MAX_BYTES = 256 * 1024 * 1024;

function parseIsoDuration(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i.exec(iso);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseFloat(m[3] || '0');
  return h * 3600 + min * 60 + s;
}

async function downloadToTempFile(url) {
  if (url.startsWith('s3://')) {
    throw new Error('YouTube upload requires a public HTTP(S) video URL, not a raw s3:// path');
  }
  const p = path.join(
    os.tmpdir(),
    `yts-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`
  );
  const w = fs.createWriteStream(p);
  const { data } = await withRetry(
    () =>
      axios.get(url, {
        responseType: 'stream',
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
        timeout: 300000,
      }),
    { maxAttempts: 3, baseDelayMs: 2000 }
  );
  if (!data) throw new Error('Empty response downloading video');
  await pipeline(data, w);
  const st = await fsp.stat(p);
  if (st.size > MAX_BYTES) {
    await fsp.rm(p, { force: true });
    throw new Error('Video file too large (max 256MB)');
  }
  return p;
}

/**
 * After upload, wait until the video is processed, then ensure Shorts rules (<=60s).
 * Deletes the video on validation failure to avoid low-quality public uploads.
 */
async function assertShortsOrDelete(youtube, videoId) {
  const start = Date.now();
  let details;
  while (Date.now() - start < 300000) {
    const { data } = await youtube.videos.list({
      part: 'contentDetails,status,processingDetails,snippet',
      id: [videoId],
    });
    const v = data.items && data.items[0];
    if (v) {
      const us = v.status?.uploadStatus;
      const hasDuration = v.contentDetails?.duration;
      if (us === 'processed' && hasDuration) {
        details = v;
        break;
      }
      if (us === 'uploaded' && hasDuration) {
        details = v;
        break;
      }
      if (v.status?.failureReason) {
        throw new Error(`YouTube processing failed: ${v.status.failureReason}`);
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (!details) {
    throw new Error('Timeout waiting for YouTube video processing and duration');
  }
  const dur = parseIsoDuration(details.contentDetails?.duration);
  if (dur > 60) {
    await youtube.videos.delete({ id: videoId });
    throw new Error(
      `YouTube Shorts require duration < 60s; got ${dur.toFixed(1)}s (video was removed)`
    );
  }
  return { durationSec: dur };
}

/**
 * @param {object} options
 * @param {import('mongoose').Document} options.account - YouTubeAccount
 * @param {string} options.videoUrl
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {string[]} [options.tags]
 * @param {'public' | 'unlisted' | 'private'} [options.privacyStatus]
 */
async function uploadShortFromUrl({ account, videoUrl, title, description = '', tags = [], privacyStatus = 'unlisted' }) {
  const auth = await ensureFreshTokens(account);
  const youtube = google.youtube({ version: 'v3', auth });

  const filePath = await downloadToTempFile(videoUrl);
  const cleanTitle = String(title).slice(0, 100);
  const withShorts = cleanTitle.toLowerCase().includes('shorts') ? cleanTitle : `${cleanTitle} #Shorts`;

  const requestBody = {
    snippet: {
      title: withShorts,
      description: (description || '').slice(0, 5000),
      tags: (tags && tags.length ? tags : ['shorts', 'farming', 'agriculture']).map((t) => String(t).slice(0, 30)).slice(0, 20),
      categoryId: '22',
    },
    status: { privacyStatus, selfDeclaredMadeForKids: false },
  };

  let res;
  try {
    res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media: { body: fs.createReadStream(filePath) },
    });
  } finally {
    try {
      await fsp.rm(filePath, { force: true });
    } catch {
      // ignore
    }
  }
  const videoId = res.data.id;
  if (!videoId) {
    throw new Error('YouTube upload did not return a video id');
  }
  const meta = await assertShortsOrDelete(youtube, videoId);
  return { videoId, durationSec: meta.durationSec };
}

module.exports = { uploadShortFromUrl, assertShortsOrDelete, downloadToTempFile, parseIsoDuration };
