import { defineConfig } from "vite";
import path from "path";
import dts from "vite-plugin-dts";

const name = "index";

export default defineConfig(() => {
  return {
    build: {
      lib: {
        entry: path.resolve(__dirname, "src/index.ts"),
        name: "index",
        fileName: (format) => (format === "es" ? `${name}.mjs` : `${name}.js`),
      },
    },
    plugins: [dts({ entryRoot: "src", outDir: "dist/types" })],
  };
});
