import { useState, useRef, useCallback, useEffect } from "react";
import { encodeToWav, mergeChunks } from "../../utils/audio";
import workletURL from "./recorder-worklet.ts?url";

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
    fiveSecTimeoutRef.current = setTimeout(() => {
      const currentChunks = recordedChunksRef.current;
      const partialChunks = currentChunks.slice(partialStartIndexRef.current);

      let samples = mergeChunks(partialChunks);
      samples = samples.slice(0, 16000 * 5); // Exactly 5 seconds

      setFiveSecWavBlob(encodeToWav(samples, 16000));
    }, 5000);
  }, [recording, isPartialActive]);

  const stopPartialRecording = useCallback(() => {
    if (!isPartialActive) return;

    // Cleanup visualization recorder
    mediaRecorderRef.current?.stop();
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

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const source = audioContext.createMediaStreamSource(stream);

    await audioContext.audioWorklet.addModule(workletURL);

    const workletNode = new AudioWorkletNode(
      audioContext,
      "recorder-processor"
    );
    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      recordedChunksRef.current.push(new Float32Array(event.data));
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
    return () => {
      clearTimeout(fiveSecTimeoutRef.current);
    };
  }, []);

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

    // Visualization access
    mediaRecorder: mediaRecorderRef.current,
  };
};
