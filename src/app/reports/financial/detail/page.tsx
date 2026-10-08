import { ReportPage } from "@/components/reporting/report-page";
export default function FinancialDetail(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReportPage view="detail" {...props} />;
}
