import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  base: "./", //Use relative paths so it works at any mount path
  plugins: [react()],
  publicDir: "public",
  resolve: {
    // The linked voice-ui-kit ships with its own copies of these
    // packages (pnpm-locked). Without deduping, Vite resolves each
    // layer's imports separately, you get two React instances, and you
    // see "Invalid hook call" at runtime. Force every layer through
    // this client's node_modules.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@pipecat-ai/client-js",
      "@pipecat-ai/client-react",
    ],
  },
  server: {
    allowedHosts: true, // Allows external connections like ngrok
    proxy: {
      // Proxy /api requests to the backend server
      "/api": {
        target: "http://0.0.0.0:7860", // Replace with your backend URL
        changeOrigin: true,
      },
      "/start": {
        target: "http://0.0.0.0:7860", // Replace with your backend URL
        changeOrigin: true,
      },
      "/sessions": {
        target: "http://0.0.0.0:7860", // Replace with your backend URL
        changeOrigin: true,
      },
    },
  },
});
