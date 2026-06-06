'use client';

import React from 'react';
import Image from 'next/image';
import { Shield, Sparkles, FileText, Wallet } from 'lucide-react';
import { useWalletStore } from '../store/wallet';

export default function Hero() {
  const { connectedAddress, setModalOpen } = useWalletStore();

  return (
    <section className="relative flex flex-col items-center justify-center text-center py-20 px-6 overflow-hidden">
      {/* Sleek radial glow background effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-radial from-brand-magenta/10 via-brand-gold/5 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl flex flex-col items-center">
        {/* Centerpiece Gradient Wordmark */}
        <div className="mb-6 animate-fade-in">
          <Image
            src="/logo-gradient.svg"
            alt="tontine"
            width={320}
            height={80}
            priority
            className="h-20 w-auto select-none"
          />
        </div>

        {/* Sober Tagline */}
        <p className="text-xl md:text-2xl text-foreground/85 font-light tracking-wide max-w-2xl leading-relaxed mb-10">
          Private peer-to-peer agreement pools on GenLayer, resolved by decentralized LLM consensus over public web sources.
        </p>

        {/* CTA Button */}
        {!connectedAddress && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-foreground hover:bg-warm-white text-background rounded-xl font-semibold tracking-wide transition-all shadow-lg hover:shadow-warm-white/10 mb-16 cursor-pointer"
          >
            <Wallet className="w-5 h-5" />
            Connect Wallet to Start
          </button>
        )}

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-6">
          <div className="bg-charcoal-medium/50 border border-charcoal-light rounded-2xl p-6 text-left hover:border-foreground/10 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-charcoal-light flex items-center justify-center mb-4 text-brand-gold">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Whitelisted Pools</h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Open private agreements by inviting a fixed list of participating wallets. Security and confidentiality without middlemen.
            </p>
          </div>

          <div className="bg-charcoal-medium/50 border border-charcoal-light rounded-2xl p-6 text-left hover:border-foreground/10 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-charcoal-light flex items-center justify-center mb-4 text-brand-magenta">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Verifiable Terms</h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Define objective outcomes and specify trusted public web sources. Participants stake native GEN on outcomes they expect.
            </p>
          </div>

          <div className="bg-charcoal-medium/50 border border-charcoal-light rounded-2xl p-6 text-left hover:border-foreground/10 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-charcoal-light flex items-center justify-center mb-4 text-foreground/80">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">LLM Consensus</h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Upon pool maturity, GenLayer LLM consensus processes web sources and splits the pooled pot pro-rata among winning outcomes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
