import { useState, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Sync state with actual fullscreen status
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts: F11 or Cmd/Ctrl+Shift+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F11
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      // Cmd/Ctrl + Shift + F
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen]);

  return (
    <button
      onClick={toggleFullscreen}
      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
      title={isFullscreen ? 'Exit fullscreen (F11)' : 'Enter fullscreen (F11)'}
    >
      {isFullscreen ? (
        <Minimize2 className="w-5 h-5" />
      ) : (
        <Maximize2 className="w-5 h-5" />
      )}
    </button>
  );
}
