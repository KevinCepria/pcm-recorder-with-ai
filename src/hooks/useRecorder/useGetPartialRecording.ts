import { useCallback, useState, useRef } from "react";
import { mergeChunks, downsample, encodeToWav } from "../../utils/audio";

export const useGetPartialRecording = (
  recordedChunksRef: React.MutableRefObject<Float32Array[]>
) => {
  const [partialWavBlob, setPartialWavBlob] = useState<Blob | null>(null);
  const [isPartialActive, setIsPartialActive] = useState(false);

  const partialStartIndexRef = useRef<number>(0);

  const startPartialRecording = useCallback(() => {
    partialStartIndexRef.current = recordedChunksRef.current.length;
    setIsPartialActive(true);
  }, [recordedChunksRef]);

  const stopPartialRecording = useCallback(() => {
    // if (fiveSecTimeoutRef) clearTimeout(fiveSecTimeoutRef.current);
    const partialChunks = recordedChunksRef.current.slice(
      partialStartIndexRef.current
    );
    const samples = mergeChunks(partialChunks);
    const downsampled = downsample(samples);

    setPartialWavBlob(encodeToWav(downsampled));

    setIsPartialActive(false);
  }, [recordedChunksRef]);

  return {
    isPartialActive,
    partialWavBlob,
    startPartialRecording,
    stopPartialRecording,
  };
};
