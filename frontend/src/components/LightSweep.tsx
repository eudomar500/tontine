'use client';

import React, { useEffect, useRef } from 'react';
import { useThemeStore } from '../store/theme';

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  size: number;
  color: string;
  baseAlpha: number;
  phase: number;
  flickerSpeed: number;
}

export default function LightSweep() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    let waveX = -200;

    const getThemeColors = () => {
      if (theme === 'dark') {
        return ['#E0383A', '#F2C94C', '#E0833A'];
      }
      return ['#3A6EB2', '#B23A6E', '#0b0b0c'];
    };

    const colors = getThemeColors();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      init();
    };

    const init = () => {
      particles = [];
      const w = canvas.width;
      const h = canvas.height;

      const isMobile = w < 768;
      const cols = isMobile ? 16 : 28;
      const rows = isMobile ? 8 : 14;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = w * 0.05 + (c / (cols - 1)) * w * 0.9;
          const y = h * 0.08 + (r / (rows - 1)) * h * 0.84;
          
          const size = Math.random() * 0.8 + 1.2;
          const color = colors[(c + r) % colors.length];
          const baseAlpha = 0.20;
          const phase = Math.random() * Math.PI * 2;
          const flickerSpeed = Math.random() * 0.08 + 0.05;

          particles.push({
            x,
            y,
            originX: x,
            originY: y,
            size,
            color,
            baseAlpha,
            phase,
            flickerSpeed,
          });
        }
      }
      
      waveX = -w * 0.25;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -1000;
      mouseRef.current.y = -1000;
    };

    let supportsHover = false;
    if (typeof window !== 'undefined') {
      supportsHover = window.matchMedia('(hover: hover)').matches;
    }

    const parent = canvas.parentElement;
    if (parent && supportsHover) {
      parent.addEventListener('mousemove', handleMouseMove);
      parent.addEventListener('mouseleave', handleMouseLeave);
    }

    window.addEventListener('resize', resize);
    resize();

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      const waveWidth = w * 0.22;
      const speed = isNaN(w) || w === 0 ? 1.5 : (w / 350) + 1.0;
      const interactionRadius = 90;

      waveX += speed;
      if (waveX > w + waveWidth) {
        waveX = -waveWidth;
      }

      const mouse = mouseRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.phase += p.flickerSpeed;

        if (mouse.active) {
          const dx = p.originX - mouse.x;
          const dy = p.originY - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < interactionRadius) {
            const force = (interactionRadius - dist) / interactionRadius;
            const angle = Math.atan2(dy, dx);
            
            const targetX = p.originX + Math.cos(angle) * force * 28;
            const targetY = p.originY + Math.sin(angle) * force * 28;

            p.x += (targetX - p.x) * 0.12;
            p.y += (targetY - p.y) * 0.12;
          } else {
            p.x += (p.originX - p.x) * 0.08;
            p.y += (p.originY - p.y) * 0.08;
          }
        } else {
          p.x += (p.originX - p.x) * 0.08;
          p.y += (p.originY - p.y) * 0.08;
        }

        const distance = Math.abs(p.originX - waveX);
        let factor = 0;
        if (distance < waveWidth) {
          const rawFactor = 1 - (distance / waveWidth);
          factor = rawFactor * rawFactor * (3 - 2 * rawFactor);
        }

        const sparkle = Math.sin(p.phase) * Math.cos(p.phase * 1.7);
        
        const alpha = p.baseAlpha * (0.85 + sparkle * 0.15) + factor * (0.95 - p.baseAlpha) * (0.7 + sparkle * 0.3);
        const radius = p.size * (1 + factor * 0.2) * (0.85 + sparkle * 0.15);

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.35;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }

      animationId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      if (parent && supportsHover) {
        parent.removeEventListener('mousemove', handleMouseMove);
        parent.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-90 transition-opacity duration-500"
    />
  );
}
