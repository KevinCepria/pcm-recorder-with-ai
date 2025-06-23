// Initialize the ONNX Runtime environment
importScripts("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js");

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

let session = null;
let stateTensor = null;
let attenLimDbTensor = null;

self.onmessage = async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case "init":
      try {
        const modelBuffer = data.modelBuffer;
        session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: ["wasm"],
        });
        stateTensor = new ort.Tensor("float32", new Float32Array(45304), [
          45304,
        ]);
        attenLimDbTensor = new ort.Tensor("float32", new Float32Array([0.0]), [
          1,
        ]);
        self.postMessage({ type: "init-complete" });
      } catch (error) {
        self.postMessage({ type: "init-error", error: error.message });
      }
      break;

    case "process":
      if (!session) {
        self.postMessage({ type: "error", error: "Session not initialized" });
        return;
      }

      try {
        const inputTensor = new ort.Tensor("float32", data.pcmData, [
          data.pcmData.length,
        ]);
        const output = await session.run({
          input_frame: inputTensor,
          states: stateTensor,
          atten_lim_db: attenLimDbTensor,
        });

        const enhanced = output["enhanced_audio_frame"];
        stateTensor = output["new_states"];

        self.postMessage({ type: "processed", data: enhanced.data.buffer }, [
          enhanced.data.buffer,
        ]);
      } catch (error) {
        self.postMessage({ type: "error", error: error.message });
      }
      break;

    case "reset":
      // Reset DNF3 session state
      attenLimDbTensor = new ort.Tensor("float32", new Float32Array([0.0]), [
        1,
      ]);

      break;

    default:
      self.postMessage({ type: "error", error: "Unknown message type" });
  }
};
