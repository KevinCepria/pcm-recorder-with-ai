import { useState, useRef, useCallback, useEffect } from "react";
import {
  encodeToWav,
  mergeChunks,
  bufferToStream,
  downSampleChunk,
} from "../../utils/audio";
import { useOnnx } from "./useOnnxDNF3";

const workletURL = "/worklets/dnf3-pcm-worklet.js";
const modelUrl = "/models/denoiserDNF3.onnx";

export const useAudioRecorderDNF3 = () => {
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
      //48kHz sample rate audio input needed for DNF3 model
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
            // Handle audio data processed by the ONNX model
            const enhancedData = new Float32Array(data);
            bufferToStream(
              enhancedData,
              audioContextRef.current!,
              destinationNodeRef.current!
            );

            //Down sample rate from 48kHz to 16kHz to save memory
            const downsampledData = downSampleChunk(enhancedData);
            recordedChunksRef.current.push(downsampledData);
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

    const merged = mergeChunks(recordedChunksRef.current);

    setFullWavBlob(encodeToWav(merged));

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
