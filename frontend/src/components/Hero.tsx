import React, { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LightSweep from './LightSweep';
import { useThemeStore } from '../store/theme';

interface TiltCardProps {
  number: string;
  title: string;
  description: string;
}

function GradientNumeral({ number }: { number: string }) {
  return (
    <svg viewBox="0 0 65 38" className="h-16 w-auto select-none overflow-visible" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`gold-magenta-grad-${number}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#b23a6e" />
        </linearGradient>
      </defs>
      <text
        x="0"
        y="32"
        fill={`url(#gold-magenta-grad-${number})`}
        fillOpacity="0.03"
        stroke={`url(#gold-magenta-grad-${number})`}
        strokeWidth="1.5"
        style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}
        className="text-[38px] font-black tracking-tighter"
      >
        {number}
      </text>
    </svg>
  );
}

function TiltCard({ number, title, description }: TiltCardProps) {
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
      {/* Border Beam */}
      <div 
        className="border-beam-container" 
        style={{
          '--border-beam-width': '1.8px',
          '--border-beam-dark-opacity': '0.50',
          '--border-beam-light-opacity': '0.30',
        } as React.CSSProperties}
      />

      {/* Iridescent sheen overlay */}
      <div
        ref={sheenRef}
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 z-10"
      />
      
      {/* Card content with 3D translation */}
      <div style={{ transform: 'translateZ(30px)', transformStyle: 'preserve-3d' }}>
        <div className="mb-6 transition-transform duration-300 hover:scale-105">
          <GradientNumeral number={number} />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold font-display text-foreground tracking-tight mb-4 mt-2">
          {title}
        </h3>
        <p className="text-sm text-foreground/60 dark:text-foreground/50 leading-relaxed font-normal tracking-wide">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function Hero() {
  const theme = useThemeStore((state) => state.theme);

  return (
    <section className="relative flex flex-col items-center justify-center text-center py-24 md:py-32 overflow-hidden w-full">
      {/* Radial glow backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-radial from-brand-magenta/5 via-brand-gold/5 to-transparent blur-3xl pointer-events-none" />

      {/* Looping stage lights sweep backdrop */}
      {theme === 'dark' && <LightSweep />}

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 sm:px-8 flex flex-col items-center">
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

        {/* Hero CTAs */}
        <div 
          className="flex flex-wrap items-center justify-center gap-4 mb-32 sm:mb-40 md:mb-48 animate-fade-in-up"
          style={{ animationDelay: '150ms', animationFillMode: 'both' }}
        >
          <Link
            href="/explore"
            className="px-6 py-3 bg-gradient-to-r from-brand-gold to-brand-magenta text-[#f1ece3] hover:opacity-90 font-semibold rounded-xl tracking-wide transition-all duration-300 shadow-lg hover:shadow-brand-gold/10 hover:shadow-brand-magenta/10 text-sm cursor-pointer"
          >
            Explore Events
          </Link>
          <a
            href="https://docs.genlayer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-charcoal-light/40 hover:border-foreground/30 text-foreground hover:bg-charcoal-medium/20 rounded-xl font-semibold tracking-wide transition-all duration-300 text-sm cursor-pointer"
          >
            Read docs
          </a>
        </div>

        {/* Feature highlight grid */}
        <div 
          className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl mt-12 border-t border-charcoal-light/30 pt-16 animate-fade-in-up"
          style={{ animationDelay: '300ms', animationFillMode: 'both', perspective: '1000px' }}
        >
          <TiltCard
            number="01"
            title="Whitelisted Events"
            description="Open private agreements by inviting a fixed list of participating wallets. Security and confidentiality without middlemen."
          />

          <TiltCard
            number="02"
            title="Verifiable Terms"
            description="Define objective outcomes and specify trusted public web sources. Participants stake native GEN on outcomes they expect."
          />

          <TiltCard
            number="03"
            title="LLM Consensus"
            description="Upon event maturity, GenLayer LLM consensus processes web sources and splits the pot pro-rata among winning outcomes."
          />
        </div>
      </div>
    </section>
  );
}
