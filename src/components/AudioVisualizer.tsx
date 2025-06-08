import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import { calculateBarData, draw, pcmChunksToFrequencyData } from "../utils/audioVisualizer";

export interface AudioVisualizerProps {
  /**
   * PCM chunks to visualize (Float32Array[])
   */
  pcmChunks: React.RefObject<Float32Array[]>;
  width?: number | string;
  height?: number | string;
  barWidth?: number;
  gap?: number;
  backgroundColor?: string;
  barColor?: string;
  fftSize?: 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768;
  sampleRate?: number;
}

const AudioVisualizer = ({
  pcmChunks,
  width = 500,
  height = 75,
  barWidth = 2,
  gap = 1,
  backgroundColor = "transparent",
  barColor = "rgb(160, 198, 255)",
  fftSize = 1024, // reduced from 1024 to 256 for faster fill
  sampleRate =  48000,
}: AudioVisualizerProps) => {
  // Ensure width/height are numbers for canvas
  const canvasWidth = typeof width === "number" ? width : parseInt(width as string, 10) || 500;
  const canvasHeight = typeof height === "number" ? height : parseInt(height as string, 10) || 75;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const renderFrame = useCallback(async () => {
    if (!canvasRef.current) {
      animationRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    if (pcmChunks.current?.length) {
      const freqData = await pcmChunksToFrequencyData(pcmChunks.current, sampleRate, fftSize);
      const dataPoints = calculateBarData(
        freqData,
        canvasWidth,
        barWidth,
        gap
      );
      draw(
        dataPoints,
        canvasRef.current,
        barWidth,
        gap,
        backgroundColor,
        barColor
      );
    } else {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    animationRef.current = requestAnimationFrame(renderFrame);
  }, [pcmChunks, barWidth, gap, backgroundColor, barColor, fftSize, sampleRate, canvasWidth]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [renderFrame]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{ aspectRatio: "unset", width: canvasWidth, height: canvasHeight }}
    />
  );
};

export { AudioVisualizer };