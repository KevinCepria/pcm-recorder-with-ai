// Minimal Float32RingBuffer for audio worklet
class Float32RingBuffer {
  constructor(length) {
    this.buffer = new Float32Array(length);
    this.size = length;
    this.readPtr = 0;
    this.writePtr = 0;
    this.count = 0;
  }

  push(data) {
    for (let i = 0; i < data.length; i++) {
      this.buffer[this.writePtr] = data[i];
      this.writePtr = (this.writePtr + 1) % this.size;
      if (this.count < this.size) {
        this.count++;
      } else {
        // Overwrite oldest data
        this.readPtr = (this.readPtr + 1) % this.size;
      }
    }
  }

  pop(count) {
    if (this.count < count) return null;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = this.buffer[this.readPtr];
      this.readPtr = (this.readPtr + 1) % this.size;
    }
    this.count -= count;
    return out;
  }

  available() {
    return this.count;
  }
}

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Use a buffer large enough for a few seconds of audio (e.g., 48000*10 = 480,000 samples)
    this.ringBuffer = new Float32RingBuffer(48000 * 10); // keeps 10 seconds of audio data before over writing
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
   
    // Push incoming samples to ring buffer
    this.ringBuffer.push(input);

    // Emit 480-sample chunks if available
    while (this.ringBuffer.available() >= 480) {
      const chunk = this.ringBuffer.pop(480);
      this.port.postMessage(chunk);
    }

    return true;
  }
}
registerProcessor("pcm-processor", PcmProcessor);