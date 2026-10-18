import "../../tests/setup/integration";
export default async function ready() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch("http://localhost:3100/auth/sign-in", {
        signal: AbortSignal.timeout(2000),
      });
      if (r.status === 200) return;
    } catch {
      /* Bounded cold-start retry before any fixture. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(
    "Start the isolated M6 production runtime on port 3100 before acceptance.",
  );
}
