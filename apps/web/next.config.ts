import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appDir = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // The app ships as static files inside Tauri: no SSR, Server Actions or API Routes.
  output: 'export',
  // Every route becomes a plain folder with an index.html.
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@mimir/ui'],
  turbopack: { root: join(appDir, '..', '..') },
};

export default config;
