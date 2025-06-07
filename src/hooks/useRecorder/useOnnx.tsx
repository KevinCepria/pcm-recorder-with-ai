import { useRef, useState, useCallback, useEffect } from "react";

export const useOnnx = (modelUrl: string) => {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initWorker = useCallback(async () => {
    const modelResponse = await fetch(modelUrl);
    const modelBuffer = await modelResponse.arrayBuffer();

    workerRef.current = await new Worker(
      new URL("/workers/onnxWorker.js", import.meta.url)
    );

    workerRef.current.postMessage({ type: "init", data: { modelBuffer } });
    workerRef.current.onmessage = (event) => {
      const { type, error } = event.data;

      if (type === "init-complete") {
        setReady(true);
      } else if (type === "init-error") {
        setError(error);
      }
    };
  }, [modelUrl]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { workerRef, ready, error, initWorker };
};
