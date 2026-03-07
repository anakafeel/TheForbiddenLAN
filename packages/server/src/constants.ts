import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(__dirname, '../../data');
export const AVATARS_DIR = path.resolve(DATA_DIR, 'avatars');

// Ensure the directory exists at module load time
fs.mkdirSync(AVATARS_DIR, { recursive: true });
