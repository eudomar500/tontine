'use client';

import React from 'react';
import Image from 'next/image';
import { Shield, Sparkles, FileText, Wallet } from 'lucide-react';
import { useWalletStore } from '../store/wallet';

export default function Hero() {
  const { connectedAddress, setModalOpen } = useWalletStore();

  return (
    <section className="relative flex flex-col items-center justify-center text-center py-36 md:py-48 px-6 sm:px-8 overflow-hidden w-full max-w-7xl mx-auto">
      {/* Radial glow backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-radial from-brand-magenta/5 via-brand-gold/5 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full flex flex-col items-center">
        {/* Centerpiece gradient wordmark logo */}
        <div className="mb-12 md:mb-16 animate-fade-in select-none">
          <Image
            src="/logo-gradient.svg"
            alt="tontine"
            width={240}
            height={60}
            priority
            className="w-40 sm:w-48 md:w-56 h-auto object-contain"
          />
        </div>

        {/* Minimal geometric supporting line */}
        <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-wide text-foreground/80 max-w-2xl leading-relaxed mb-12 animate-fade-in-up">
          Private peer-to-peer agreements on GenLayer, resolved by decentralized consensus.
        </h1>

        {/* CTA connection trigger */}
        {!connectedAddress && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-foreground hover:bg-warm-white text-background rounded-xl font-semibold tracking-wide transition-all duration-300 shadow-lg hover:shadow-warm-white/10 mb-32 sm:mb-40 md:mb-48 cursor-pointer text-sm animate-fade-in-up"
            style={{ animationDelay: '150ms', animationFillMode: 'both' }}
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet to Start
          </button>
        )}

        {/* Feature highlight grid */}
        <div 
          className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16 w-full max-w-5xl mt-12 border-t border-charcoal-light/30 pt-16 animate-fade-in-up"
          style={{ animationDelay: '300ms', animationFillMode: 'both' }}
        >
          <div className="flex flex-col text-left group">
            <div className="text-brand-gold mb-5 transition-transform group-hover:-translate-y-0.5 duration-300">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight mb-3">
              Whitelisted Pools
            </h3>
            <p className="text-sm sm:text-base text-foreground/50 leading-relaxed font-light">
              Open private agreements by inviting a fixed list of participating wallets. Security and confidentiality without middlemen.
            </p>
          </div>

          <div className="flex flex-col text-left group">
            <div className="text-brand-magenta mb-5 transition-transform group-hover:-translate-y-0.5 duration-300">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight mb-3">
              Verifiable Terms
            </h3>
            <p className="text-sm sm:text-base text-foreground/50 leading-relaxed font-light">
              Define objective outcomes and specify trusted public web sources. Participants stake native GEN on outcomes they expect.
            </p>
          </div>

          <div className="flex flex-col text-left group">
            <div className="text-foreground/80 mb-5 transition-transform group-hover:-translate-y-0.5 duration-300">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight mb-3">
              LLM Consensus
            </h3>
            <p className="text-sm sm:text-base text-foreground/50 leading-relaxed font-light">
              Upon pool maturity, GenLayer LLM consensus processes web sources and splits the pooled pot pro-rata among winning outcomes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
