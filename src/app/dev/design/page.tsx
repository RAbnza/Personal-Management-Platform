import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignProofs } from "./proofs";

export const metadata: Metadata = {
  title: "M1 design review · Personal workspace",
  robots: { index: false, follow: false },
};

export default async function DesignReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Never opt a public deployment into this route with a feature flag.
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const screen = typeof query.screen === "string" ? query.screen : "home";
  const record = typeof query.record === "string" ? query.record : undefined;
  const treatment = query.treatment === "gallery" ? "gallery" : "porcelain";
  const navigation = query.nav === "radix" ? "radix" : "dock";
  const darkTreatment = query.dark === "graphite" ? "graphite" : "midnight";
  const stage = query.stage === "review" ? "review" : "draft";
  return (
    <DesignProofs
      screen={screen}
      navigation={navigation}
      darkTreatment={darkTreatment}
      treatment={treatment}
      stage={stage}
      {...(record ? { record } : {})}
    />
  );
}
