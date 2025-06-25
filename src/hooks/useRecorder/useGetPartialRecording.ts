import { useState, useRef } from "react";
import { mergeChunks, encodeToWav } from "../../utils/audio";

interface Options {
  recordedChunks: Float32Array[];
  onStart?: () => void;
  onEnd?: (blob: Blob) => void;
}

const defaultOptions: Options = {
  recordedChunks: [],
  onStart: undefined,
  onEnd: undefined,
};

export const useGetPartialRecording = (props: Partial<Options>) => {
  const options = { ...defaultOptions, ...props };
  const { recordedChunks, onStart, onEnd } = options;

  const [partialWavBlob, setPartialWavBlob] = useState<Blob | null>(null);
  const [isPartialActive, setIsPartialActive] = useState(false);

  const partialStartIndexRef = useRef<number>(0);

  const startPartialRecording = () => {
    partialStartIndexRef.current = recordedChunks.length;
    setIsPartialActive(true);
    onStart?.();
  };

  const stopPartialRecording = () => {
    if(!recordedChunks.length) return;
    const partialChunks = recordedChunks.slice(partialStartIndexRef.current);

    const merged = mergeChunks(partialChunks);
    const blob = encodeToWav(merged)
    setPartialWavBlob(blob);

    setIsPartialActive(false);
    onEnd?.(blob)
  };

  return {
    isPartialActive,
    partialWavBlob,
    startPartialRecording,
    stopPartialRecording,
  };
};
