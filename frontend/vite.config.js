import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,        // ← เพิ่มบรรทัดนี้ ให้มือถือในวง WiFi เข้าถึงได้
    port: 5173,
    strictPort: true,  // ← (ไม่บังคับ) ถ้าพอร์ต 5173 ถูกใช้อยู่ ให้ error แทนที่จะเปลี่ยนพอร์ตเอง
  },

  optimizeDeps: {
    include: ['leaflet'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
});