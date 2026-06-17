import React, { useEffect, useState } from 'react';

interface AdminCountdownProps {
  deadline: number;
  onElapsed?: () => void;
  isExpiration?: boolean;
}

export default function AdminCountdown({
  deadline,
  onElapsed,
  isExpiration = false,
}: AdminCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isElapsed, setIsElapsed] = useState<boolean>(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft(isExpiration ? 'Expired' : 'Unlocked');
        setIsElapsed(true);
        onElapsed?.();
        return;
      }

      setIsElapsed(false);
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      const formatted = [];
      if (days > 0) formatted.push(`${days}d`);
      if (hours > 0 || days > 0) formatted.push(`${hours}h`);
      if (minutes > 0 || hours > 0 || days > 0) formatted.push(`${minutes}m`);
      formatted.push(`${seconds}s`);

      setTimeLeft(formatted.join(' '));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadline, isExpiration, onElapsed]);

  return (
    <span className={`font-mono text-[10px] ${isElapsed ? (isExpiration ? 'text-brand-magenta' : 'text-brand-gold') : 'text-foreground/50'}`}>
      {timeLeft}
    </span>
  );
}
