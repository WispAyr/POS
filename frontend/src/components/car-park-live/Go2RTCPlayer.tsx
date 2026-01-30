import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Maximize2 } from 'lucide-react';

interface Go2RTCPlayerProps {
  streamName: string;
  cameraName: string;
  go2rtcHost?: string;
  snapshotUrl?: string;
}

/**
 * Live video player using go2rtc MSE (Media Source Extensions)
 * Falls back to snapshot mode if streaming fails
 */
export function Go2RTCPlayer({
  streamName,
  cameraName,
  go2rtcHost = 'localhost:1984',
  snapshotUrl,
}: Go2RTCPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'connecting' | 'playing' | 'error'>('connecting');
  const [useSnapshot, setUseSnapshot] = useState(false);
  const [snapshotTs, setSnapshotTs] = useState(Date.now());

  useEffect(() => {
    const video = videoRef.current;
    if (!video || useSnapshot) return;

    let ws: WebSocket | null = null;
    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const bufferQueue: ArrayBuffer[] = [];
    let isUpdating = false;

    const cleanup = () => {
      if (ws) {
        ws.close();
        ws = null;
      }
      if (mediaSource && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream();
        } catch (e) {
          // Ignore
        }
      }
    };

    const appendBuffer = () => {
      if (!sourceBuffer || isUpdating || bufferQueue.length === 0) return;
      
      isUpdating = true;
      try {
        const data = bufferQueue.shift();
        if (data) {
          sourceBuffer.appendBuffer(data);
        }
      } catch (e) {
        console.warn('Buffer append error:', e);
        isUpdating = false;
      }
    };

    const connect = () => {
      setStatus('connecting');

      // Use MSE mode which is more widely supported
      const wsUrl = `ws://${go2rtcHost}/api/ws?src=${streamName}`;
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // Request MSE stream
        ws?.send(JSON.stringify({ type: 'mse' }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'mse') {
            // Initialize MediaSource with the provided codecs
            const mimeType = `video/mp4; codecs="${msg.value}"`;
            
            if (!MediaSource.isTypeSupported(mimeType)) {
              console.error('Unsupported MIME type:', mimeType);
              setStatus('error');
              setUseSnapshot(true);
              return;
            }

            mediaSource = new MediaSource();
            video.src = URL.createObjectURL(mediaSource);

            mediaSource.addEventListener('sourceopen', () => {
              try {
                sourceBuffer = mediaSource!.addSourceBuffer(mimeType);
                sourceBuffer.mode = 'segments';
                
                sourceBuffer.addEventListener('updateend', () => {
                  isUpdating = false;
                  appendBuffer();
                });

                setStatus('playing');
              } catch (e) {
                console.error('SourceBuffer error:', e);
                setStatus('error');
                setUseSnapshot(true);
              }
            });

            video.play().catch(() => {
              video.muted = true;
              video.play().catch(console.warn);
            });
          }
        } else {
          // Binary data - video frames
          bufferQueue.push(event.data);
          appendBuffer();
        }
      };

      ws.onerror = () => {
        console.warn('WebSocket error');
        setStatus('error');
      };

      ws.onclose = () => {
        // If we were playing, try to reconnect
        if (status === 'playing') {
          setTimeout(connect, 3000);
        } else {
          setUseSnapshot(true);
        }
      };
    };

    connect();

    // Attempt timeout - fall back to snapshot after 10 seconds
    const timeout = setTimeout(() => {
      if (status === 'connecting') {
        console.warn('Stream timeout, falling back to snapshot');
        setUseSnapshot(true);
        cleanup();
      }
    }, 10000);

    return () => {
      clearTimeout(timeout);
      cleanup();
    };
  }, [streamName, go2rtcHost, useSnapshot, status]);

  // Snapshot refresh interval when in snapshot mode
  useEffect(() => {
    if (!useSnapshot) return;

    const interval = setInterval(() => {
      setSnapshotTs(Date.now());
    }, 8000);

    return () => clearInterval(interval);
  }, [useSnapshot]);

  const handleRetryVideo = () => {
    setUseSnapshot(false);
    setStatus('connecting');
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      videoRef.current.requestFullscreen?.();
    }
  };

  return (
    <div className="aspect-video bg-gray-900 relative group">
      {useSnapshot ? (
        // Snapshot mode fallback
        <>
          {snapshotUrl ? (
            <img
              key={snapshotTs}
              src={`${snapshotUrl}?t=${snapshotTs}`}
              alt={cameraName}
              className="w-full h-full object-cover"
              onError={() => {}}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
              <Camera className="w-12 h-12 mb-2 opacity-50" />
              <span className="text-sm">Camera unavailable</span>
            </div>
          )}
          <button
            onClick={handleRetryVideo}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Try live video"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        </>
      ) : (
        // Video mode
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
          />
          
          {status === 'connecting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
              <span className="text-white text-sm">Connecting to stream...</span>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <Camera className="w-8 h-8 text-white/50 mb-2" />
              <span className="text-white text-sm">Stream unavailable</span>
            </div>
          )}

          {status === 'playing' && (
            <button
              onClick={handleFullscreen}
              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4 text-white" />
            </button>
          )}
        </>
      )}

      {/* Camera name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium">{cameraName}</span>
          {status === 'playing' && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
          {useSnapshot && (
            <span className="text-xs text-gray-400">Snapshot mode</span>
          )}
        </div>
      </div>
    </div>
  );
}
