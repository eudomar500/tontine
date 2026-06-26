'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Avatar from 'boring-avatars';
import { Copy, Check, ExternalLink, Wallet, Sun, Moon } from 'lucide-react';
import { useWalletStore } from '../store/wallet';
import { useThemeStore } from '../store/theme';
import { useAdminStore } from '../store/admin';

export default function Header() {
  const { connectedAddress, setModalOpen, disconnectWallet, initializeDiscovery } = useWalletStore();
  const { theme, toggleTheme } = useThemeStore();
  const { adminState, killswitchStatus, loadAdminData } = useAdminStore();
  const [copied, setCopied] = useState(false);
  const [killswitchCountdown, setKillswitchCountdown] = useState<string>('');

  // Initialize EIP-6963 discovery
  useEffect(() => {
    const cleanup = initializeDiscovery();
    return cleanup;
  }, [initializeDiscovery]);

  // Retrieve administrative configurations and maintain updates via a periodic poll.
  useEffect(() => {
    loadAdminData();
    const interval = setInterval(() => {
      loadAdminData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadAdminData]);

  // Compute and update the remaining time for the emergency shutdown window.
  useEffect(() => {
    if (!killswitchStatus?.active || !killswitchStatus.window_ends_at) {
      setKillswitchCountdown('');
      return;
    }

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = killswitchStatus.window_ends_at - now;
      if (diff <= 0) {
        setKillswitchCountdown('Emergency window expired');
      } else {
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        
        const formatted = [];
        if (days > 0) formatted.push(`${days}d`);
        if (hours > 0 || days > 0) formatted.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) formatted.push(`${minutes}m`);
        formatted.push(`${seconds}s`);
        
        setKillswitchCountdown(formatted.join(' '));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [killswitchStatus]);

  const isAdmin =
    connectedAddress &&
    adminState &&
    adminState.admin.toLowerCase() === connectedAddress.toLowerCase();

  const handleCopy = async () => {
    if (!connectedAddress) return;
    try {
      await navigator.clipboard.writeText(connectedAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="sticky top-0 z-40 w-full">
      {killswitchStatus?.active && (
        <div className="w-full bg-brand-magenta text-foreground py-2.5 px-4 text-center text-xs font-bold tracking-wide flex items-center justify-center gap-2">
          <span>Contract is in emergency shutdown. Withdraw deadline: {killswitchCountdown}</span>
        </div>
      )}
      <header className="w-full border-b border-charcoal-light/30 bg-charcoal-dark/80 backdrop-blur-md px-8 py-5 md:px-12 md:py-6 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <a href="/" className="flex items-center">
          <Image
            src={theme === 'dark' ? '/logo-monochrome.svg' : '/logo-monochrome-dark.svg'}
            alt="tontine logo"
            width={120}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </a>

        <nav className="hidden sm:flex items-center gap-6">
          <Link
            href="/explore"
            className="text-sm font-semibold tracking-wide text-foreground/50 hover:text-foreground transition-all duration-200"
          >
            Explore
          </Link>
          {isAdmin && (
            <a
              href="/admin"
              className="text-sm font-semibold tracking-wide text-foreground/50 hover:text-foreground transition-all duration-200"
            >
              Admin
            </a>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Theme toggle control */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-2.5 hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/60 hover:text-foreground transition-all cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {connectedAddress ? (
          <div className="flex items-center gap-3 bg-charcoal-medium border border-charcoal-light rounded-xl p-1.5 pl-3 pr-3">
            {/* boring-avatar identicon */}
            <div className="flex items-center justify-center rounded-full overflow-hidden w-6 h-6 border border-charcoal-light">
              <Avatar
                size={24}
                name={connectedAddress}
                variant="marble"
                colors={['#c9a227', '#b23a6e', '#f1ece3', '#1f1f22', '#0b0b0c']}
              />
            </div>
            
            <span className="text-sm font-medium text-foreground tracking-wide select-all">
              {truncateAddress(connectedAddress)}
            </span>

            <div className="flex items-center gap-1.5 border-l border-charcoal-light pl-2">
              {/* Copy address button */}
              <button
                onClick={handleCopy}
                title="Copy address"
                className="p-1 hover:bg-charcoal-light rounded text-foreground/60 hover:text-foreground transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-brand-gold" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* Explorer link */}
              <a
                href={`https://explorer-bradbury.genlayer.com/address/${connectedAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on explorer"
                className="p-1 hover:bg-charcoal-light rounded text-foreground/60 hover:text-foreground transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {/* Disconnect button */}
              <button
                onClick={disconnectWallet}
                className="ml-2 text-xs font-semibold text-brand-magenta hover:opacity-80 transition-opacity"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light hover:border-foreground/20 rounded-xl text-sm font-semibold tracking-wide text-foreground transition-all"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        )}
      </div>
    </header>
    </div>
  );
}
