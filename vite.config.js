import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' → GitHub Pages / 임의의 하위 경로에 정적 배포해도 동작하도록 상대 경로 빌드
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
