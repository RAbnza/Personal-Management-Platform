/** Isolated production-minified navigation runtime comparison, not route transfer
 * or hydration. Uses the already-installed tsx build tool; React and CSS excluded.
 * Actual Next route closure/security checks remain in redesign-m1-production.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild") as {
  version: string;
  buildSync(options: Record<string, unknown>): {
    outputFiles: { contents: Uint8Array }[];
  };
};
const output = resolve("out/redesign-m1-round3");
mkdirSync(output, { recursive: true });
const baseline = resolve(output, "baseline-capsule.tsx");
writeFileSync(
  baseline,
  execFileSync("git", [
    "show",
    "2b0a492be6c40b1068c312b49ce2acbfc3cca7f4:src/components/patterns/navigation-capsule.tsx",
  ]),
);
const entries = {
  previousCapsule: baseline,
  magicDock: resolve("src/components/patterns/magic-dock.tsx"),
  bothPrototypes: resolve("src/app/dev/design/product-navigation.tsx"),
};
const bundles = Object.fromEntries(
  Object.entries(entries).map(([name, path]) => {
    const result = esbuild.buildSync({
      entryPoints: [path],
      bundle: true,
      write: false,
      minify: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      external: ["react", "react-dom", "react/jsx-runtime"],
      loader: { ".css": "empty", ".module.css": "empty" },
      alias: { "@": resolve("src") },
    });
    const js = result.outputFiles[0]!.contents;
    return [name, { minifiedBytes: js.length, gzipBytes: gzipSync(js).length }];
  }),
);
const result = {
  esbuildVersion: esbuild.version,
  mode: "standalone ESM browser libraries; React external, CSS omitted; not additive route cost",
  bundles,
};
writeFileSync(
  resolve(output, "runtime-bundle.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
