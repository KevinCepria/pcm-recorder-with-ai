import { useState, useRef, useCallback, useEffect } from "react";
import { convertWebmToWav } from "../../utils/audio";

import { NoiseSuppressorWorklet_Name } from "@timephy/rnnoise-wasm";
import NoiseSuppressorWorklet from "@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url";

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);
  const [partialWavBlob, setPartialWavBlob] = useState<Blob | null>(null);
  const [fiveSecWavBlob, setFiveSecWavBlob] = useState<Blob | null>(null);
  const [isPartialActive, setIsPartialActive] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const partialStartIndexRef = useRef(0);
  const fiveSecTimeoutRef = useRef<number>();

  // Partial recording management
  const startPartialRecording = useCallback(
    (hasIntent: boolean = false) => {
      if (!recording || isPartialActive) return;

      // Mark partial start position
      partialStartIndexRef.current = recordedChunksRef.current.length;
      setIsPartialActive(true);

      // Setup automatic 5-second capture
    //   if (hasIntent) {
    //     fiveSecTimeoutRef.current = setTimeout(() => {
    //       const currentChunks = recordedChunksRef.current;
    //       const partialChunks = currentChunks.slice(
    //         partialStartIndexRef.current
    //       );

    //       let samples = mergeChunks(partialChunks);
    //       samples = samples.slice(0, 16000 * 5); // Exactly 5 seconds

    //       setFiveSecWavBlob(encodeToWav(samples, 16000));
    //     }, 5000);
    //   }
    },
    [recording, isPartialActive]
  );

  const stopPartialRecording = useCallback(async () => {
    if (!isPartialActive) return;

    setIsPartialActive(false);
    clearTimeout(fiveSecTimeoutRef.current);

    
    // Capture partial recording
    const partialChunks = recordedChunksRef.current.slice(
      partialStartIndexRef.current
    );

    const blob = new Blob(partialChunks, { type: "audio/webm" });
  console.log("Stopping partial recording...", blob);
    const { wavBlob } = await convertWebmToWav(blob);
      
    setPartialWavBlob(wavBlob);
  }, [isPartialActive]);

  // Full recording management
  const startFullRecording = useCallback(async () => {
    if (recording) return;

    // Load the NoiseSuppressorWorklet into the AudioContext
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule(NoiseSuppressorWorklet);

    // Instantiate the Worklet as a Node
    const noiseSuppressionNode = new AudioWorkletNode(
      audioContext,
      NoiseSuppressorWorklet_Name
    );
    workletNodeRef.current = noiseSuppressionNode;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const source = audioContext.createMediaStreamSource(stream);

    source.connect(noiseSuppressionNode);

    const recorder = new MediaRecorder(stream);
    setMediaRecorder(recorder);

    recorder.ondataavailable = (event) => {
      recordedChunksRef.current.push(event.data);
    };
    recorder.start(250);
    setRecording(true);
  }, [recording]);

  const stopFullRecording = useCallback(async () => {
    if (!recording) return;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    if (
      mediaRecorder &&
      mediaRecorder.state !== "inactive"
    ) {
      mediaRecorder?.stop();
    }

    setMediaRecorder(null);
    setRecording(false);

    const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
    console.log("Stopping full recording...", blob);
    const { wavBlob } = await convertWebmToWav(blob);
    setFullWavBlob(wavBlob);

    if (mediaRecorder?.state === "recording" && isPartialActive) {
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
    mediaRecorder
  };
};
