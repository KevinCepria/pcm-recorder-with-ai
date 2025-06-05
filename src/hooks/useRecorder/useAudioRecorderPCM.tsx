import { useState, useRef, useCallback, useEffect } from "react";
import { encodeToWav, mergeChunks } from "../../utils/audio";
import workletURL from "./recorder-worklet.ts?url";
import * as ort from "onnxruntime-web";

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);
  const [partialWavBlob, setPartialWavBlob] = useState<Blob | null>(null);
  const [fiveSecWavBlob, setFiveSecWavBlob] = useState<Blob | null>(null);
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
  const startPartialRecording = useCallback(
    (hasIntent: boolean = false) => {
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
    },
    [recording, isPartialActive]
  );

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
    setPartialWavBlob(encodeToWav(samples, 16000));
  }, [isPartialActive]);

  // Full recording management
  const startFullRecording = useCallback(async () => {
    if (recording) return;

    // Load ONNX model once here
    ortSessionRef.current = await ort.InferenceSession.create("/models/denoiser_model.onnx");

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const source = audioContext.createMediaStreamSource(stream);

    await audioContext.audioWorklet.addModule(workletURL);

    const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
    workletNode.port.onmessage = async (event: MessageEvent<Float32Array>) => {
      console.log("SSSSS")
      const rawPcm = event.data; // Float32Array with raw PCM samples (48kHz)

      if (!ortSessionRef.current) return;

      // create input tensor [1, length]
      const inputTensor = new ort.Tensor("float32", rawPcm, [1, rawPcm.length]);

      try {
        const output = await ortSessionRef.current.run({ input: inputTensor });
        const outputName = Object.keys(output)[0];
        const denoisedPcm = output[outputName].data;

        // Store denoised PCM for later WAV encoding
        recordedChunksRef.current.push(denoisedPcm as Float32Array);
      } catch (e) {
        console.error("ONNX inference error:", e);
      }
    };
    workletNodeRef.current = workletNode;

    source.connect(workletNode);
    setRecording(true);
  }, [recording]);

  const stopFullRecording = useCallback(() => {
    if (!recording) return;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    setRecording(false);

    const merged = mergeChunks(recordedChunksRef.current);
    setFullWavBlob(encodeToWav(merged, 16000));

    if (mediaRecorderRef.current?.state === "recording") {
      stopPartialRecording();
    }

    recordedChunksRef.current = [];
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
