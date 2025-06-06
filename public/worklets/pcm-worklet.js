class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    // Push incoming samples to buffer
    this.buffer.push(...input);

    // Emit 480-sample chunks
    while (this.buffer.length >= 480) {
      const chunk = this.buffer.slice(0, 480);
      this.port.postMessage(new Float32Array(chunk));
      this.buffer = this.buffer.slice(480);
    }

    return true;
  }
}
registerProcessor("pcm-processor", PcmProcessor);