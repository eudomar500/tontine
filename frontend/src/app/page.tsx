'use client';

import React from 'react';
import Header from '../components/Header';
import Hero from '../components/Hero';
import WalletModal from '../components/WalletModal';
import NetworkStatus from '../components/NetworkStatus';
import RolesSection from '../components/RolesSection';
import WhyGenLayer from '../components/WhyGenLayer';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-brand-magenta/30 selection:text-foreground">
      {/* Header Navigation with logo and profile */}
      <Header />

      {/* Main content area */}
      <main className="flex-1 flex flex-col">
        {/* Brand Hero introduction */}
        <Hero />

        {/* How Tontine works roles section */}
        <RolesSection />

        {/* Why GenLayer section */}
        <WhyGenLayer />
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
