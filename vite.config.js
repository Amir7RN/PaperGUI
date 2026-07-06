import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from https://<user>.github.io/PaperGUI/ in production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/PaperGUI/" : "/",
  plugins: [react(), tailwindcss()],
}));
