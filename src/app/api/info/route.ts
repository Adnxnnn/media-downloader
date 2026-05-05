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
    if (isYouTube) {
      // FAST ROUTE: Use play-dl for instantaneous YouTube metadata
      const info = await play.video_info(url);
      
      const validFormats = info.format.filter(f => f.url && !f.mimeType?.includes('webm'));
      
      const videoFormats = validFormats.filter(f => f.hasVideo && f.qualityLabel);
      videoFormats.sort((a, b) => parseInt(b.qualityLabel || '0') - parseInt(a.qualityLabel || '0'));

      const audioFormats = validFormats.filter(f => !f.hasVideo && f.audioQuality);
      audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      return NextResponse.json({
        title: info.video_details.title,
        thumbnail: info.video_details.thumbnails[info.video_details.thumbnails.length - 1]?.url,
        duration: info.video_details.durationInSec,
        videoFormats: videoFormats.map(f => ({
          url: f.url,
          itag: f.itag,
          qualityLabel: f.qualityLabel,
          bitrate: f.bitrate,
          mimeType: f.mimeType
        })),
        audioFormats: audioFormats.map(f => ({
          url: f.url,
          itag: f.itag,
          qualityLabel: f.audioQuality,
          bitrate: f.bitrate,
          mimeType: f.mimeType
        })),
      });

    } else if (isInstagram) {
      // INSTAGRAM ROUTE: Use yt-dlp-exec
      const isWindows = os.platform() === 'win32';
      const ytdlpPath = path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');
      const { stdout } = await execPromise(`"${ytdlpPath}" "${url}" --dump-single-json --no-warnings`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);

      // Instagram usually has one main video format.
      // We will provide a Video option and a simulated Audio (MP3) option.
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
          itag: 'audio_extract', // Special itag to tell our proxy to convert to MP3
          qualityLabel: 'High Quality MP3',
          mimeType: 'audio/mp3'
        }],
      });
    }

  } catch (error: any) {
    console.error('Info Error:', error.message);
    return NextResponse.json({ error: 'Failed to process link. Please check if the URL is public and valid.' }, { status: 500 });
  }
}
