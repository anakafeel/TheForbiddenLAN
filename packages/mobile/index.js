import { registerRootComponent } from 'expo';
import App from './src/App.jsx';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// Explicitly importing App.jsx (native) instead of App.tsx (web/react-router-dom)
registerRootComponent(App);
