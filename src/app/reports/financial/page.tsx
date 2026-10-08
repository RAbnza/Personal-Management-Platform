import { ReportPage } from "@/components/reporting/report-page";
export default function FinancialReports(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReportPage view="financial" {...props} />;
}
