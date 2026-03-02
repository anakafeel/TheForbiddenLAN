// audio.js — mic capture via expo-av → base64 encode → comms.sendAudioChunk().
// Replaces browser-only navigator.mediaDevices + MediaRecorder with expo-av.
// Exports the same startAudioStream / stopAudioStream API so PTTScreen.jsx needs no changes.
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { comms, encryption } from './comms';

let _recording = null;

export async function startAudioStream() {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[comms] Microphone permission denied');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.LOW_QUALITY
    );
    _recording = recording;
    console.log('[comms] mic capture started via expo-av');
  } catch (err) {
    console.warn('[comms] startAudioStream failed:', err.message);
    throw err;
  }
}

export async function stopAudioStream() {
  if (!_recording) return;
  try {
    await _recording.stopAndUnloadAsync();
    const uri = _recording.getURI();
    _recording = null;

    if (!uri) return;

    // Read recorded file as base64 and send via the comms layer
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const encrypted = await encryption.encrypt(base64);
    console.log('[comms] PTT_AUDIO sending, encrypted bytes:', encrypted.length);
    await comms.sendAudioChunk(encrypted);

    // Clean up temp file
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (err) {
    console.warn('[comms] stopAudioStream error:', err.message);
  }
}
