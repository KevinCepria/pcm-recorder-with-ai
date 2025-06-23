// Initialize the ONNX Runtime environment
importScripts("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js");

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

/// DNF3 ONNX variables
let dnf3Session = null;
let stateTensor = null;
let attenLimDbTensor = null;

// Silero ONNX variables
let sileroSession = null;
const MIN_SPEECH_FRAMES = 0; // Minimum number of frames to consider speech default is 3
const POSITIVE_SPEECH_THRESHOLD = 0.5; // Threshold for positive speech detection
const REDEMPTION_FRAMES = 3; // Number of speech-negative frames to wait before ending a speech segment. default is 5
const INPUT_SAMPLE = 512; // Input sample size for Silero model

let h = null;
let c = null;

let sileroSamples = []; // Buffer to accumulate samples for Silero processing
let redemptionCounter = 0;
let speechFrameCount = 0;
let speechDetected = false;

const zeroes = Array(2 * 64).fill(0);

const downSample = (
  chunk,
  inputSampleRate = 48000,
  outputSampleRate = 16000
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
};

self.onmessage = async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case "init":
      try {
        const [DN3ModelBuffer, SileroModelBuffer] = data;

        //DNF3 initialization
        dnf3Session = await ort.InferenceSession.create(DN3ModelBuffer, {
          executionProviders: ["wasm"],
        });
        stateTensor = new ort.Tensor("float32", new Float32Array(45304), [
          45304,
        ]);
        attenLimDbTensor = new ort.Tensor("float32", new Float32Array([0.0]), [
          1,
        ]);

        //Silero initialization
        sileroSession = await ort.InferenceSession.create(SileroModelBuffer, {
          executionProviders: ["wasm"],
        });
        sr = new ort.Tensor("int64", [16000n]);
        h = new ort.Tensor("float32", zeroes, [2, 1, 64]);
        c = new ort.Tensor("float32", zeroes, [2, 1, 64]);

        self.postMessage({ type: "init-complete" });
      } catch (error) {
        self.postMessage({ type: "init-error", error: error.message });
      }
      break;

    case "process":
      if (!dnf3Session && !sileroSession) {
        self.postMessage({ type: "error", error: "Session not initialized" });
        return;
      }

      try {
        //DNF3 processing
        const inputTensor = new ort.Tensor("float32", data.pcmData, [
          data.pcmData.length,
        ]);
        const output = await dnf3Session.run({
          input_frame: inputTensor,
          states: stateTensor,
          atten_lim_db: attenLimDbTensor,
        });

        const enhanced = output["enhanced_audio_frame"];
        stateTensor = output["new_states"];
        // Downsample the enhanced audio data from 48kHz to 16kHz
        const downsampledData = downSample(enhanced.data);
        const copyDownsampledData = new Float32Array(downsampledData); // Create a copy to avoid detaching the original buffer

        self.postMessage(
          { type: "dnf3-processed", data: downsampledData.buffer },
          [downsampledData.buffer]
        );

        //Silero processing

        sileroSamples.push(...copyDownsampledData); //until we have enough samples to process

        if (sileroSamples.length >= INPUT_SAMPLE) {
          const sileroInput = sileroSamples.splice(0, INPUT_SAMPLE);
          const input = new ort.Tensor("float32", sileroInput, [
            1,
            sileroInput.length,
          ]);
          const inputs = {
            input,
            h,
            c,
            sr,
          };
          const out = await sileroSession.run(inputs);
          h = out["hn"];
          c = out["cn"];
          const [isSpeech] = out["output"]?.data;
          // const notSpeech = 1 - isSpeech;

          const isSpeechPositive = isSpeech > POSITIVE_SPEECH_THRESHOLD;

          if (isSpeechPositive) {
            redemptionCounter = 0; // Reset redemption counter on positive speech
            speechFrameCount++;
          }

          if (isSpeechPositive && speechFrameCount >= MIN_SPEECH_FRAMES) {
            speechDetected = true; // Have enough frames of speech
          }

          if (!isSpeechPositive && ++redemptionCounter === REDEMPTION_FRAMES) {
            speechFrameCount = 0; // Reset speech frame count
            redemptionCounter = 0; // Reset redemption counter
            speechDetected = false;
          }

          self.postMessage({ type: "silero-processed", data: speechDetected });
        }
      } catch (error) {
        self.postMessage({ type: "error", error: error.message });
      }
      break;

    case "reset":
      // Reset DNF3 session state
      attenLimDbTensor = new ort.Tensor("float32", new Float32Array([0.0]), [
        1,
      ]);

      // Reset the state tensors for Silero
      h = new ort.Tensor("float32", zeroes, [2, 1, 64]);
      c = new ort.Tensor("float32", zeroes, [2, 1, 64]);

      sileroSamples = []; // Clear the Silero samples buffer
      speechDetected = false; // Reset speech detection state
      redemptionCounter = 0;
      speechFrameCount = 0;

      break;

    default:
      self.postMessage({ type: "error", error: "Unknown message type" });
  }
};
