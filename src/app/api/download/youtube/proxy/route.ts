import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';

const execPromise = util.promisify(exec);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ytUrl = searchParams.get('url');
  const type = searchParams.get('type') || 'video';
  const itagParam = searchParams.get('itag');

  if (!ytUrl || !itagParam) {
    return new NextResponse('Missing URL or itag', { status: 400 });
  }

  const itag = String(itagParam);

  try {
    const isYouTube = ytUrl.includes('youtube.com') || ytUrl.includes('youtu.be');
    const isInstagram = ytUrl.includes('instagram.com');

    if (!isYouTube && !isInstagram) {
      throw new Error('Unsupported URL');
    }

    let downloadUrl = '';
    const isWindows = os.platform() === 'win32';
    const ytdlpPath = path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');

    if (isYouTube) {
      const { stdout } = await execPromise(`"${ytdlpPath}" "${ytUrl}" --dump-single-json --no-warnings`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);
      
      const format = info.formats.find((f: any) => String(f.format_id) === itag);
      
      if (!format || !format.url) {
        throw new Error('Format not found for the given itag');
      }
      downloadUrl = format.url;
    } else if (isInstagram) {
      const { stdout } = await execPromise(`"${ytdlpPath}" "${ytUrl}" --dump-single-json --no-warnings`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);
      
      if (!info.url) {
         throw new Error('Could not extract Instagram media URL');
      }
      downloadUrl = info.url;
    }

    // 2. Proxy the streaming URL
    const res = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });

    if (!res.ok) {
      console.error('Proxy fetch failed with status:', res.status, res.statusText);
      throw new Error(`Failed to fetch stream: ${res.status} ${res.statusText}`);
    }

    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('Content-Type') || 'application/octet-stream');
    
    // Determine extension based on content-type
    const contentType = res.headers.get('Content-Type') || '';
    let ext = type === 'audio' ? 'mp3' : 'mp4';
    
    if (contentType.includes('audio')) {
      if (contentType.includes('mp4')) ext = 'm4a';
      else if (contentType.includes('webm')) ext = 'webm';
    } else if (contentType.includes('webm')) {
      ext = 'webm';
    }
    
    headers.set('Content-Disposition', `attachment; filename="download.${ext}"`);
    if (res.headers.has('Content-Length')) {
      headers.set('Content-Length', res.headers.get('Content-Length')!);
    }

    return new NextResponse(res.body, { headers });
  } catch (error: any) {
    console.error('Proxy Error:', error.message);
    return new NextResponse('Error proxying download: ' + error.message, { status: 500 });
  }
}
