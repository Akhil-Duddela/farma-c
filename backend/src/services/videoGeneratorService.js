const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execFileAsync = promisify(execFile);

/**
 * @param {number} totalSec
 */
function formatSrtTime(totalSec) {
  const t = Math.max(0, totalSec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const wholeS = Math.floor(s);
  const ms = Math.round((s - wholeS) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(wholeS).padStart(2, '0')},${String(
    ms
  ).padStart(3, '0')}`;
}

/**
 * Split long script into subtitle lines.
 * @param {string} script
 */
function scriptToSrt(script) {
  const clean = (script && String(script).replace(/\r/g, ' ')) || 'Farm content';
  const maxChars = 44;
  const words = clean.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (`${cur} ${w}`.length <= maxChars) {
      cur = `${cur} ${w}`;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const blocks = lines.slice(0, 32);
  const perLine = 2.2;
  let t = 0;
  const srt = blocks
    .map((line, i) => {
      const start = t;
      t += perLine;
      return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(t)}\n${line.replace(/[<>]/g, '')}\n\n`;
    })
    .join('');
  const duration = Math.max(6, Math.min(120, blocks.length * perLine + 1));
  return { srt, duration };
}

/**
 * @param {string} script
 * @returns {Promise<Buffer>} MP4
 */
async function generateVideoFromScript(script) {
  const text = (script && String(script).trim()) || '—';
  const { srt, duration } = scriptToSrt(text);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcvid-'));
  const srtPath = path.join(dir, 'sub.srt');
  const outPath = path.join(dir, 'out.mp4');

  await fs.writeFile(srtPath, srt, 'utf8');

  // Solid background + SRT; anullsrc; 9:16. Path for subtitles filter: escape for ffmpeg.
  const esc = (p) => p.replace(/\\/g, '/').replace("'", "\\'");
  const vf = `subtitles=filename='${esc(srtPath)}'`;
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x0f2416:s=1080x1920:d=${duration}`,
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level',
    '3.0',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-movflags',
    '+faststart',
    outPath,
  ];

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const timeout = parseInt(process.env.FFMPEG_TIMEOUT_MS || '300000', 10);

  try {
    await execFileAsync(ffmpegPath, args, { maxBuffer: 20 * 1024 * 1024, timeout });
  } catch (e) {
    logger.warn('Subtitles pass failed, falling back to test pattern (no on-screen text)', { err: e?.message });
    // Fallback: valid MP4 without burned-in text (e.g. missing fontconfig) — still publishable
    const fb = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1080x1920:rate=1:duration=${Math.min(30, duration)}`,
      '-c:v',
      'libx264',
      '-profile:v',
      'baseline',
      '-pix_fmt',
      'yuv420p',
      outPath,
    ];
    try {
      await execFileAsync(ffmpegPath, fb, { maxBuffer: 20 * 1024 * 1024, timeout });
    } catch (e2) {
      if (e2.code === 'ENOENT') {
        const err = new Error('ffmpeg is not installed. Set FFMPEG_PATH or install ffmpeg.');
        err.status = 503;
        throw err;
      }
      if (e2.code === 'ETIMEDOUT' || (e2.killed && e2.signal === 'SIGTERM')) {
        const err3 = new Error('FFmpeg encoding timed out');
        err3.status = 504;
        throw err3;
      }
      const err4 = new Error(
        (e2.stderr && e2.stderr.toString()) || e2.message || 'FFmpeg failed'
      );
      err4.status = 500;
      throw err4;
    }
  } finally {
    try {
      await fs.unlink(srtPath);
    } catch {
      // ignore
    }
  }

  const buf = await fs.readFile(outPath);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  if (!buf || buf.length < 200) {
    const err = new Error('Video output is empty or too small');
    err.status = 500;
    throw err;
  }
  return buf;
}

/**
 * Split script into "scenes" (by paragraph) for future image/TTS — placeholder for pipeline hooks.
 * @param {string} script
 * @returns {string[]}
 */
function splitScenes(script) {
  if (!script) {
    return [''];
  }
  return String(script)
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

module.exports = { generateVideoFromScript, buildSrtFromScript: scriptToSrt, splitScenes };
