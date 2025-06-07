import { useState, useRef, useCallback, useEffect } from "react";
import {
  encodeToWav,
  mergeChunks,
  downsample,
  bufferToStream,
} from "../../utils/audio";
import { useOnnx } from "./useOnnx";

const workletURL = "/worklets/pcm-worklet.js";
const modelUrl = "/models/denoiser_model.onnx";

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(
    null
  );

  const { workerRef, error, ready, initWorker } = useOnnx(modelUrl);

  useEffect(() => {
    initWorker();
  }, [initWorker]);

  const startFullRecording = useCallback(async () => {
    if (recording || !ready) return;

    try {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const source = audioContextRef.current.createMediaStreamSource(
        mediaStreamRef.current
      );
      await audioContextRef.current.audioWorklet.addModule(workletURL);

      workletNodeRef.current = new AudioWorkletNode(
        audioContextRef.current,
        "pcm-processor"
      );
      workletNodeRef.current.port.onmessage = (event) => {
        const rawPcm = event.data;

        if (workerRef.current) {
          workerRef.current.postMessage(
            { type: "process", data: { pcmData: rawPcm } },
            [rawPcm.buffer]
          );
        }
      };

      // Only handle processed data and errors here
      if (workerRef.current) {
        workerRef.current.onmessage = (event) => {
          const { type, data, error } = event.data;
          if (type === "processed") {
            const enhancedData = new Float32Array(data);
            bufferToStream(
              enhancedData,
              audioContextRef.current!,
              destinationNodeRef.current!
            );
            recordedChunksRef.current.push(enhancedData);
          } else if (type === "error") {
            console.error("Worker error:", error);
          }
        };
      }

      // Helps in connecting proccessed audio to the MediaRecorder
      destinationNodeRef.current =
        audioContextRef.current.createMediaStreamDestination();
      source.connect(workletNodeRef.current);
      mediaRecorderRef.current = new MediaRecorder(
        destinationNodeRef.current.stream
      );

      mediaRecorderRef.current.start();

      setRecording(true);
    } catch (error) {
      console.error("Error during recording setup:", error);
    }
  }, [recording, ready]);

  const stopFullRecording = useCallback(() => {
    if (!recording) return;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    destinationNodeRef.current?.disconnect();
    destinationNodeRef.current = null;

    // Worker cleanup handled by useOnnx

    const merged = mergeChunks(recordedChunksRef.current);
    const downsampled = downsample(merged);

    setFullWavBlob(encodeToWav(downsampled));

    recordedChunksRef.current = [];
    setRecording(false);
  }, [recording]);

  return {
    // Full recording controls
    recording,
    startFullRecording,
    stopFullRecording,
    fullWavBlob,
    chunksRef: recordedChunksRef,

    // Visualization access
    mediaRecorder: mediaRecorderRef.current,

    // ONNX worker error
    onnxReady: ready,
    onnxError: error,
  };
};
