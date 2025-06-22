import { useRef, useState, useCallback, useEffect } from 'react';

const DNF3_MODEL_URL = '/models/denoiserDNF3.onnx';
const SILERO_MODEL_URL = '/models/silero.onnx';

export const useOnnx = () => {
    const workerRef = useRef<Worker | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initWorker = useCallback(async () => {
        const dnf3ModelResponse = await fetch(DNF3_MODEL_URL);
        const sileroModelResponse = await fetch(SILERO_MODEL_URL);
        const dn3ModelBuffer = await dnf3ModelResponse.arrayBuffer();
        const sileroModelBuffer = await sileroModelResponse.arrayBuffer();

        workerRef.current = await new Worker(`/workers/OnnxWorker.js`);

        workerRef.current.postMessage({ type: 'init', data: [dn3ModelBuffer, sileroModelBuffer] });
        workerRef.current.onmessage = (event) => {
            const { type, error } = event.data;

            if (type === 'init-complete') {
                setReady(true);
            } else if (type === 'init-error') {
                setError(error);
            }
        };
    }, []);

    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    return { workerRef, ready, error, initWorker };
};
