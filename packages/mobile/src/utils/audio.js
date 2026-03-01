import { Platform } from 'react-native';

let mediaDevices, RTCPeerConnection;
let pc = null;

if (Platform.OS !== 'web') {
  const webrtc = require('react-native-webrtc');
  mediaDevices = webrtc.mediaDevices;
  RTCPeerConnection = webrtc.RTCPeerConnection;
}

export async function startAudioStream() {
  if (!mediaDevices) {
    throw new Error('WebRTC not available on web platform');
  }
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    pc.addStream(stream);
    // NOTE: this is placeholder logic; in a real app you would
    // create an offer/answer and send the stream to a server
    return pc;
  } catch (err) {
    console.warn('getUserMedia error', err);
    throw err;
  }
}

export function stopAudioStream() {
  if (pc) {
    pc.close();
    pc = null;
  }
}
