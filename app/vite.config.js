import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        legacy({
            targets: ['safari >= 13', 'ios_saf >= 13', 'chrome >= 75', 'firefox >= 78'],
            modernPolyfills: true,
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        target: ['es2015', 'safari13'],
        cssTarget: ['safari13'],
    },
});
