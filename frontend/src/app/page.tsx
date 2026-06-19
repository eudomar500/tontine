'use client';

import Header from '../components/Header';
import Hero from '../components/Hero';
import PoolExplorer from '../components/PoolExplorer';
import WalletModal from '../components/WalletModal';
import NetworkStatus from '../components/NetworkStatus';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-brand-magenta/30 selection:text-foreground">
      {/* Header Navigation with logo and profile */}
      <Header />

      {/* Main content area */}
      <main className="flex-1 flex flex-col">
        {/* Brand Hero introduction */}
        <Hero />

        {/* Explore Prediction Pools */}
        <section id="explore" className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-24 border-t border-charcoal-light/25 flex flex-col items-center relative z-20">
          <div className="text-center mb-16 animate-fade-in-up" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">
              Explore Prediction Events
            </h2>
            <p className="text-sm sm:text-base text-foreground/50 max-w-xl mx-auto font-light leading-relaxed">
              Find and track active and settled peer-to-peer prediction events resolved by GenLayer LLM consensus on the Bradbury testnet.
            </p>
          </div>
          <PoolExplorer />
        </section>
      </main>

      {/* Wallet connection dialog */}
      <WalletModal />

      {/* Floating transaction tracking widget */}
      <NetworkStatus />
    </div>
  );
}

