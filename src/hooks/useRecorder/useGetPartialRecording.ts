import { useState, useRef } from "react";

import { mergeChunks, encodeToWav } from "../../utils/audio";
import { useEventCallback } from "../useEventCallback/useEventCallback";

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

  const _onStart = useEventCallback(onStart);
  const _onEnd = useEventCallback(onEnd);

  const partialStartIndexRef = useRef<number>(0);

  const startPartialRecording = () => {
    if (isPartialActive) return;

    partialStartIndexRef.current = recordedChunks.length;
    setIsPartialActive(true);
    _onStart?.();
  };

  const stopPartialRecording = () => {
    if (!isPartialActive) return;

    if (recordedChunks.length) {
      const partialChunks = recordedChunks.slice(partialStartIndexRef.current);

      const merged = mergeChunks(partialChunks);
      const blob = encodeToWav(merged);
      setPartialWavBlob(blob);
      _onEnd?.(blob);
    }

    partialStartIndexRef.current = 0; // Reset start index
    setIsPartialActive(false);
  };

  return {
    isPartialActive,
    partialWavBlob,
    startPartialRecording,
    stopPartialRecording,
  };
};
