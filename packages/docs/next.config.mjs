import { createMDX } from 'fumadocs-mdx/next';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, '../../'),
  },
};

const withMDX = createMDX({
  configPath: 'source.config.ts',
});

export default withMDX(config);
