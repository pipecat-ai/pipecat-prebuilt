import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./", //Use relative paths so it works at any mount path
  plugins: [react(), tailwindcss()],
  publicDir: "public",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
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
