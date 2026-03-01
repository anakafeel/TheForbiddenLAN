import { Platform } from 'react-native';

let mediaDevices, RTCPeerConnection;
let pc = null;
let webStream = null;

if (Platform.OS !== 'web') {
  const webrtc = require('react-native-webrtc');
  mediaDevices = webrtc.mediaDevices;
  RTCPeerConnection = webrtc.RTCPeerConnection;
}

export async function startAudioStream() {
  // Web platform - use browser's native WebRTC
  if (Platform.OS === 'web') {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        webStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Web audio stream started');
        return webStream;
      } else {
        console.warn('getUserMedia not supported in this browser');
        return null;
      }
    } catch (err) {
      console.warn('Web getUserMedia error', err);
      return null;
    }
  }
  
  // Native platform
  if (!mediaDevices) {
    throw new Error('WebRTC not available');
  }
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    pc.addStream(stream);
    return pc;
  } catch (err) {
    console.warn('getUserMedia error', err);
    throw err;
  }
}

export function stopAudioStream() {
  // Web platform
  if (webStream) {
    webStream.getTracks().forEach(track => track.stop());
    webStream = null;
    console.log('Web audio stream stopped');
    return;
  }
  
  // Native platform
  if (pc) {
    pc.close();
    pc = null;
  }
}
