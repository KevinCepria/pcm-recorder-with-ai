import { useState, useRef, useCallback, useEffect } from "react";
import { encodeToWav, mergeChunks } from "../../utils/audio";
import { useOnnx } from "./useOnnx";

const WORKLET_URL = "/worklets/dnf3-pcm-worklet.js";
const SAMPLE_RATE = 48000; // Use 48kHz sample rate for DNF3 model compatibility

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState("");

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);

  const { workerRef, error: onnxError, ready, initWorker } = useOnnx();

  useEffect(() => {
    initWorker();
    return () => {
      cleanup();
    };
  }, [initWorker]);

  const startFullRecording = useCallback(async () => {
    if (recording || !ready) return;

    try {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const source = audioContextRef.current.createMediaStreamSource(
        mediaStreamRef.current
      );
      await audioContextRef.current.audioWorklet.addModule(WORKLET_URL);

      workletNodeRef.current = new AudioWorkletNode(
        audioContextRef.current,
        "dnf3-pcm-processor"
      );
      workletNodeRef.current.port.onmessage = (event) => {
        const rawPcm = event.data;

        if (workerRef.current) {
          //pass raw PCM data to the ONNX worker for processing
          workerRef.current.postMessage(
            { type: "process", data: { pcmData: rawPcm } },
            [rawPcm.buffer]
          );
        }
      };

      // Handle processed data and errors from the worker
      if (workerRef.current) {
        workerRef.current.onmessage = (event) => {
          const { type, data, error } = event.data;
  
          if (type === "dnf3-processed") {
            recordedChunksRef.current.push(new Float32Array(data));
          } else if (type === "silero-processed") {
            setIsSpeaking(data);
          } else if (type === "error") {
            console.error("Worker error:", error);
          }
        };
      }

      source.connect(workletNodeRef.current);
      setRecording(true);
    } catch (error) {
      setRecording(false);
      if (error instanceof Error) {
        setError(
          error.message ??
            "An error occurred while setting up the audio recording."
        );
      } else {
        setError(
          "An unknown error occurred while setting up the audio recording."
        );
      }
      console.error("Error during recording setup:", error);
    }
  }, [recording, ready]);

  const stopFullRecording = useCallback(() => {
    if (!recording) return;

    const merged = mergeChunks(recordedChunksRef.current);
    setFullWavBlob(encodeToWav(merged));

    cleanup();
    setRecording(false);
    setIsSpeaking(false);
  }, [recording]);

  const cleanup = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    recordedChunksRef.current = [];
  }, []);

  return {
    recording,
    startFullRecording,
    stopFullRecording,
    fullWavBlob,
    recordedChunks: recordedChunksRef.current,
    isSpeaking,

    onnxReady: ready,
    onnxError: error ?? onnxError,
  };
};
