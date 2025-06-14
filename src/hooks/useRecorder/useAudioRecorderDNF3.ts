import { useState, useRef, useCallback, useEffect } from "react";
import { encodeToWav, mergeChunks, downSampleChunk } from "../../utils/audio";
import { useOnnx } from "./useOnnxDNF3";

const WORKLET_URL = "/worklets/dnf3-pcm-worklet.js";
const MODEL_URL = "/models/denoiserDNF3.onnx";
const SAMPLE_RATE = 48000; // Use 48kHz sample rate for DNF3 model compatibility

export const useAudioRecorderDNF3 = () => {
  const [recording, setRecording] = useState(false);
  const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);

  const { workerRef, error, ready, initWorker } = useOnnx(MODEL_URL);

  useEffect(() => {
    initWorker();
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
          if (type === "processed") {
            //Down sample rate from 48kHz to 16kHz to save memory
            const downsampledData = downSampleChunk(new Float32Array(data));
            recordedChunksRef.current.push(downsampledData);
          } else if (type === "error") {
            console.error("Worker error:", error);
          }
        };
      }

      source.connect(workletNodeRef.current);
      setRecording(true);
    } catch (error) {
      console.error("Error during recording setup:", error);
    }
  }, [recording, ready]);

  const stopFullRecording = useCallback(() => {
    if (!recording) return;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    const merged = mergeChunks(recordedChunksRef.current);

    setFullWavBlob(encodeToWav(merged));

    recordedChunksRef.current = [];
    setRecording(false);
  }, [recording]);

  return {
    recording,
    startFullRecording,
    stopFullRecording,
    fullWavBlob,
    recordedChunks: recordedChunksRef.current,

    onnxReady: ready,
    onnxError: error,
  };
};
