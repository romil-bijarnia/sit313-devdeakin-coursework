import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep the initial application chunk small enough for a responsive first load.
// Firebase and the major UI libraries are cached independently by the browser.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/firebase/firestore/') || id.includes('/@firebase/firestore/') || id.includes('/@firebase/webchannel-wrapper/')) return 'firebase-firestore';
          if (id.includes('/firebase/auth/') || id.includes('/@firebase/auth/')) return 'firebase-auth';
          if (id.includes('/firebase/storage/') || id.includes('/@firebase/storage/')) return 'firebase-storage';
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase-core';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-vendor';
          if (id.includes('/lucide-react/')) return 'icons';
          return 'vendor';
        }
      }
    }
  }
});
