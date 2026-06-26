'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-charcoal-light/30 bg-charcoal-dark/30 py-16 md:py-24 px-8 md:px-12 relative z-20">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Brand Information */}
        <div className="md:col-span-6 flex flex-col items-start text-left">
          <div className="mb-6 select-none">
            <Image
              src="/logo-gradient.svg"
              alt="tontine"
              width={120}
              height={30}
              className="w-28 h-auto object-contain"
            />
          </div>
          <p className="text-xs sm:text-sm text-foreground/50 max-w-sm leading-relaxed font-light mb-6">
            Private peer-to-peer prediction events on GenLayer, resolved by decentralized LLM consensus.
          </p>
          <div className="text-xs text-foreground/40 font-medium tracking-wide flex items-center select-none">
            <span>by</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#9FFF3C] mx-1.5" />
            <span>islandlabs</span>
          </div>
        </div>

        {/* Navigation Links Columns */}
        <div className="md:col-span-6 grid grid-cols-2 gap-8 text-left">
          {/* Product links */}
          <div className="flex flex-col gap-3.5">
            <h5 className="text-[10px] font-bold tracking-widest text-foreground uppercase font-display select-none">
              Product
            </h5>
            <ul className="flex flex-col gap-2.5 text-xs text-foreground/50">
              <li>
                <Link
                  href="/explore"
                  className="hover:text-foreground transition-colors duration-200 font-normal tracking-wide"
                >
                  Explore Events
                </Link>
              </li>
              <li>
                <Link
                  href="/explore"
                  className="hover:text-foreground transition-colors duration-200 font-normal tracking-wide"
                >
                  Create Event
                </Link>
              </li>
              <li>
                <Link
                  href="/explore"
                  className="hover:text-foreground transition-colors duration-200 font-normal tracking-wide"
                >
                  Create Duel
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources links */}
          <div className="flex flex-col gap-3.5">
            <h5 className="text-[10px] font-bold tracking-widest text-foreground uppercase font-display select-none">
              Resources
            </h5>
            <ul className="flex flex-col gap-2.5 text-xs text-foreground/50">
              <li>
                <a
                  href="https://github.com/tontinelabs/tontine/blob/main/docs/resolution.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors duration-200 font-normal tracking-wide"
                >
                  Docs
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/tontinelabs/tontine"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors duration-200 font-normal tracking-wide"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://docs.genlayer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors duration-200 font-normal tracking-wide"
                >
                  GenLayer
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright Line */}
      <div className="max-w-7xl mx-auto border-t border-charcoal-light/10 mt-12 pt-8 flex items-center justify-between text-left">
        <p className="text-[10px] text-foreground/45 tracking-wider font-light">
          &copy; {currentYear} tontine. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
