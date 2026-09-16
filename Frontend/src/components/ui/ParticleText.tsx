import React, { useEffect, useRef } from 'react';

export interface ParticleTextProps {
  text: string;
  particleSize?: number;
  density?: number;
  color?: string;
  highlightColor?: string;
  scatter?: number;
  gatherDuration?: number;
  stagger?: number;
  pointerRepel?: number;
  repelRadius?: number;
  idleDrift?: number;
  trigger?: 'hover' | 'auto' | 'click';
  fontSize?: string;
  fontWeight?: number | string;
  fontFamily?: string;
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface Particle {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  delay: number;
  size: number;
  color: string;
  isHighlight: boolean;
  phase: number;
}

export const ParticleText: React.FC<ParticleTextProps> = ({
  text = 'AureliaX',
  particleSize = 2.2,
  density = 4,
  color = '#f8fafc',
  highlightColor = '#8b5cf6',
  scatter = 160,
  gatherDuration = 1600,
  stagger = 420,
  pointerRepel = 42,
  repelRadius = 120,
  idleDrift = 0.8,
  trigger = 'hover',
  fontSize = 'clamp(3.5rem, 13vw, 9rem)',
  fontWeight = 800,
  fontFamily = 'inherit',
  glow = true,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    let animationStartTime = performance.now();
    let isForming = true;

    // Mouse coordinates relative to canvas
    let mouse = {
      x: -9999,
      y: -9999,
      isHovered: false,
    };

    // Calculate computed font size in pixels from container & CSS string
    const resolveFontSize = () => {
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.fontSize = fontSize;
      tempDiv.style.fontFamily = fontFamily === 'inherit' ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : fontFamily;
      tempDiv.style.fontWeight = String(fontWeight);
      container.appendChild(tempDiv);
      const computed = window.getComputedStyle(tempDiv).fontSize;
      container.removeChild(tempDiv);
      return parseFloat(computed) || 80;
    };

    const initParticles = () => {
      const rect = container.getBoundingClientRect();
      const w = (canvas.width = rect.width);
      const h = (canvas.height = rect.height);

      if (w === 0 || h === 0) return;

      const fSize = resolveFontSize();
      const actualFontFamily = fontFamily === 'inherit' ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : fontFamily;

      // Offscreen canvas to sample text pixels
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) return;

      offCtx.fillStyle = '#ffffff';
      offCtx.textAlign = 'center';
      offCtx.textBaseline = 'middle';
      offCtx.font = `${fontWeight} ${fSize}px ${actualFontFamily}`;
      offCtx.fillText(text, w / 2, h / 2);

      const imgData = offCtx.getImageData(0, 0, w, h);
      const data = imgData.data;

      particles = [];
      animationStartTime = performance.now();
      isForming = true;

      const step = Math.max(2, Math.floor(density));

      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const index = (y * w + x) * 4;
          const alpha = data[index + 3];

          if (alpha > 128) {
            // Random angle and distance for scatter explosion
            const angle = Math.random() * Math.PI * 2;
            const dist = (Math.random() * 0.7 + 0.3) * scatter * 1.5;

            const startX = x + Math.cos(angle) * dist;
            const startY = y + Math.sin(angle) * dist;

            // Optional stagger delay across letters from left to right
            const progressRatio = x / w;
            const delay = progressRatio * stagger + Math.random() * (stagger * 0.4);

            const isHighlight = Math.random() < 0.24;

            particles.push({
              originX: x,
              originY: y,
              currentX: startX,
              currentY: startY,
              startX,
              startY,
              vx: 0,
              vy: 0,
              delay,
              size: particleSize * (0.8 + Math.random() * 0.45),
              color: isHighlight ? highlightColor : color,
              isHighlight,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
      }
    };

    initParticles();

    // Trigger scatter / re-gather
    const scatterAndGather = () => {
      animationStartTime = performance.now();
      isForming = true;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const angle = Math.random() * Math.PI * 2;
        const dist = (Math.random() * 0.7 + 0.3) * scatter * 1.2;
        p.startX = p.currentX + Math.cos(angle) * dist;
        p.startY = p.currentY + Math.sin(angle) * dist;
        p.currentX = p.startX;
        p.currentY = p.startY;
      }
    };

    // Mouse handlers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.isHovered = true;
    };

    const handleMouseEnter = () => {
      mouse.isHovered = true;
      if (trigger === 'hover') {
        scatterAndGather();
      }
    };

    const handleMouseLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.isHovered = false;
    };

    const handleClick = () => {
      if (trigger === 'click') {
        scatterAndGather();
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('click', handleClick);

    const handleResize = () => {
      initParticles();
    };

    window.addEventListener('resize', handleResize);

    // Easing helper: cubic ease out
    const easeOutCubic = (t: number) => {
      return 1 - Math.pow(1 - t, 3);
    };

    // Render loop
    const render = (now: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const elapsed = now - animationStartTime;
      let allSettled = true;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Gather animation logic with individual stagger delay
        if (isForming) {
          const particleTime = elapsed - p.delay;
          if (particleTime > 0) {
            const progress = Math.min(1, particleTime / gatherDuration);
            const eased = easeOutCubic(progress);

            p.currentX = p.startX + (p.originX - p.startX) * eased;
            p.currentY = p.startY + (p.originY - p.startY) * eased;

            if (progress < 1) {
              allSettled = false;
            }
          } else {
            allSettled = false;
          }
        }

        // Idle drift when formed
        if (allSettled || !isForming) {
          const driftX = Math.cos(now * 0.002 + p.phase) * (idleDrift * 0.6);
          const driftY = Math.sin(now * 0.0025 + p.phase) * (idleDrift * 0.6);

          // Pointer repel physics
          if (mouse.isHovered) {
            const dx = p.currentX - mouse.x;
            const dy = p.currentY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < repelRadius && dist > 0) {
              const force = (1 - dist / repelRadius) * pointerRepel;
              const angle = Math.atan2(dy, dx);
              p.vx += Math.cos(angle) * force * 0.12;
              p.vy += Math.sin(angle) * force * 0.12;
            }
          }

          // Apply velocity and spring-back to origin
          p.vx *= 0.88; // Damping
          p.vy *= 0.88;

          p.currentX += p.vx;
          p.currentY += p.vy;

          // Spring return to origin with idle drift
          const targetX = p.originX + driftX;
          const targetY = p.originY + driftY;
          p.currentX += (targetX - p.currentX) * 0.08;
          p.currentY += (targetY - p.currentY) * 0.08;
        }

        // Render particle
        ctx.beginPath();
        ctx.arc(p.currentX, p.currentY, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;

        if (glow && p.isHighlight) {
          ctx.shadowColor = highlightColor;
          ctx.shadowBlur = 8;
        } else if (glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 4;
        }

        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (allSettled && isForming) {
        isForming = false;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
    };
  }, [
    text,
    particleSize,
    density,
    color,
    highlightColor,
    scatter,
    gatherDuration,
    stagger,
    pointerRepel,
    repelRadius,
    idleDrift,
    trigger,
    fontSize,
    fontWeight,
    fontFamily,
    glow,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: 'pointer',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default ParticleText;
