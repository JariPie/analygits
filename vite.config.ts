import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    },
    chunkSizeWarningLimit: 1000,
    // SECURITY: Strip console logs in production builds
    // This prevents leaking sensitive debug info in the Chrome Web Store version
    minify: 'terser',
    terserOptions: {
      compress: {
        // Only strip in production mode
        drop_console: mode === 'production',
        drop_debugger: mode === 'production',
        // Keep console.warn and console.error for important runtime issues
        pure_funcs: mode === 'production'
          ? ['console.log', 'console.debug', 'console.info']
          : [],
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Define environment variables
  define: {
    // Expose build mode to runtime code
    '__DEV__': mode !== 'production',
  },
}))