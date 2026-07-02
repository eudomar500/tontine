'use client';

import React from 'react';
import Header from '../../components/Header';
import PoolExplorer from '../../components/PoolExplorer';
import Leaderboard from '../../components/Leaderboard';
import WalletModal from '../../components/WalletModal';
import NetworkStatus from '../../components/NetworkStatus';
import Footer from '../../components/Footer';

export default function ExplorePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-brand-magenta/30 selection:text-foreground">
      {/* Header Navigation with logo and profile */}
      <Header />

      {/* Main content area */}
      <main className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-6 sm:px-8 py-16 relative z-20">
        {/* Explore Prediction Events Header */}
        <div className="text-center mb-16 animate-fade-in-up" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">
            Explore Prediction Events
          </h1>
          <p className="text-sm sm:text-base text-foreground/50 max-w-xl mx-auto font-light leading-relaxed">
            Find and track active and settled peer-to-peer prediction events resolved by GenLayer LLM consensus on the Bradbury testnet.
          </p>
        </div>

        <PoolExplorer />
        <Leaderboard />
      </main>

      {/* Footer Navigation */}
      <Footer />

      {/* Wallet connection dialog */}
      <WalletModal />

      {/* Floating transaction tracking widget */}
      <NetworkStatus />
    </div>
  );
}
