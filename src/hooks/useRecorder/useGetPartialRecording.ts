import { useCallback, useState, useRef } from "react";
import { mergeChunks, encodeToWav } from "../../utils/audio";

export const useGetPartialRecording = (
  recordedChunksRef: React.MutableRefObject<Float32Array[]>
) => {
  const [partialWavBlob, setPartialWavBlob] = useState<Blob | null>(null);
  const [isPartialActive, setIsPartialActive] = useState(false);

  const partialStartIndexRef = useRef<number>(0);

  const startPartialRecording = useCallback(() => {
    partialStartIndexRef.current = recordedChunksRef.current.length;
    setIsPartialActive(true);
  }, []);

  const stopPartialRecording = useCallback(() => {
    const partialChunks = recordedChunksRef.current.slice(
      partialStartIndexRef.current
    );

    const merged = mergeChunks(partialChunks);
    setPartialWavBlob(encodeToWav(merged));

    setIsPartialActive(false);
  }, []);

  return {
    isPartialActive,
    partialWavBlob,
    startPartialRecording,
    stopPartialRecording,
  };
};
