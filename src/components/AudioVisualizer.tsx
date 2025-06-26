import React, { useEffect, useRef } from "react";

export interface AudioVisualizerProps {
  /** PCM chunks to visualize (Float32Array[]) */
  pcmChunks: Float32Array[];
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  barColor?: string;
  barWidth?: number;
  gap?: number;
}

// Exponential sensitivity constant
const EXP_K = 15;
// Minimum height for bars to ensure visibility
const MIN_BAR_HEIGHT = 3.2;
// Default smoothing factor
const SMOOTHING = 0.4;

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  pcmChunks,
  width = "100%",
  height = "100px",
  backgroundColor = "transparent",
  barColor = "green",
  barWidth = 3.2,
  gap = 3.2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const barHeightsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    canvas.width = cw;
    canvas.height = ch;

    const totalBarSpace = barWidth + gap;
    const maxBars = Math.floor(cw / totalBarSpace);
    barHeightsRef.current = new Array(maxBars).fill(MIN_BAR_HEIGHT);

    const render = () => {
      const data = pcmChunks?.length ? pcmChunks[pcmChunks.length - 1] : null;
      const len = data?.length ?? 0;

      // Clear and background
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, cw, ch);

      for (let i = 0; i < maxBars; i++) {
        let rawAmp = 0;
        if (data && len > 0) {
          const frac = i / (maxBars - 1);
          const idx = Math.floor(frac * (len - 1));
          rawAmp = Math.abs(data[idx] || 0);
        }
        // Exponential boost
        const boosted = 1 - Math.exp(-EXP_K * rawAmp);
        const targetHeight = Math.max(boosted * ch, MIN_BAR_HEIGHT);
        const current = barHeightsRef.current[i] || MIN_BAR_HEIGHT;
        barHeightsRef.current[i] =
          current + (targetHeight - current) * SMOOTHING;

        // Draw each bar
        const h = barHeightsRef.current[i];
        const x = i * totalBarSpace;
        const y = (ch - h) / 2;
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, barWidth, h);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [backgroundColor, barColor, barWidth, gap]);

  return <canvas ref={canvasRef} style={{ width, height, display: "block" }} />;
};
