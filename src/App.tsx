import { AudioVisualizer } from "react-audio-visualize";
import { AudioVisualizer as LiveAudioVisualizer } from "./components/AudioVisualizer";
import { useAudioRecorder, useGetPartialRecording } from "./hooks";

import "./App.css";

function App() {
  const {
    recording,
    startFullRecording,
    stopFullRecording,
    fullWavBlob,
    ready,
    recordedChunks,
    startVAD,
    stopVAD,
    isSpeaking,
  } = useAudioRecorder({
    defaultVADActive: true,
    onSpeechEnd: () => {
      console.log("Speech ended");
    },
    onSpeechStart: () => {
      console.log("Speech started");
    },
  });

  const {
    isPartialActive,
    partialWavBlob,
    startPartialRecording,
    stopPartialRecording,
  } = useGetPartialRecording({
    recordedChunks,
    onStart: () => {
      console.log("Partial recording started");
      startVAD();
    },
    onEnd: (blob) => {
      console.log("Partial recording ended", blob);
      stopVAD();
    },
  });

  return (
    <div>
      <h1>Speaking: {isSpeaking ? "Yes" : "No"} </h1>
      <button
        onClick={recording ? stopFullRecording : startFullRecording}
        disabled={!ready}
      >
        {recording ? "Stop Recording" : "Start Recording"}
      </button>
      {recording && (
        <button
          onClick={() =>
            isPartialActive ? stopPartialRecording() : startPartialRecording()
          }
        >
          {isPartialActive
            ? "Stop Partial Recording"
            : "Start Partial Recording"}
        </button>
      )}

      {!recording ? (
        <>
          {fullWavBlob && (
            <div>
              <h2>Full Recording</h2>
              <AudioVisualizer
                blob={fullWavBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
              <div>
                <audio src={URL.createObjectURL(fullWavBlob)} controls />
              </div>
            </div>
          )}
          {partialWavBlob && (
            <div>
              <h2>Partial Recording</h2>
              <AudioVisualizer
                blob={partialWavBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
              <div>
                <audio src={URL.createObjectURL(partialWavBlob)} controls />
              </div>
            </div>
          )}
          {/* {fiveSecWavBlob && (
            <div>
              <h2>Intent recording</h2>
              <AudioVisualizer
                blob={fiveSecWavBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
              <div>
                <audio src={URL.createObjectURL(fiveSecWavBlob)} controls />
              </div>
            </div>
          )} */}
          {/* {mp3Blob && (
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
          )} */}
        </>
      ) : (
        <div>
          <LiveAudioVisualizer
            pcmChunks={recordedChunks}
            width={500}
            height={75}
          />
        </div>
      )}
    </div>
  );
}

export default App;
