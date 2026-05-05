'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, MonitorPlay, Music, Video, Loader2, Play } from 'lucide-react';
import './page.css';

type Format = {
  url: string;
  itag: number | string;
  qualityLabel?: string;
  bitrate?: number;
  mimeType: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  
  const [selectedVideoItag, setSelectedVideoItag] = useState<number | string | ''>('');
  const [selectedAudioItag, setSelectedAudioItag] = useState<number | string | ''>('');

  const [downloading, setDownloading] = useState(false);

  const detectPlatform = (inputUrl: string) => {
    if (inputUrl.includes('youtube.com') || inputUrl.includes('youtu.be')) return 'youtube';
    if (inputUrl.includes('instagram.com')) return 'instagram';
    return null;
  };

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    const platform = detectPlatform(url);
    if (!platform) {
      setError('Please enter a valid YouTube or Instagram URL');
      return;
    }

    setError('');
    setLoading(true);
    setMediaInfo(null);

    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch media');
      }

      setMediaInfo(data);
      if (data.videoFormats && data.videoFormats.length > 0) {
        setSelectedVideoItag(data.videoFormats[0].itag);
      }
      if (data.audioFormats && data.audioFormats.length > 0) {
        setSelectedAudioItag(data.audioFormats[0].itag);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (itag: number | string | '', type: 'video' | 'audio') => {
    if (!itag) return;
    
    setDownloading(true);
    
    const proxyUrl = `/api/download/youtube/proxy?url=${encodeURIComponent(url)}&itag=${itag}&type=${type}`;
    
    // Create an invisible anchor tag to trigger the download securely
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Reset downloading state after a delay (enough time for the backend to start sending the file)
    setTimeout(() => {
      setDownloading(false);
    }, 4000);
  };



  return (
    <main className="main-container">
      <div className="hero-section">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="hero-content"
        >
          <div className="badge">
            <span className="sparkle">✨</span> Advanced Options
          </div>
          
          <h1 className="title">
            Ultimate Media <span className="text-gradient">Downloader</span>
          </h1>
          <p className="subtitle">
            Download your favorite YouTube and Instagram videos with full granular control over resolution, video formats, and audio extraction bitrates.
          </p>

          <form onSubmit={handleFetch} className="glass-panel form-container">
            <div className="input-group">
              <div className="input-icon-wrapper">
                {detectPlatform(url) === 'youtube' ? (
                  <MonitorPlay className="platform-icon text-red-500" color="#ef4444" />
                ) : (
                  <Play className="platform-icon" color="#9ca3af" />
                )}
              </div>
              <input
                type="text"
                placeholder="Paste YouTube or Instagram link here..."
                className="glass-input custom-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button 
                type="submit" 
                className="glass-button submit-btn"
                disabled={loading || !url}
              >
                {loading ? <Loader2 className="spinner" /> : 'Fetch Formats'}
              </button>
            </div>
          </form>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
              className="error-message glass-panel"
            >
              {error}
            </motion.div>
          )}

        </motion.div>
      </div>

      {/* Media Preview & Options Section */}
      <AnimatePresence>
        {mediaInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5 }}
            className="results-container"
          >
            <div className="glass-panel media-card">
              <div className="media-header">
                {mediaInfo.thumbnail && (
                  <img src={mediaInfo.thumbnail} alt={mediaInfo.title} className="thumbnail" />
                )}
                <div className="media-info">
                  <h3 className="media-title">{mediaInfo.title || 'Unknown Title'}</h3>
                  <p className="media-meta">
                    {detectPlatform(url) === 'youtube' ? 'YouTube' : 'Instagram'} {mediaInfo.duration ? `• ${mediaInfo.duration}s` : ''}
                  </p>
                </div>
              </div>

              <div className="tabs-container">
                <button 
                  className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
                  onClick={() => setActiveTab('video')}
                >
                  <Video size={18} /> Download Video
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audio')}
                >
                  <Music size={18} /> Extract Audio
                </button>
              </div>

              <div className="format-selection-area">
                {activeTab === 'video' ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="form-group">
                    <label>Select Video Quality & Format</label>
                    <select 
                      className="glass-select"
                      value={selectedVideoItag}
                      onChange={(e) => setSelectedVideoItag(e.target.value)}
                    >
                      {mediaInfo.videoFormats?.map((fmt: Format, idx: number) => (
                        <option key={idx} value={fmt.itag} style={{color: 'black'}}>
                          {fmt.qualityLabel || 'Standard'} • {fmt.mimeType.split(';')[0].split('/')[1].toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <div className="download-action-row">
                      <button 
                        className="glass-button" 
                        onClick={() => handleDownload(selectedVideoItag, 'video')}
                        disabled={!selectedVideoItag || downloading}
                      >
                        {downloading ? (
                          <><Loader2 size={18} className="spinner" /> Preparing...</>
                        ) : (
                          <><Download size={18} /> Download</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="form-group">
                    <label>Select Audio Extraction Quality</label>
                    <select 
                      className="glass-select"
                      value={selectedAudioItag}
                      onChange={(e) => setSelectedAudioItag(e.target.value)}
                    >
                      {mediaInfo.audioFormats?.map((fmt: any, idx: number) => (
                        <option key={idx} value={fmt.itag} style={{color: 'black'}}>
                          {fmt.mimeType.split(';')[0].split('/')[1].toUpperCase()} • {Math.round((fmt.bitrate || 0) / 1000)} kbps
                        </option>
                      ))}
                    </select>
                    <div className="download-action-row">
                      <button 
                        className="glass-button" 
                        onClick={() => handleDownload(selectedAudioItag, 'audio')}
                        disabled={!selectedAudioItag || downloading}
                      >
                        {downloading ? (
                          <><Loader2 size={18} className="spinner" /> Preparing...</>
                        ) : (
                          <><Download size={18} /> Download</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
