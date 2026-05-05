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
      const { stdout } = await execPromise(`"${ytdlpPath}" "${ytUrl}" --dump-single-json --no-warnings --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36" --add-header "Accept-Language:en-US,en;q=0.9"`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);
      
      const format = info.formats.find((f: any) => String(f.format_id) === itag);
      
      if (!format || !format.url) {
        throw new Error('Format not found for the given itag');
      }
      downloadUrl = format.url;
    } else if (isInstagram) {
      const { stdout } = await execPromise(`"${ytdlpPath}" "${ytUrl}" --dump-single-json --no-warnings --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36" --add-header "Accept-Language:en-US,en;q=0.9"`, { maxBuffer: 1024 * 1024 * 10 });
      const info = JSON.parse(stdout);
      
      if (!info.url) {
         throw new Error('Could not extract Instagram media URL');
      }
      downloadUrl = info.url;
    }

    // 2. Proxy the streaming URL
    const res = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      }
    });

    if (!res.ok) {
      throw new Error(`Upstream server responded with ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || (type === 'audio' ? 'audio/mpeg' : 'video/mp4');
    const contentLength = res.headers.get('content-length');
    const ext = type === 'audio' ? 'mp3' : 'mp4';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="download_${itag}.${ext}"`);
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600');

    return new NextResponse(res.body, { headers });
  } catch (error: any) {
    console.error('Proxy Error:', error.message);
    return new NextResponse('Error proxying download: ' + error.message, { status: 500 });
  }
}
