import { useState, useRef, useCallback, useEffect } from "react";
import { encodeToWav, mergeChunks, downsample } from "../../utils/audio";
import * as ort from "onnxruntime-web";

const workletURL = "/worklets/pcm-worklet.js";

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);
  const [partialWavBlob, setPartialWavBlob] = useState<Blob | null>(null);
  const [fiveSecWavBlob] = useState<Blob | null>(null);
  const [isPartialActive, setIsPartialActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const partialStartIndexRef = useRef(0);
  const fiveSecTimeoutRef = useRef<number>();
  const ortSessionRef = useRef<ort.InferenceSession | null>(null);

  // Partial recording management
  const startPartialRecording = useCallback(() => {
    if (!recording || isPartialActive) return;
    const stream = mediaStreamRef.current;
    if (!stream) return;

    // Start visualization recorder
    mediaRecorderRef.current = new MediaRecorder(stream);
    mediaRecorderRef.current.start();

    // Mark partial start position
    partialStartIndexRef.current = recordedChunksRef.current.length;
    setIsPartialActive(true);

    // Setup automatic 5-second capture
    // if (hasIntent) {
    //   fiveSecTimeoutRef.current = setTimeout(() => {
    //     const currentChunks = recordedChunksRef.current;
    //     const partialChunks = currentChunks.slice(
    //       partialStartIndexRef.current
    //     );

    //     let samples = mergeChunks(partialChunks);
    //     samples = samples.slice(0, 16000 * 5); // Exactly 5 seconds

    //     setFiveSecWavBlob(encodeToWav(samples, 16000));
    //   }, 5000);
    // }
  }, [recording, isPartialActive]);

  const stopPartialRecording = useCallback(() => {
    if (!isPartialActive) return;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current?.stop();
    }

    mediaRecorderRef.current = null;

    setIsPartialActive(false);
    clearTimeout(fiveSecTimeoutRef.current);

    // Capture partial recording
    const partialChunks = recordedChunksRef.current.slice(
      partialStartIndexRef.current
    );

    const samples = mergeChunks(partialChunks);
    const downsampled = downsample(samples);

    setPartialWavBlob(encodeToWav(downsampled));
  }, [isPartialActive]);

  const startFullRecording = useCallback(async () => {
    if (recording) return;

    if (partialWavBlob) {
      setPartialWavBlob(null);
    }

    try {
      // Load the ONNX model
      const session = await ort.InferenceSession.create(
        "/models/denoiser_model.onnx",
        { executionProviders: ["wasm"] }
      );
      ortSessionRef.current = session;

      // Initialize tensors
      let stateTensor = new ort.Tensor("float32", new Float32Array(45304), [
        45304,
      ]);
      const attenLimDbTensor = new ort.Tensor(
        "float32",
        new Float32Array([0.0]),
        [1]
      );

      // Set up audio context
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);

      await audioContext.audioWorklet.addModule(workletURL);

      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNode.port.onmessage = async (
        event: MessageEvent<Float32Array>
      ) => {
        const rawPcm = event.data;
        if (!ortSessionRef.current) return;

        const inputTensor = new ort.Tensor("float32", rawPcm, [rawPcm.length]);

        try {
          const output = await ortSessionRef.current.run({
            input_frame: inputTensor,
            states: stateTensor,
            atten_lim_db: attenLimDbTensor,
          });

          const enhanced = output["enhanced_audio_frame"] as ort.Tensor;
          const newState = output["new_states"] as ort.TypedTensor<"float32">;

          recordedChunksRef.current.push(enhanced.data as Float32Array);
          stateTensor = newState;
        } catch (inferenceError) {
          console.error("ONNX inference error:", inferenceError);
        }
      };

      workletNodeRef.current = workletNode;
      source.connect(workletNode);
      setRecording(true);
    } catch (error) {
      console.error("Error during recording setup:", error);
    }
  }, [recording]);

  const stopFullRecording = useCallback(() => {
    if (!recording) return;
    if (!recording) return;

    // Stop media tracks
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (mediaRecorderRef.current?.state === "recording") {
      stopPartialRecording();
    }

    // Disconnect and close audio context
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    // Clear ONNX session
    ortSessionRef.current = null;

    const merged = mergeChunks(recordedChunksRef.current);
    const downsampled = downsample(merged);

    setFullWavBlob(encodeToWav(downsampled));
    
    // Reset recorded chunks
    recordedChunksRef.current = [];

    setRecording(false);
  }, [recording, stopPartialRecording]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return clearFiveSecondsRecording;
  }, []);

  const clearFiveSecondsRecording = () =>
    clearTimeout(fiveSecTimeoutRef.current);

  return {
    // Full recording controls
    recording,
    startFullRecording,
    stopFullRecording,
    fullWavBlob,

    // Partial recording controls
    isPartialActive,
    startPartialRecording,
    stopPartialRecording,
    partialWavBlob,

    // Automatic 5-second capture
    fiveSecWavBlob,
    clearFiveSecondsRecording,

    // Visualization access
    mediaRecorder: mediaRecorderRef.current,
  };
};
