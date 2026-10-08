import { ReportPage } from "@/components/reporting/report-page";
export default function CareerReports(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReportPage view="career" {...props} />;
}
