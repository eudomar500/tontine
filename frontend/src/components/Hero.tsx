'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { Users, FileCheck, Cpu, Wallet } from 'lucide-react';
import { useWalletStore } from '../store/wallet';
import { useThemeStore } from '../store/theme';
import LightSweep from './LightSweep';

interface TiltCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  iconColor: string;
}

function TiltCard({ icon, title, description, iconColor }: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    const sheen = sheenRef.current;
    if (!card) return;

    if (typeof window !== 'undefined' && !window.matchMedia('(hover: hover)').matches) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xc = rect.width / 2;
    const yc = rect.height / 2;

    const rotateX = -(y - yc) / yc * 8;
    const rotateY = (x - xc) / xc * 8;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;

    if (sheen) {
      const pctX = (x / rect.width) * 100;
      const pctY = (y / rect.height) * 100;
      sheen.style.background = `radial-gradient(circle at ${pctX}% ${pctY}%, rgba(201, 162, 39, 0.15) 0%, rgba(178, 58, 110, 0.15) 45%, transparent 80%)`;
      sheen.style.opacity = '1';
    }
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    const sheen = sheenRef.current;
    if (!card) return;

    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    
    if (sheen) {
      sheen.style.opacity = '0';
    }
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      ref={cardRef}
      className="relative flex flex-col text-left p-8 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl transition-all duration-300 ease-out shadow-lg hover:shadow-brand-gold/5 dark:hover:shadow-brand-magenta/5 select-none overflow-hidden cursor-pointer"
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
    >
      {/* Iridescent sheen overlay */}
      <div
        ref={sheenRef}
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 z-10"
      />
      
      {/* Card content with 3D translation */}
      <div style={{ transform: 'translateZ(30px)', transformStyle: 'preserve-3d' }}>
        <div className={`mb-5 ${iconColor} transition-transform duration-300`}>
          {icon}
        </div>
        <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight mb-3">
          {title}
        </h3>
        <p className="text-sm sm:text-base text-foreground/50 leading-relaxed font-light">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function Hero() {
  const { connectedAddress, setModalOpen } = useWalletStore();
  const theme = useThemeStore((state) => state.theme);

  return (
    <section className="relative flex flex-col items-center justify-center text-center py-36 md:py-48 overflow-hidden w-full">
      {/* Radial glow backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-radial from-brand-magenta/5 via-brand-gold/5 to-transparent blur-3xl pointer-events-none" />

      {/* Looping stage lights sweep backdrop */}
      {theme === 'dark' && <LightSweep />}

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 flex flex-col items-center">
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
          className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl mt-12 border-t border-charcoal-light/30 pt-16 animate-fade-in-up"
          style={{ animationDelay: '300ms', animationFillMode: 'both', perspective: '1000px' }}
        >
          <TiltCard
            icon={<Users className="w-6 h-6" strokeWidth={2.25} />}
            title="Whitelisted Pools"
            description="Open private agreements by inviting a fixed list of participating wallets. Security and confidentiality without middlemen."
            iconColor="text-brand-gold"
          />

          <TiltCard
            icon={<FileCheck className="w-6 h-6" strokeWidth={2.25} />}
            title="Verifiable Terms"
            description="Define objective outcomes and specify trusted public web sources. Participants stake native GEN on outcomes they expect."
            iconColor="text-brand-magenta"
          />

          <TiltCard
            icon={<Cpu className="w-6 h-6" strokeWidth={2.25} />}
            title="LLM Consensus"
            description="Upon pool maturity, GenLayer LLM consensus processes web sources and splits the pooled pot pro-rata among winning outcomes."
            iconColor="text-foreground/85"
          />
        </div>
      </div>
    </section>
  );
}
