interface CustomCanvasRenderingContext2D extends CanvasRenderingContext2D {
  roundRect: (
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) => void;
}

export const calculateBarData = (
  frequencyData: Uint8Array,
  width: number,
  barWidth: number,
  gap: number
): number[] => {
  const units = Math.floor(width / (barWidth + gap));
  const data: number[] = [];

  if (units <= frequencyData.length) {
    // Average frequency bins into bars
    const step = Math.floor(frequencyData.length / units);
    for (let i = 0; i < units; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < step && i * step + j < frequencyData.length; j++) {
        sum += frequencyData[i * step + j];
        count++;
      }
      data.push(count > 0 ? sum / count : 0);
    }
  } else {
    // Not enough frequency bins: interpolate or repeat
    for (let i = 0; i < units; i++) {
      // Map each bar to the closest frequency bin
      const idx = Math.floor((i / units) * frequencyData.length);
      data.push(frequencyData[idx] || 0);
    }
  }
  return data;
};

export const draw = (
  data: number[],
  canvas: HTMLCanvasElement,
  barWidth: number,
  gap: number,
  backgroundColor: string,
  barColor: string
): void => {
  const amp = canvas.height / 2;

  const ctx = canvas.getContext("2d") as CustomCanvasRenderingContext2D;
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (backgroundColor !== "transparent") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  data.forEach((dp, i) => {
    ctx.fillStyle = barColor;

    const x = i * (barWidth + gap);
    const y = amp - dp / 2;
    const w = barWidth;
    const h = dp || 1;

    ctx.beginPath();
    if (ctx.roundRect) {
      // making sure roundRect is supported by the browser
      ctx.roundRect(x, y, w, h, 50);
      ctx.fill();
    } else {
      // fallback for browsers that do not support roundRect
      ctx.fillRect(x, y, w, h);
    }
  });
};

/**
 * Converts a Float32Array[] (PCM chunks) to frequency data using Web Audio API.
 * Returns a Promise that resolves to a Uint8Array of frequency data.
 */
export async function pcmChunksToFrequencyData(
  pcmChunks: Float32Array[],
  sampleRate = 48000,
  fftSize = 2048
): Promise<Uint8Array> {
  // Merge all chunks into one Float32Array
  const totalLength = pcmChunks.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of pcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Create OfflineAudioContext to process the PCM data
  const offlineCtx = new OfflineAudioContext(1, merged.length, sampleRate);
  const buffer = offlineCtx.createBuffer(1, merged.length, sampleRate);
  buffer.copyToChannel(merged, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = fftSize;

  source.connect(analyser);
  analyser.connect(offlineCtx.destination);

  source.start();
  await offlineCtx.startRendering();

  // Get frequency data
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freqData);
  return freqData;
}