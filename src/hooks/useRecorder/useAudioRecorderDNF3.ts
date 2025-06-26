import { useState, useRef, useCallback, useEffect } from "react";

import { encodeToWav, mergeChunks } from "../../utils/audio";
import { useOnnx } from "./useOnnx";
import { useEventCallback } from "../useEventCallback/useEventCallback";

const WORKLET_URL = '/worklets/dnf3-pcm-worklet.js';
const SAMPLE_RATE = 48000;
interface AudioRecorderOptions {
    defaultVADActive?: boolean;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
}

// --- Default Options ---
const defaultOptions: AudioRecorderOptions = {
    defaultVADActive: false,
    onSpeechStart: undefined,
    onSpeechEnd: undefined,
};

export const useAudioRecorder = (props: Partial<AudioRecorderOptions>) => {
    const options = { ...defaultOptions, ...props };
    const { defaultVADActive, onSpeechStart, onSpeechEnd } = options;

    // --- State ---
    const [recording, setRecording] = useState(false);
    const [fullWavBlob, setFullWavBlob] = useState<Blob | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Refs ---
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const recordedChunksRef = useRef<Float32Array[]>([]);
    const isVadActiveRef = useRef(defaultVADActive);

    // --- ONNX Worker ---
    const {
        workerRef,
        error: onnxError,
        ready,
        initWorker,
        resetSileroStates,
        resetDNF3States,
    } = useOnnx();

    // --- Init & Cleanup ---
    useEffect(() => {
        initWorker();
        return cleanup;
    }, [initWorker]);

    const _onSpeechStart = useEventCallback(onSpeechStart);
    const _onSpeechEnd = useEventCallback(onSpeechEnd);

    // --- VAD Controls ---
    const startVAD = useCallback(() => {
        if (recording && !defaultVADActive) isVadActiveRef.current = true;
    }, [recording]);

    const stopVAD = useCallback(() => {
        if (recording && !defaultVADActive) {
            isVadActiveRef.current = false;
            setIsSpeaking(false);
            resetSileroStates();
        }
    }, [recording, resetSileroStates]);

    // --- Start Recording ---
    const startFullRecording = useCallback(async () => {
        if (recording || !ready) return;
        setError(null);

        try {
            // Setup audio context and stream
            audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);

            // Setup worklet
            await audioContextRef.current.audioWorklet.addModule(WORKLET_URL);
            workletNodeRef.current = new AudioWorkletNode(
                audioContextRef.current,
                'dnf3-pcm-processor',
            );

            // PCM to worker
            workletNodeRef.current.port.onmessage = (event) => {
                const rawPcm = event.data;
                if (workerRef.current) {
                    workerRef.current.postMessage(
                        {
                            type: 'process',
                            data: { pcmData: rawPcm, isVadActive: isVadActiveRef.current },
                        },
                        [rawPcm.buffer],
                    );
                }
            };

            // Worker handler
            if (workerRef.current) {
                workerRef.current.onmessage = (event) => {
                    const { type, data, error } = event.data;
                    if (type === 'dnf3-processed') {
                        recordedChunksRef.current.push(new Float32Array(data));
                    }
                    if (type === 'silero-processed' && isVadActiveRef.current) {
                        setIsSpeaking((prev) => {
                            if (prev && !data) {
                                _onSpeechEnd?.();
                            }
                            if (!prev && data) {
                                _onSpeechStart?.();
                            }
                            return data;
                        });
                    }
                    if (type === 'error') {
                        console.error('Worker error:', error);
                    }
                };
            }

            source.connect(workletNodeRef.current);
            setRecording(true);
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message ?? 'An error occurred while setting up the audio recording.');
            } else {
                setError('An unknown error occurred while setting up the audio recording.');
            }
            console.error('Error during recording setup:', err);
        }
    }, [recording, ready, resetSileroStates, workerRef]);

    // --- Stop Recording ---
    const stopFullRecording = useCallback(() => {
        if (!recording) return;
        const merged = mergeChunks(recordedChunksRef.current);
        setFullWavBlob(encodeToWav(merged));
        cleanup();
    }, [recording]);

    // --- Cleanup ---
    const cleanup = useCallback(() => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        workletNodeRef.current?.disconnect();
        workletNodeRef.current = null;

        audioContextRef.current?.close();
        audioContextRef.current = null;

        if (!defaultVADActive) {
            isVadActiveRef.current = false;
        }

        recordedChunksRef.current = [];

        resetDNF3States();
        resetSileroStates();

        setRecording(false);
        setIsSpeaking(false);
    }, [resetDNF3States, resetSileroStates]);

    return {
        recording,
        startFullRecording,
        stopFullRecording,
        fullWavBlob,
        recordedChunks: recordedChunksRef.current,
        isSpeaking,
        startVAD,
        stopVAD,
        ready,
        error: error || onnxError,
    };
};