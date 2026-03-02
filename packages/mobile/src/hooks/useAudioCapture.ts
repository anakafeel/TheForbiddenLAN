import { useRef } from 'react';
import { Audio } from 'expo-av';

export function useAudioCapture(onChunk: (base64: string) => void) {
  const recording = useRef<Audio.Recording | null>(null);

  const start = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: r } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY // Opus equivalent for low bandwidth
      );
      recording.current = r;

      r.setOnRecordingStatusUpdate(async (status) => {
        // Expo-AV does not immediately stream chunks like MediaRecorder. 
        // For a hackathon, we may need to read the URI periodically, but `expo-av` 
        // doesn't support raw arraybuffer streaming out of the box. 
        // We will simulate the chunking by stopping/starting rapidly or 
        // sending the whole file at PTT_END depending on feasibility.
        if (status.isRecording && status.durationMillis > 0) {
           // Placeholder: to be refined for real-time streaming
           console.log('Recording chunk...', status.durationMillis);
        }
      });

    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stop = async () => {
    if (!recording.current) return;
    try {
      await recording.current.stopAndUnloadAsync();
      const uri = recording.current.getURI();
      console.log('Finished capturing recording to:', uri);
      // Here you would optimally read the file as base64 and send it,
      // simulating the chunked pipeline if real-time isn't possible in Managed Expo.
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
    recording.current = null;
  };

  return { start, stop };
}
