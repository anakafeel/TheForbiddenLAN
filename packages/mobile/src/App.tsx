import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginScreen } from './screens/LoginScreen';
import { PTTScreen } from './screens/PTTScreen';
import { MapScreen } from './screens/MapScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<Navigate to="/login" />} />
        <Route path="/login"  element={<LoginScreen />} />
        <Route path="/ptt"    element={<PTTScreen />} />
        <Route path="/map"    element={<MapScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
