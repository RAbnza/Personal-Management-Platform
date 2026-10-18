/** Run inside the supported Linux build image. Measures unique client-reference
 * chunks, not browser transfer/hydration or independently additive libraries. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
const routes = [
  "auth/sign-in",
  "",
  "calendar",
  "reports/financial",
  "reports/career",
  "money/forecasts",
  "trackers/reports",
];
const results = routes.map((route) => {
  const sandbox = {};
  const key = `/${route ? route + "/" : ""}page`;
  runInNewContext(
    readFileSync(
      `.next-release/server/app/${route ? route + "/" : ""}page_client-reference-manifest.js`,
      "utf8",
    ),
    sandbox,
  );
  const manifest = sandbox.__RSC_MANIFEST[key];
  const chunks = [
    ...new Set(
      Object.values(manifest.clientModules)
        .flatMap((entry) => entry.chunks)
        .filter((file) => file.endsWith(".js")),
    ),
  ];
  const sizes = chunks.map((file) => {
    const bytes = readFileSync(
      resolve(".next-release", file.replace("/_next/", "")),
    );
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  });
  return {
    route: "/" + route,
    chunks: chunks.length,
    rawBytes: sizes.reduce((n, s) => n + s.raw, 0),
    gzipBytes: sizes.reduce((n, s) => n + s.gzip, 0),
  };
});
const result = {
  buildId: readFileSync(".next-release/BUILD_ID", "utf8").trim(),
  definition:
    "Unique client-reference JS chunks gzipped individually; not network or hydration",
  results,
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
