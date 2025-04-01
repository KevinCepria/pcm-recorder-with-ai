import { useAudioRecorder } from "./hooks";
import { AudioVisualizer, LiveAudioVisualizer } from "react-audio-visualize";

import "./App.css";

function App() {
  const {
    recording,
    startRecording,
    stopRecording,
    wavBlob,
    mp3Blob,
    mediaRecorder,
  } = useAudioRecorder();

  return (
    <div>
      <button onClick={recording ? stopRecording : startRecording}>
        {recording ? "Stop Recording" : "Start Recording"}
      </button>

      {!recording ? (
        <>
          {wavBlob && (
            <div>
              <h2>Wav Audio</h2>
              <AudioVisualizer
                blob={wavBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
              <div>
                <audio src={URL.createObjectURL(wavBlob)} controls />
              </div>
            </div>
          )}
          {mp3Blob && (
            <div>
              <h2>MP3 Audio</h2>
              <AudioVisualizer
                blob={mp3Blob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />

              <div>
                <audio src={URL.createObjectURL(mp3Blob)} controls />
              </div>
            </div>
          )}
        </>
      ) : (
        <div>
          <LiveAudioVisualizer
            mediaRecorder={mediaRecorder as MediaRecorder}
            width={500}
            height={75}
            barWidth={1}
            gap={0}
          />
        </div>
      )}
    </div>
  );
}

export default App;
