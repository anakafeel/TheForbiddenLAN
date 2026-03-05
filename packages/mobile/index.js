// MUST be first import on Android — initializes gesture handler before navigation stack
import 'react-native-gesture-handler';

// Crypto polyfill second — must be loaded before @forbiddenlan/comms
import './src/shims/setup-crypto';

// NativeWind global styles
import './global.css';

import { registerRootComponent } from 'expo';
import App from './src/App.jsx';

registerRootComponent(App);
