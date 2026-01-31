import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bot, Loader2 } from 'lucide-react';

export function AiReviewToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await axios.get('/api/ai-review/enabled');
        setEnabled(data.enabled);
      } catch (err) {
        console.error('Failed to fetch AI review status', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const toggleEnabled = async () => {
    try {
      setLoading(true);
      const { data } = await axios.post('/api/ai-review/enabled', {
        enabled: !enabled,
      });
      setEnabled(data.enabled);
    } catch (err) {
      console.error('Failed to toggle AI review', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800 mt-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-100 dark:bg-violet-900/20 rounded-lg">
          <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <div className="font-medium text-gray-900 dark:text-white">
            AI Review Feature
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Allow AI assistant to review events and log observations
          </div>
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      ) : (
        <button
          onClick={toggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            enabled
              ? 'bg-violet-600'
              : 'bg-gray-200 dark:bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      )}
    </div>
  );
}

export default AiReviewToggle;
