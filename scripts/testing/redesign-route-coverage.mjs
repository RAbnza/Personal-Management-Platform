import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? pages(join(dir, e.name))
      : e.name === "page.tsx"
        ? [join(dir, e.name)]
        : [],
  );
}
const read = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const audit = read("out/m6-route-acceptance.json");
const publicRoutes = read("out/m6-public-acceptance.json").map((r) => r.path);
const shared = read("out/m6-sharing-routes.json");
const visited = [
  ...new Set(
    [...audit.routes, ...publicRoutes, ...shared].map(
      (r) => new URL(r, "http://localhost:3100").pathname,
    ),
  ),
];
const inventory = pages("src/app").map((file) => {
  const route =
    "/" +
    relative("src/app", file)
      .replaceAll("\\", "/")
      .replace(/(?:^|\/)page\.tsx$/, "");
  const pattern =
    route
      .split("/")
      .filter(Boolean)
      .map((s) =>
        s.startsWith("[[...")
          ? "(?:/.*)?"
          : s.startsWith("[...")
            ? "/.+"
            : s.startsWith("[")
              ? "/[^/]+"
              : "/" + s,
      )
      .join("") || "/";
  return {
    route,
    covered:
      route === "/dev/design"
        ? "production-404"
        : visited.some((path) => new RegExp("^" + pattern + "$").test(path)),
  };
});
const missing = inventory.filter((r) => r.covered === false);
const result = {
  sourcePageFiles: inventory.length,
  visitedPaths: visited.length,
  missing,
  inventory,
};
writeFileSync("out/m6-route-coverage.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      sourcePageFiles: inventory.length,
      visitedPaths: visited.length,
      missing,
    },
    null,
    2,
  ),
);
if (missing.length) process.exitCode = 1;
