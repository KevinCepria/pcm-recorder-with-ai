import { Mp3Encoder } from "@breezystack/lamejs";

export const encodeToMp3 = (
  samples: Float32Array,
  sampleRate: number,
  bitrate: number = 320
) => {
  const channels = 1; // mono
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate);
  const sampleBlockSize = 1152; // standard block size for MP3
  const mp3Data: Uint8Array[] = [];

  const pcmInt16Data = float32ToInt16(samples);

  for (let i = 0; i < pcmInt16Data.length; i += sampleBlockSize) {
    const sampleChunk = pcmInt16Data.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }
  const mp3buf = encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf));
  }
  return new Blob(mp3Data, { type: "audio/mp3" });
};

export const encodeToWav = (samples: Float32Array, sampleRate: number) => {
  const numChannels = 1; // mono
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const bufferLength = 44 + samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // Write WAV header.
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // Audio format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
};

export const mergeChunks = (chunks: Float32Array[]) => {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
};

function float32ToInt16(buffer: Float32Array): Int16Array {
  const l = buffer.length;
  const int16Buffer = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp the value between -1 and 1, then scale it to the range of int16.
    let s = Math.max(-1, Math.min(1, buffer[i]));
    int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
