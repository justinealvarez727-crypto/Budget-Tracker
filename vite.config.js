import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Ledger — Budget Tracker",
        short_name: "Ledger",
        description: "Track accounts, expenses, income, transfers and budgets.",
        theme_color: "#1B2521",
        background_color: "#1B2521",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell is cached; data always comes fresh from Supabase when online.
        globPatterns: ["**/*.{js,css,html,png,svg}"],
      },
    }),
  ],
});
