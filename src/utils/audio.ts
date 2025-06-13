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

export const encodeToWav = (
  samples: Float32Array,
  sampleRate: number = 16000
) => {
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

// Helper function to encode WAV from an AudioBuffer
export const encodeToWavBuffer = (
  audioBuffer: AudioBuffer,
  numChannels = 1,
  targetSampleRate = 16000
) => {
  const length = audioBuffer.length * numChannels * 2 + 44; // 16-bit PCM + WAV header

  //creates an empty array buffer
  const wavBuffer = new ArrayBuffer(length);

  //Utlize DataView to help in populating the empty ArrayBuffer
  const view = new DataView(wavBuffer);

  //Inputting WAV file header
  writeString(view, 0, "RIFF"); //WAV file indicator
  view.setUint32(4, 36 + audioBuffer.length * numChannels * 2, true);
  writeString(view, 8, "WAVE"); //WAVE format indicator
  writeString(view, 12, "fmt "); //Start of format chunk
  view.setUint32(16, 16, true); //Format chunk size
  view.setUint16(20, 1, true); // Specifies PCM audio (uncompressed)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * numChannels * 2, true); //byte rate
  view.setUint16(32, numChannels * 2, true); //bytes per sample across all channels
  view.setUint16(34, 16, true); //bits per sample
  writeString(view, 36, "data"); //Start of data chunk
  view.setUint32(40, audioBuffer.length * numChannels * 2, true); //audio data size in bytes

  // Create a separate buffer for raw L16 data
  const l16Buffer = new Int16Array(audioBuffer.length * numChannels);

  //Inputting PCM audio data
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = audioBuffer.getChannelData(channel)[i];
      const clampedSample = Math.max(-1, Math.min(1, sample));

      //convert to 16 bit integer
      const int16Sample =
        clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff;

      // Add to WAV buffer
      view.setInt16(offset, int16Sample, true);
      offset += 2;

      // Add to L16 buffer
      l16Buffer[i * numChannels + channel] = int16Sample;
    }
  }

  return { wavBuffer, l16Buffer };
};

export const convertWebmToWav = async (
  webmBlob: Blob,
  numChannels = 1,
  targetSampleRate = 16000
) => {
  //Convert WebM blob as an ArrayBuffer
  const arrayBuffer = await webmBlob.arrayBuffer();

  // Decode the audio data using AudioContext
  const audioContext = new AudioContext({ sampleRate: targetSampleRate });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Encode the audio buffer into a WAV file
  const { wavBuffer, l16Buffer } = encodeToWavBuffer(
    audioBuffer,
    numChannels,
    targetSampleRate
  );

  await audioContext.close();

  return {
    wavBlob: new Blob([wavBuffer], { type: "audio/wav" }),
    l16Blob: new Blob([l16Buffer], { type: "audio/l16" }),
  };
};

export const downsample = (
  buffer: Float32Array,
  inputSampleRate: number = 48000,
  outputSampleRate: number = 16000
) => {
  if (outputSampleRate >= inputSampleRate) {
    throw new Error("Output sample rate must be lower than input sample rate.");
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.floor(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0,
      count = 0;

    for (
      let i = Math.round(offsetBuffer);
      i < nextOffsetBuffer && i < buffer.length;
      i++
    ) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

// Function to play processed audio from an ArrayBuffer used to pass on the mediaRecorder stream for visualization.
// Might be heavy not sure will test on an actual app later on
export const bufferToStream = (
  buffer: ArrayBuffer,
  audioContext: AudioContext,
  mediaStreamDestination: MediaStreamAudioDestinationNode
) => {
  if (!audioContext) return;
  // Convert the ArrayBuffer to a Float32Array
  const floatData = new Float32Array(buffer);

  // Create an AudioBuffer with 1 channel, matching the length and sample rate
  const audioBuffer = audioContext.createBuffer(
    1,
    floatData.length,
    audioContext.sampleRate
  );

  // Copy the float data into the AudioBuffer's channel
  audioBuffer.copyToChannel(floatData, 0);

  // Create a buffer source node
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  // Connect the source to both the destination and the media stream destination
  source.connect(mediaStreamDestination);

  // Start playback
  source.start();

  source.onended = () => {
    source.disconnect();
    // Remove any additional references to the source node here
  };
};

/**
 * Downsamples a single Float32Array chunk from inputSampleRate to outputSampleRate.
 * Example: downSampleChunk(chunk, 48000, 16000) // chunk.length = 480 -> returns Float32Array(160)
 */
export const downSampleChunk = (
  chunk: Float32Array,
  inputSampleRate: number = 48000,
  outputSampleRate: number = 16000
) => {
  if (outputSampleRate >= inputSampleRate) {
    throw new Error("Output sample rate must be lower than input sample rate.");
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.floor(chunk.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * sampleRateRatio);
    const end = Math.floor((i + 1) * sampleRateRatio);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < chunk.length; j++) {
      sum += chunk[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : 0;
  }
  return result;
}
