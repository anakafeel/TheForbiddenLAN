import { useRef } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export function useAudioPlayback() {
  const queue = useRef<string[]>([]);
  const playing = useRef(false);

  const playNext = async () => {
    if (playing.current || queue.current.length === 0) return;
    playing.current = true;
    const base64Chunk = queue.current.shift()!;
    
    try {
      // expo-av cannot play raw base64 memory buffers directly.
      // We must write it to a temporary file first, then play it.
      const tempUri = FileSystem.cacheDirectory + `chunk_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(tempUri, base64Chunk, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: tempUri },
        { shouldPlay: true }
      );

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          await sound.unloadAsync();
          playing.current = false;
          playNext();
        }
      });
    } catch (err) {
      console.error('Audio playback error', err);
      playing.current = false;
      playNext();
    }
  };

  const enqueue = (base64: string) => {
    queue.current.push(base64);
    playNext();
  };

  const clear = () => {
    queue.current = [];
    playing.current = false;
  };

  return { enqueue, clear };
}
