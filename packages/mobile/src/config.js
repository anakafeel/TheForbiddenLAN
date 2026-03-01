/**
 * App Configuration
 * Toggle MOCK_MODE = true/false to switch between mock data and real backend
 */

export const CONFIG = {
  // Set to true for testing UI without backend, false for real backend
  MOCK_MODE: true,

  // Backend server URL (only used when MOCK_MODE = false)
  SOCKET_URL: 'https://your-backend.com',
};

export default CONFIG;
