import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function assetManifestPlugin(): Plugin {
  // Respeita --outDir / build.outDir em vez de assumir "dist".
  let distDir = path.resolve(import.meta.dirname, 'dist');
  return {
    name: 'asset-manifest-generator',
    apply: 'build',
    configResolved(config) {
      distDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const assetsDir = path.join(distDir, 'assets');
      const templatePath = path.resolve(import.meta.dirname, 'src/sw.template.js');

      if (!fs.existsSync(assetsDir) || !fs.existsSync(templatePath)) return;

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

      // Injeta versão do build e lista de assets diretamente no Service Worker gerado em dist/sw.js
      let swTemplate = fs.readFileSync(templatePath, 'utf8');
      // Substituição por função: com string, "$&", "$'" etc. num nome de arquivo corromperiam o sw.js.
      const precacheJson = JSON.stringify(manifestList, null, 2);
      swTemplate = swTemplate
        .replace('__BUILD_VERSION__', () => buildVersion)
        .replace('__PRECACHE_ASSETS__', () => precacheJson);

      fs.writeFileSync(path.join(distDir, 'sw.js'), swTemplate, 'utf8');

      // Mantém asset-manifest.json para depuração e inspeção do deploy
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
