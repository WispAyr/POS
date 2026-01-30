import { useState, useEffect } from 'react';

interface LiveClockProps {
  className?: string;
}

export function LiveClock({ className = '' }: LiveClockProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedDate = time.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className={`text-right ${className}`}>
      <div className="text-3xl font-mono font-bold text-gray-900 dark:text-white tabular-nums">
        {formattedTime}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {formattedDate}
      </div>
    </div>
  );
}
