import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import play from 'play-dl';

const execPromise = util.promisify(exec);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
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
      console.log('Processing YouTube URL with play-dl:', url);
      try {
        // FAST ROUTE: Use play-dl for instantaneous YouTube metadata
        const info = await play.video_info(url);
        
        const validFormats = info.format.filter(f => f.url && !f.mimeType?.includes('webm'));
        
        const videoFormats = validFormats.filter((f: any) => f.qualityLabel);
        videoFormats.sort((a: any, b: any) => parseInt(b.qualityLabel || '0') - parseInt(a.qualityLabel || '0'));

        const audioFormats = validFormats.filter((f: any) => !f.qualityLabel && f.audioQuality);
        audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        return NextResponse.json({
          title: info.video_details.title,
          thumbnail: info.video_details.thumbnails[info.video_details.thumbnails.length - 1]?.url,
          duration: info.video_details.durationInSec,
          videoFormats: videoFormats.map((f: any) => ({
            url: f.url,
            itag: f.itag,
            qualityLabel: f.qualityLabel,
            bitrate: f.bitrate,
            mimeType: f.mimeType
          })),
          audioFormats: audioFormats.map((f: any) => ({
            url: f.url,
            itag: f.itag,
            qualityLabel: f.audioQuality,
            bitrate: f.bitrate,
            mimeType: f.mimeType
          })),
        });
      } catch (playError: any) {
        console.warn('play-dl failed, falling back to yt-dlp:', playError.message);
        // Fallback to yt-dlp if play-dl fails (e.g. due to rate limits)
        const { stdout } = await execPromise(`"${ytdlpPath}" "${url}" --dump-single-json --no-warnings`, { maxBuffer: 1024 * 1024 * 10 });
        const info = JSON.parse(stdout);
        
        const validFormats = info.formats.filter((f: any) => f.url && f.ext !== 'webm');
        const videoFormatsRaw = validFormats.filter((f: any) => f.vcodec !== 'none');
        const audioFormatsRaw = validFormats.filter((f: any) => f.vcodec === 'none' && f.acodec !== 'none');

        return NextResponse.json({
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          videoFormats: videoFormatsRaw.map((f: any) => ({
            url: f.url,
            itag: f.format_id,
            qualityLabel: f.height ? `${f.height}p` : f.format_note,
            mimeType: `video/${f.ext}`
          })),
          audioFormats: audioFormatsRaw.map((f: any) => ({
            url: f.url,
            itag: f.format_id,
            qualityLabel: f.format_note || 'Audio',
            mimeType: `audio/${f.ext}`
          })),
        });
      }

    } else if (isInstagram) {
      console.log('Processing Instagram URL with yt-dlp:', url);
      const { stdout } = await execPromise(`"${ytdlpPath}" "${url}" --dump-single-json --no-warnings`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);

      const bestVideoId = info.format_id || 'best';
      
      return NextResponse.json({
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
      });
    }

  } catch (error: any) {
    console.error('Final Info Error:', error);
    return NextResponse.json({ error: 'Failed to process link: ' + error.message }, { status: 500 });
  }
}
