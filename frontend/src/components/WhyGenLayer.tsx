'use client';

import React, { useState } from 'react';
import { ExternalLink, ShieldCheck, Network, Cpu } from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface StepCardProps {
  index: number;
  icon: React.ReactNode;
  stepLabel: string;
  title: string;
  description: string;
  gradientClass: string;
  isActive: boolean;
  onClick: () => void;
  isVisible: boolean;
}

function StepCard({ index, icon, stepLabel, title, description, gradientClass, isActive, onClick, isVisible }: StepCardProps) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center gap-6 p-8 bg-charcoal-medium/20 border text-left w-full cursor-pointer transition-all duration-300 rounded-2xl select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50 ${
        isActive 
          ? 'border-charcoal-light/60 opacity-100' 
          : 'border-charcoal-light/25 opacity-65 hover:opacity-85 hover:bg-charcoal-medium/30'
      } ${isVisible ? 'animate-fade-in-up' : 'opacity-0'}`}
      style={
        isVisible
          ? {
              animationDelay: `${index * 150}ms`,
              animationFillMode: 'both',
            }
          : {}
      }
    >
      {/* Subtle border beam - only visible/rotating on active step */}
      {isActive && (
        <div
          className="border-beam-container"
          style={{
            '--border-beam-width': '1.2px',
            '--border-beam-duration': '16s',
            '--border-beam-dark-opacity': '0.15',
            '--border-beam-light-opacity': '0.08',
          } as React.CSSProperties}
        />
      )}

      {/* Left side: Icon and Step Label */}
      <div className="flex sm:flex-col items-center sm:items-start gap-4 sm:gap-2 shrink-0 select-none z-10 relative">
        <div className="p-3 bg-charcoal-medium dark:bg-charcoal-dark border border-charcoal-light/35 rounded-xl text-foreground/80">
          {icon}
        </div>
        <span className={`text-[10px] font-bold tracking-widest uppercase font-display shrink-0 ${gradientClass}`}>
          {stepLabel}
        </span>
      </div>

      {/* Divider on desktop */}
      <div className="hidden sm:block w-[1px] self-stretch bg-charcoal-light/20 my-2 shrink-0 z-10" />

      {/* Right side: Title and Description */}
      <div className="flex-1 text-left z-10">
        <h3 className="text-lg font-bold font-display text-foreground tracking-tight mb-2">
          {title}
        </h3>
        <p className="text-sm text-foreground/60 dark:text-foreground/50 leading-relaxed font-normal tracking-wide">
          {description}
        </p>
      </div>
    </button>
  );
}

export default function WhyGenLayer() {
  const [sectionRef, isVisible] = useScrollReveal();
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section
      ref={sectionRef}
      className="w-full max-w-5xl mx-auto px-6 sm:px-8 py-24 md:py-32 border-t border-charcoal-light/25 flex flex-col items-center relative z-20"
    >
      {/* Scannable Header Section */}
      <div
        className={`text-center mb-16 transition-all duration-1000 ${
          isVisible ? 'animate-fade-in-up' : 'opacity-0'
        }`}
        style={isVisible ? { animationDelay: '0ms', animationFillMode: 'both' } : {}}
      >
        <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground mb-6">
          Why GenLayer?
        </h2>
        
        <div className="max-w-3xl mx-auto space-y-6 mb-8">
          <p className="text-lg sm:text-xl font-display font-semibold text-foreground/90 leading-snug">
            Trustless resolution of real-world outcomes requires natural-language judgment.
          </p>
          <p className="text-sm sm:text-base text-foreground/50 max-w-2xl mx-auto font-light leading-relaxed">
            Solidity contracts cannot parse web sources directly. GenLayer runs LLMs in consensus for a <strong className="font-semibold text-foreground">trustless</strong> resolution with <strong className="font-semibold text-foreground">no centralized oracle</strong> and <strong className="font-semibold text-foreground">no single point of trust</strong>.
          </p>
        </div>

        <a
          href="https://docs.genlayer.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-wide text-brand-gold hover:text-brand-magenta transition-all duration-300 cursor-pointer"
        >
          <span>Read the protocol docs</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Stack of Three Step Cards */}
      <div
        className={`relative flex flex-col gap-6 w-full max-w-3xl transition-all duration-1000 ${
          isVisible ? 'animate-fade-in-up' : 'opacity-0'
        }`}
        style={isVisible ? { animationDelay: '200ms', animationFillMode: 'both' } : {}}
      >
        {/* Subtle, thin understated vertical timeline line running down the centers of the icons */}
        <div className="absolute left-[54px] top-12 bottom-12 w-[1px] bg-charcoal-light/15 z-0 pointer-events-none hidden sm:block" />

        <StepCard
          index={0}
          icon={<ShieldCheck className="w-5 h-5" />}
          stepLabel="Step 01"
          title="Smart Contract"
          description="Secures event stakes and registers the outcome terms and public data sources immutably on-chain."
          gradientClass="text-[#c9a227]"
          isActive={activeStep === 0}
          onClick={() => setActiveStep(0)}
          isVisible={isVisible}
        />

        <StepCard
          index={1}
          icon={<Network className="w-5 h-5" />}
          stepLabel="Step 02"
          title="Validators"
          description="Decentralized node network queries and parses the objective public web sources defined for the event."
          gradientClass="bg-gradient-to-r from-[#c9a227] to-[#b23a6e] bg-clip-text text-transparent"
          isActive={activeStep === 1}
          onClick={() => setActiveStep(1)}
          isVisible={isVisible}
        />

        <StepCard
          index={2}
          icon={<Cpu className="w-5 h-5" />}
          stepLabel="Step 03"
          title="LLM Consensus"
          description="Validator consensus processes the natural-language queries and settles the event terms with no centralized arbiter."
          gradientClass="text-[#b23a6e]"
          isActive={activeStep === 2}
          onClick={() => setActiveStep(2)}
          isVisible={isVisible}
        />
      </div>
    </section>
  );
}
