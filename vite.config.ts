// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Path absolut ke paket npm `buffer` (polyfill browser untuk web3.js).
const BUFFER_PKG = fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url));

// web3.js, spl-memo, bn.js, dll. mengimpor "buffer"; tanpa plugin ini build browser
// mengubahnya menjadi stub kosong "node:buffer" → transaksi Phantom gagal
// ("Buffer is not defined"). Plugin ini (enforce: "pre") mengarahkan "buffer" dan
// "node:buffer" ke paket npm `buffer`, HANYA untuk bundle browser.
const BUFFER_RE = /^(node:)?buffer\/?$/;
const browserBuffer = {
  name: "aidtrace-browser-buffer",
  enforce: "pre" as const,
  apply: "build" as const, // mode dev ditangani optimizeDeps (lihat di bawah)
  resolveId(id: string, _importer?: string, opts?: { ssr?: boolean }) {
    // @ts-expect-error -- `this.environment` tersedia di Vite 6+
    const env: string | undefined = this?.environment?.name;
    const isServer = opts?.ssr || (env !== undefined && env !== "client");
    if (!isServer && BUFFER_RE.test(id)) return BUFFER_PKG;
    return null;
  },
};

export default defineConfig({
  vite: {
    plugins: [browserBuffer],
    optimizeDeps: {
      include: [
        "lucide-react",
        "sonner",
        "zod",
        "@radix-ui/react-label",
        "@radix-ui/react-slot",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
        "buffer",
      ],
      // Mode dev: saat pre-bundle dependensi (web3.js dll.), arahkan "buffer" ke paket npm.
      rolldownOptions: {
        plugins: [
          {
            name: "aidtrace-dev-buffer",
            resolveId: (id: string) => (BUFFER_RE.test(id) ? BUFFER_PKG : null),
          },
        ],
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
