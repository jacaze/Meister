import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function assetManifestPlugin(): Plugin {
  return {
    name: 'asset-manifest-generator',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const assetsDir = path.join(distDir, 'assets');

      if (!fs.existsSync(assetsDir)) return;

      const assetFiles = fs.readdirSync(assetsDir);
      const manifestList = [
        '/',
        '/index.html',
        '/favicon.svg',
        '/manifest.webmanifest',
        '/icon-192.png',
        '/icon-512.png',
        '/icon-maskable-192.png',
        '/icon-maskable-512.png',
        ...assetFiles.map((file) => `/assets/${file}`),
      ];

      // Computa hash do build a partir do conteúdo dos arquivos de assets para versão única do cache
      const hash = crypto.createHash('md5');
      for (const file of assetFiles) {
        const filePath = path.join(assetsDir, file);
        try {
          hash.update(fs.readFileSync(filePath));
        } catch {}
      }
      const buildVersion = hash.digest('hex').slice(0, 10);

      const manifestData = {
        version: buildVersion,
        assets: manifestList,
      };

      fs.writeFileSync(
        path.join(distDir, 'asset-manifest.json'),
        JSON.stringify(manifestData, null, 2),
        'utf8'
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    assetManifestPlugin(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
