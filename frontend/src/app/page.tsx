'use client';

import Header from '../components/Header';
import Hero from '../components/Hero';
import WalletModal from '../components/WalletModal';
import NetworkStatus from '../components/NetworkStatus';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-brand-magenta/30 selection:text-foreground">
      {/* Header Navigation with logo and profile */}
      <Header />

      {/* Centered main content area */}
      <main className="flex-1 flex flex-col justify-center">
        {/* Brand Hero introduction */}
        <Hero />
      </main>

      {/* Wallet connection dialog */}
      <WalletModal />

      {/* Floating transaction tracking widget */}
      <NetworkStatus />
    </div>
  );
}

