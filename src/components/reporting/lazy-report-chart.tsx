"use client";
import dynamic from "next/dynamic";
const ReportChart = dynamic(() => import("./report-chart"), {
  ssr: false,
  loading: () => (
    <p role="status" className="min-h-72">
      Loading chart. Exact data is available in the table below.
    </p>
  ),
});
const CategoryChart = dynamic(
  () => import("./report-chart").then((m) => m.CategoryChart),
  {
    ssr: false,
    loading: () => (
      <p role="status">
        Loading category chart. Exact values are in the table.
      </p>
    ),
  },
);
export function LazyCategoryChart(
  props: Parameters<typeof import("./report-chart").CategoryChart>[0],
) {
  return <CategoryChart {...props} />;
}
export function LazyReportChart(
  props: Parameters<typeof import("./report-chart").default>[0],
) {
  return <ReportChart {...props} />;
}
