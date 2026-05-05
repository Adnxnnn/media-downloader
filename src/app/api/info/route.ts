import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import play from 'play-dl';

const execPromise = util.promisify(exec);

// SIMPLE IN-MEMORY CACHE
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 Minutes
const MAX_CACHE_SIZE = 100;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  // Prevent memory leak: Limit cache size
  if (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  // Check Cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Serving from cache:', url);
    return NextResponse.json(cached.data);
  }

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  const isInstagram = url.includes('instagram.com');

  if (!isYouTube && !isInstagram) {
    return NextResponse.json({ error: 'Unsupported URL. Please use YouTube or Instagram.' }, { status: 400 });
  }

  try {
    const isWindows = os.platform() === 'win32';
    const ytdlpPath = path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');

    if (isYouTube) {
      try {
        console.log('Fetching YouTube info with play-dl:', url);
        // Add a 10-second timeout to play-dl to prevent Gateway timeouts
        const info = await Promise.race([
          play.video_info(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('play-dl timeout')), 10000))
        ]) as any;
        
        const validFormats = info.format.filter(f => f.url);
        
        const videoFormats = validFormats.filter((f: any) => f.qualityLabel);
        videoFormats.sort((a: any, b: any) => parseInt(b.qualityLabel || '0') - parseInt(a.qualityLabel || '0'));

        const audioFormats = validFormats.filter((f: any) => !f.qualityLabel && f.audioQuality);
        audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        const responseData = {
          title: info.video_details.title,
          thumbnail: info.video_details.thumbnails[info.video_details.thumbnails.length - 1]?.url,
          duration: info.video_details.durationInSec,
          videoFormats: videoFormats.map((f: any) => {
            const hasAudio = f.hasAudio || f.audioBitrate || f.audioQuality;
            return {
              url: f.url,
              itag: f.itag,
              qualityLabel: `${f.qualityLabel}${f.fps ? ` (${f.fps}fps)` : ''}${hasAudio ? ' + Audio' : ' (No Audio)'}`,
              bitrate: f.bitrate,
              mimeType: f.mimeType,
              isCombined: !!hasAudio
            };
          }),
          audioFormats: audioFormats.map((f: any) => ({
            url: f.url,
            itag: f.itag,
            qualityLabel: `${f.audioQuality || 'Standard'} • ${Math.round((f.bitrate || 0) / 1000)}kbps`,
            bitrate: f.bitrate,
            mimeType: f.mimeType
          })),
        };

        cache.set(url, { data: responseData, timestamp: Date.now() });
        return NextResponse.json(responseData);
      } catch (playError: any) {
        console.warn('play-dl failed, falling back to yt-dlp:', playError.message);
        // Fallback to yt-dlp if play-dl fails (e.g. due to rate limits)
        const { stdout } = await execPromise(`"${ytdlpPath}" "${url}" --dump-single-json --no-warnings --no-check-certificate --no-playlist --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36" --add-header "Accept-Language:en-US,en;q=0.9"`, { maxBuffer: 1024 * 1024 * 10 });
        const info = JSON.parse(stdout);
        
        const validFormats = info.formats.filter((f: any) => f.url);
        const videoFormatsRaw = validFormats.filter((f: any) => f.vcodec !== 'none');
        const audioFormatsRaw = validFormats.filter((f: any) => f.vcodec === 'none' && f.acodec !== 'none');

        const responseData = {
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          videoFormats: videoFormatsRaw.map((f: any) => {
            const hasAudio = f.acodec !== 'none';
            return {
              url: f.url,
              itag: f.format_id,
              qualityLabel: `${f.height ? `${f.height}p` : f.format_note}${f.fps ? ` (${f.fps}fps)` : ''}${hasAudio ? ' + Audio' : ' (No Audio)'}`,
              mimeType: `video/${f.ext}`,
              isCombined: hasAudio
            };
          }),
          audioFormats: audioFormatsRaw.map((f: any) => ({
            url: f.url,
            itag: f.format_id,
            qualityLabel: `${f.format_note || 'Audio'} • ${Math.round(f.abr || 0)}kbps`,
            mimeType: `audio/${f.ext}`
          })),
        };

        cache.set(url, { data: responseData, timestamp: Date.now() });
        return NextResponse.json(responseData);
      }

    } else if (isInstagram) {
      console.log('Processing Instagram URL with yt-dlp:', url);
      const { stdout } = await execPromise(`"${ytdlpPath}" "${url}" --dump-single-json --no-warnings --no-check-certificate --no-playlist --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36" --add-header "Accept-Language:en-US,en;q=0.9"`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);
      const bestVideoId = info.format_id || 'best';

      const responseData = {
        title: info.title || info.description?.substring(0, 50) || 'Instagram Media',
        thumbnail: info.thumbnail,
        duration: info.duration || 0,
        videoFormats: [{
          url: info.url,
          itag: bestVideoId,
          qualityLabel: 'Original Quality',
          mimeType: 'video/mp4'
        }],
        audioFormats: [{
          url: info.url,
          itag: 'audio_extract',
          qualityLabel: 'High Quality MP3',
          mimeType: 'audio/mp3'
        }],
      };
      
      cache.set(url, { data: responseData, timestamp: Date.now() });
      return NextResponse.json(responseData);
    }

  } catch (error: any) {
    console.error('Final Info Error:', error);
    return NextResponse.json({ error: 'Failed to process link: ' + error.message }, { status: 500 });
  }
}
