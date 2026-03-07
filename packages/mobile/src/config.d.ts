// Type declarations for config.js
export interface Config {
  MOCK_MODE?: boolean;
  WS_URL: string;
  API_URL: string;
  DLS140_URL: string;
  DEVICE_ID: string;
  TALKGROUP?: string;
  MOCK_JWT?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_CHANNEL_MAP?: string;
  DISCORD_INVITE_URL?: string;
}

export const CONFIG: Config;
export default CONFIG;
