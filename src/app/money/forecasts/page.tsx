import Link from "next/link";
import { debtWorkspace } from "../debts/_workspace";
import {
  getForecast,
  type Forecast,
} from "@/modules/planning/services/get-forecast";
import { forecastRangeSchema } from "@/modules/planning/domain/forecast";
import { ForecastExplorer } from "@/components/money/forecast-explorer";
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await debtWorkspace(),
    q = forecastRangeSchema.safeParse(await searchParams);
  if (!q.success)
    return (
      <div>
        <h1 className="text-2xl font-semibold">Check forecast dates</h1>
        <Link className="text-link underline" href="/money/forecasts">
          Return to forecasts
        </Link>
      </div>
    );
  let data: Forecast;
  try {
    data = await getForecast({
      userId: user.id,
      workspaceId: workspace.id,
      scenario: q.data,
    });
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return (
      <div>
        <h1 className="text-2xl font-semibold">Check forecast range</h1>
        <p role="alert">{e.message}</p>
        <Link className="text-link underline" href="/money/forecasts">
          Return to forecasts
        </Link>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-6 break-words">
      <h1 className="text-2xl font-semibold">Forecasts</h1>
      <ForecastExplorer
        key={`${data.generatedAt}:${data.financialRevision}`}
        initial={data}
      />
    </div>
  );
}
