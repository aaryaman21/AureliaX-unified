import React, { useEffect, useRef } from 'react';
import styles from './NeuralBrainCanvas.module.css';

interface Node3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  projX: number;
  projY: number;
  projScale: number;
  radius: number;
  pulsePhase: number;
  color: string;
  ringIndex: number;
  isEquator: boolean;
}

// Returns a colour palette tuned for the current theme
const getPalette = () => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return isLight
    ? {
        // Deep royal blue gives the daylight workspace a crisp, architectural core.
        wire:         '30, 64, 175',
        equatorNode:  '#172554',
        ringNodeA:    '#1d4ed8',
        ringNodeB:    '#2563eb',
        bgClear:      'rgba(186,230,253,0)',
      }
    : {
        // A luminous gold core stands out cleanly on the midnight dashboard.
        wire:         '255, 194, 70',
        equatorNode:  '#fff7cf',
        ringNodeA:    '#eabf55',
        ringNodeB:    '#ffd166',
        bgClear:      'rgba(0,0,0,0)',
      };
};

export const NeuralBrainCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      buildSonicGlobe();
    };

    window.addEventListener('resize', handleResize);

    let nodes: Node3D[] = [];
    // Build a planet-like neural surface from latitude rings. Keeping the nodes
    // on a sphere gives the scene depth as it turns without introducing a cube.
    const buildSonicGlobe = () => {
      nodes = [];

      const radius = Math.min(width * 0.255, height * 0.375, 320);
      const latitudes = 11;
      const columns = 18;

      for (let ring = 0; ring < latitudes; ring++) {
        const latitude = -Math.PI / 2 + (ring / (latitudes - 1)) * Math.PI;
        const ringRadius = Math.cos(latitude) * radius;
        const y = Math.sin(latitude) * radius;
        const points = ring === 0 || ring === latitudes - 1 ? 1 : columns;
        for (let point = 0; point < points; point++) {
          const longitude = points === 1 ? 0 : (point / points) * Math.PI * 2 + (ring % 2) * 0.11;
          const x = Math.cos(longitude) * ringRadius;
          const z = Math.sin(longitude) * ringRadius;
          const isEquator = ring === Math.floor(latitudes / 2);
          nodes.push({
            x,
            y,
            z,
            baseX: x,
            baseY: y,
            baseZ: z,
            projX: 0,
            projY: 0,
            projScale: 1,
            radius: isEquator ? 2.3 : 1.65,
            pulsePhase: ring * 0.73 + point * 0.41,
            color: point % 2 ? getPalette().ringNodeA : getPalette().ringNodeB,
            ringIndex: ring,
            isEquator,
          });
        }
      }
    };

    buildSonicGlobe();

    let angleY = 0;
    const angleX = 0.28;
    let time = 0;

    const render = () => {
      time += 0.015;
      angleY += 0.0018;

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height * 0.47;
      const fov = 850;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const pal = getPalette();

      // Let the globe breathe very slightly while retaining its spherical form.
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const waveFactor = 1 + Math.sin(time * 1.7 + n.pulsePhase) * 0.018;
        n.x = n.baseX * waveFactor;
        n.y = n.baseY * waveFactor;
        n.z = n.baseZ * waveFactor;

        // Rotate Y
        const x1 = n.x * cosY + n.z * sinY;
        const z1 = -n.x * sinY + n.z * cosY;
        // Rotate X
        const y2 = n.y * cosX - z1 * sinX;
        const z2 = n.y * sinX + z1 * cosX;
        // Project
        const scale = fov / (fov + z2 + 100);
        n.projX = centerX + x1 * scale;
        n.projY = centerY + y2 * scale;
        n.projScale = scale;
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const scale = n.projScale;
        const depthAlpha = Math.max(0.18, Math.min(0.98, (scale - 0.60) * 2.1));
        const pulse = Math.sin(time * 2 + n.pulsePhase) * 0.35 + 0.65;
        const nodeRadius = n.radius * scale;

        // Outer glow
        ctx.beginPath();
        ctx.arc(n.projX, n.projY, nodeRadius * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pal.wire}, ${depthAlpha * pulse * 0.48})`;
        ctx.fill();

        // Core beacon
        ctx.beginPath();
        ctx.arc(n.projX, n.projY, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = n.isEquator
          ? `rgba(${pal.wire}, ${depthAlpha * pulse})`
          : `${n.color}${Math.round(depthAlpha * pulse * 255).toString(16).padStart(2, '0')}`;
        ctx.shadowColor = `rgb(${pal.wire})`;
        ctx.shadowBlur = (n.isEquator ? 18 : 11) * scale;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Re-apply node colours when theme changes
    const observer = new MutationObserver(() => buildSonicGlobe());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.brainCanvas} />;
};

export default NeuralBrainCanvas;
