// Initialize the ONNX Runtime environment
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

const MIN_SPEECH_FRAMES = 0; // Minimum number of frames to consider speech default is 3
const POSITIVE_SPEECH_THRESHOLD = 0.5; // Threshold for positive speech detection
const REDEMPTION_FRAMES = 5; // Number of speech-negative frames to wait before ending a speech segment. default is 5

let session = null;
let h = null;
let c = null;

let redemptionCounter = 0;
let speechFrameCount = 0;
let speechDetected = false;

self.onmessage = async (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'init':
            try {
                const modelBuffer = data.modelBuffer;
                session = await ort.InferenceSession.create(modelBuffer, {
                    executionProviders: ['wasm'],
                });

                sr = new ort.Tensor('int64', [16000n]);
                const zeroes = Array(2 * 64).fill(0);
                h = new ort.Tensor('float32', zeroes, [2, 1, 64]);
                c = new ort.Tensor('float32', zeroes, [2, 1, 64]);

                self.postMessage({ type: 'init-complete' });
            } catch (error) {
                self.postMessage({ type: 'init-error', error: error.message });
            }
            break;

        case 'process':
            if (!session) {
                self.postMessage({ type: 'error', error: 'Session not initialized' });
                return;
            }

            try {
                const input = new ort.Tensor('float32', data.pcmData, [1, data.pcmData.length]);
                const inputs = {
                    input,
                    h,
                    c,
                    sr,
                };
                const out = await session.run(inputs);
                h = out['hn'];
                c = out['cn'];
                const [isSpeech] = out['output']?.data;
                // const notSpeech = 1 - isSpeech;

                const isSpeechPositive = isSpeech > POSITIVE_SPEECH_THRESHOLD;

                if (isSpeechPositive) {
                    redemptionCounter = 0; // Reset redemption counter on positive speech
                    speechFrameCount++;
                }

                if (isSpeechPositive && speechFrameCount >= MIN_SPEECH_FRAMES) {
                    speechDetected = true; // We have enough frames of speech
                }

                if (!isSpeechPositive && ++redemptionCounter === REDEMPTION_FRAMES) {
                    speechFrameCount = 0; // Reset speech frame count
                    redemptionCounter = 0; // Reset redemption counter
                    speechDetected = false;
                }

                self.postMessage({ type: 'processed', data: speechDetected });
            } catch (error) {
                self.postMessage({ type: 'error', error: error.message });
            }
            break;

            case 'reset':
            // Reset the state tensors for Silero
            h = new ort.Tensor('float32', zeroes, [2, 1, 64]);
            c = new ort.Tensor('float32', zeroes, [2, 1, 64]);

            sileroSamples = []; // Clear the Silero samples buffer
            speechDetected = false; // Reset speech detection state
            redemptionCounter = 0;
            speechFrameCount = 0;

            break;

        default:
            self.postMessage({ type: 'error', error: 'Unknown message type' });
    }
};
