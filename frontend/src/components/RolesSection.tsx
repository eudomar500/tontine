'use client';

import React from 'react';
import { FilePlus, Coins, Gavel } from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface RoleCardProps {
  index: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  isVisible: boolean;
}

function RoleCard({ index, icon, title, description, badge, isVisible }: RoleCardProps) {
  return (
    <div
      className={`relative flex flex-col h-full text-left p-8 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl select-none overflow-hidden transition-all duration-1000 ${
        isVisible ? 'animate-fade-in-up' : 'opacity-0'
      }`}
      style={
        isVisible
          ? {
              animationDelay: `${index * 150}ms`,
              animationFillMode: 'both',
            }
          : {}
      }
    >
      {/* Subtle border beam with slow rotation and low opacity to avoid clashing with visual text highlights */}
      <div
        className="border-beam-container"
        style={{
          '--border-beam-width': '1.2px',
          '--border-beam-duration': '16s',
          '--border-beam-dark-opacity': '0.15',
          '--border-beam-light-opacity': '0.08',
        } as React.CSSProperties}
      />

      <div className="flex items-center justify-between mb-6">
        <div className="p-3 bg-charcoal-light/20 rounded-xl text-foreground/80">
          {icon}
        </div>
        {badge && (
          <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-[#9FFF3C]/10 text-[#9FFF3C] border border-[#9FFF3C]/20 rounded-full">
            {badge}
          </span>
        )}
      </div>

      <h3 className="text-lg sm:text-xl font-bold font-display text-foreground tracking-tight mb-4">
        {title}
      </h3>
      
      <p className="text-sm text-foreground/60 dark:text-foreground/50 leading-relaxed font-normal tracking-wide flex-1">
        {description}
      </p>
    </div>
  );
}

export default function RolesSection() {
  const [sectionRef, isVisible] = useScrollReveal();

  return (
    <section
      ref={sectionRef}
      className="w-full max-w-5xl mx-auto px-6 sm:px-8 py-24 md:py-32 flex flex-col items-center relative z-20"
    >
      <div
        className={`text-center mb-16 transition-all duration-1000 ${
          isVisible ? 'animate-fade-in-up' : 'opacity-0'
        }`}
        style={isVisible ? { animationDelay: '0ms', animationFillMode: 'both' } : {}}
      >
        <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground mb-4">
          How Tontine works
        </h2>
        <p className="text-sm sm:text-base text-foreground/50 max-w-xl mx-auto font-light leading-relaxed">
          A peer-to-peer agreement structure powered by GenLayer's natural language execution and decentralized consensus.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        <RoleCard
          index={0}
          icon={<FilePlus className="w-5 h-5" />}
          title="Create"
          description="Anyone can create a prediction event or a 1v1 duel. Define the natural language outcome options, set trusted public web sources, and pay only a fixed creation fee."
          isVisible={isVisible}
        />

        <RoleCard
          index={1}
          icon={<Coins className="w-5 h-5" />}
          title="Participate"
          description="Participants join an event by staking on an outcome. Pari-mutuel with no rake: the entire pot is split among winners, with zero commission taken by the platform."
          badge="No Rake"
          isVisible={isVisible}
        />

        <RoleCard
          index={2}
          icon={<Gavel className="w-5 h-5" />}
          title="Resolve"
          description="At event maturity, GenLayer LLM consensus processes the defined public web sources to resolve the outcome. Decentralized validator consensus acts as the arbiter with no centralized oracle."
          isVisible={isVisible}
        />
      </div>
    </section>
  );
}
