import { readFile, writeFile } from "node:fs/promises";
// Only a disposable CI checkout may synthesize public test credentials.
async function main() {
  if (process.env.CI !== "true")
    throw new Error("CI fixture configuration requires CI=true.");
  const files = [".env", ".env.bootstrap", ".env.test", ".env.migration"];
  for (const file of files) {
    let content = await readFile(`${file}.example`, "utf8");
    content = content.replaceAll("127.0.0.1:5433", "127.0.0.1:5432");
    content += `\nEMAIL_PAYLOAD_KEY=${"12".repeat(32)}\nEMAIL_PAYLOAD_KEY_ID=test-v1\nPMP_DEPLOYMENT_ENV=test\n`;
    await writeFile(file, content, { flag: "wx" });
  }
  console.log("Disposable CI environment prepared; no secrets are printed.");
}
void main().catch(() => {
  console.error("CI fixture configuration failed.");
  process.exitCode = 1;
});
