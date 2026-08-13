import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/* Served from https://sciloupe.com — a domain root, so assets are absolute
 * from "/". This was "/PaperGUI/" while the site lived on the github.io
 * project path; the two are mutually exclusive, and the wrong one is a blank
 * page rather than a visible error, because every asset 404s and nothing gets
 * far enough to report it. The custom domain is pinned by public/CNAME, which
 * Vite copies into the build. */
export default defineConfig(() => ({
  base: "/",
  plugins: [react(), tailwindcss()],
}));
