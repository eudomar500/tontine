'use client';

import React from 'react';
import Header from '../../components/Header';
import AdminPanel from '../../components/AdminPanel';
import WalletModal from '../../components/WalletModal';
import NetworkStatus from '../../components/NetworkStatus';

export default function AdminPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-brand-magenta/30 selection:text-foreground">
      {/* Header navigation containing logo, profile, and theme switches */}
      <Header />

      {/* Main dashboard content */}
      <main className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-6 sm:px-8 py-12 relative z-20">
        <AdminPanel />
      </main>

      {/* Modal containers */}
      <WalletModal />

      {/* Floating transaction tracking widget */}
      <NetworkStatus />
    </div>
  );
}
