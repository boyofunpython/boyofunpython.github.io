import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  publicDir: "public",
  worker: { format: "es" },
  build: {
    target: "es2022",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "peerjs", test: /node_modules\/peerjs\// }],
        },
      },
    },
  },
});
