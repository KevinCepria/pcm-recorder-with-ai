import { useState, useRef, useCallback } from "react";

import { encodeToMp3, encodeToWav, mergeChunks } from "../../utils/audio";
import workletURL from './recorder-worklet.ts?url';

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState<boolean>(false);
  const [wavBlob, setWavBlob] = useState<Blob | null>(null);
  const [mp3Blob, setMp3Blob] = useState<Blob | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Start recording: initialize AudioContext, load the worklet, and capture PCM frames.
  const startRecording = useCallback(async () => {
    if (recording) return;

    // Create an AudioContext with a desired sample rate.
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    // Request microphone access.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    // Create a MediaRecorder for visualization purposes.
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    // Start the MediaRecorder so that its state is "recording".
    mediaRecorder.start();

    const source = audioContext.createMediaStreamSource(stream);

    // Load the worklet module.
    await audioContext.audioWorklet.addModule(workletURL);

    // Create the AudioWorkletNode.
    const workletNode = new AudioWorkletNode(
      audioContext,
      "recorder-processor"
    );
    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      // Each message contains a Float32Array of PCM data.
      recordedChunksRef.current.push(new Float32Array(event.data));
    };
    workletNodeRef.current = workletNode;

    // Connect the source to the worklet.
    source.connect(workletNode);
    // Optionally, if you want to monitor the sound, you could connect to the destination:
    // workletNode.connect(audioContext.destination);

    setRecording(true);
  }, [recording]);

  // Stop recording, stop all tracks, merge PCM frames, encode them to WAV, and return a Blob.
  const stopRecording = useCallback(() => {
    if (!recording) return;

    // Stop the MediaRecorder if it's recording.
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Stop the microphone tracks.
    mediaStreamRef.current
      ?.getTracks()
      .forEach((track: MediaStreamTrack) => track.stop());

    // Disconnect nodes.
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();

    setRecording(false);

    // Merge all recorded Float32Array chunks into one.
    const mergedSamples = mergeChunks(recordedChunksRef.current);

    // Encode PCM samples to a WAV buffer.
    const wavBlob = encodeToWav(mergedSamples, 16000);
    const mp3Blob = encodeToMp3(mergedSamples, 16000);

    setMp3Blob(mp3Blob);
    setWavBlob(wavBlob);

    // Clear the recorded chunks.
    recordedChunksRef.current = [];
  }, [recording]);

  return { recording, startRecording, stopRecording, wavBlob, mp3Blob, mediaRecorder: mediaRecorderRef.current };
};
