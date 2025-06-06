import { useState, useRef, useCallback, useEffect } from "react";
import { encodeToWav, mergeChunks, downsample } from "../../utils/audio";

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
  const workerRef = useRef<Worker | null>(null);

  const startPartialRecording = useCallback(() => {
    if (!recording || isPartialActive) return;
    const stream = mediaStreamRef.current;
    if (!stream) return;

    mediaRecorderRef.current = new MediaRecorder(stream);
    mediaRecorderRef.current.start();

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
      mediaRecorderRef.current.stop();
    }

    mediaRecorderRef.current = null;
    setIsPartialActive(false);
    clearTimeout(fiveSecTimeoutRef.current);

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
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      await audioContext.audioWorklet.addModule(workletURL);

      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNode.port.onmessage = (event) => {
        const rawPcm = event.data;
        if (workerRef.current) {
          workerRef.current.postMessage(
            { type: "process", data: { pcmData: rawPcm } },
            [rawPcm.buffer]
          );
        }
      };

      workletNodeRef.current = workletNode;

      const modelResponse = await fetch("/models/denoiser_model.onnx");
      const modelBuffer = await modelResponse.arrayBuffer();

      const worker = new Worker(
        new URL("/workers/onnxWorker.js", import.meta.url)
      );
      workerRef.current = worker;

      worker.postMessage({ type: "init", data: { modelBuffer } });

      worker.onmessage = (event) => {
        const { type, data, error } = event.data;

        if (type === "init-complete") {
          console.log("Worker initialized");
        } else if (type === "init-error") {
          console.error("Worker initialization error:", error);
        } else if (type === "processed") {
          const enhancedData = new Float32Array(data);
          recordedChunksRef.current.push(enhancedData);
        } else if (type === "error") {
          console.error("Worker error:", error);
        }
      };

      source.connect(workletNode);
      setRecording(true);
    } catch (error) {
      console.error("Error during recording setup:", error);
    }
  }, [recording, partialWavBlob]);

  const stopFullRecording = useCallback(() => {
    if (!recording) return;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (mediaRecorderRef.current?.state === "recording") {
      stopPartialRecording();
    }

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const merged = mergeChunks(recordedChunksRef.current);
    const downsampled = downsample(merged);

    setFullWavBlob(encodeToWav(downsampled));

    recordedChunksRef.current = [];
    setRecording(false);
  }, [recording, stopPartialRecording]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearFiveSecondsRecording();
      workerRef.current?.terminate();
    };
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
