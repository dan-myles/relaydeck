import type { BucketSlice } from "../../lib/usage";
import { formatCount } from "../../lib/format";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  members: string[]; // account ids
}

// Stacked bars per ten-minute bucket, one colour per provider, with failed
// attempts as a pink tick under the baseline. A table carries the same
// numbers for screen readers.
export function ActivityChart({ buckets, series, compact = false }: { buckets: BucketSlice[]; series: ChartSeries[]; compact?: boolean }) {
  const totals = buckets.map((bucket) => bucket.success + bucket.failed);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.success));
  const maxFailed = Math.max(1, ...buckets.map((bucket) => bucket.failed));
  const step = buckets.length > 12 ? 3 : buckets.length > 6 ? 2 : 1;

  return (
    <figure className={compact ? "chart is-compact" : "chart"}>
      <div className="chart-bars" aria-hidden>
        {buckets.map((bucket, index) => {
          const isNow = index === buckets.length - 1;
          return (
            <div key={bucket.span} className={isNow ? "chart-col is-now" : "chart-col"} title={`${bucket.span}: ${formatCount(totals[index])} requests, ${bucket.failed} failed`}>
              <div className="chart-stack">
                {series.map((item) => {
                  const value = item.members.reduce((sum, member) => sum + (bucket.byAccount.get(member)?.success ?? 0), 0);
                  if (value === 0) return null;
                  return <span key={item.key} className="chart-seg" style={{ height: `${(value / max) * 100}%`, background: item.color }} />;
                })}
              </div>
              <div className="chart-fail">
                {bucket.failed > 0 && <span style={{ height: `${Math.max(18, (bucket.failed / maxFailed) * 100)}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="chart-axis" aria-hidden>
        {buckets.map((bucket, index) => {
          const isNow = index === buckets.length - 1;
          const show = isNow || (index % step === 0 && buckets.length - 1 - index >= step);
          // Every other label is dropped on narrow screens.
          const minor = !isNow && (index / step) % 2 === 1;
          return (
            <span key={bucket.span} className={isNow ? "is-now" : minor ? "is-minor" : undefined}>
              {show ? (isNow ? "now" : bucket.label) : ""}
            </span>
          );
        })}
      </div>
      <div className="visually-hidden">
      <table>
        <caption>Requests per ten minutes</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {series.map((item) => (
              <th scope="col" key={item.key}>
                {item.label}
              </th>
            ))}
            <th scope="col">Failed</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.span}>
              <th scope="row">{bucket.span}</th>
              {series.map((item) => (
                <td key={item.key}>{item.members.reduce((sum, member) => sum + (bucket.byAccount.get(member)?.success ?? 0), 0)}</td>
              ))}
              <td>{bucket.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="legend" aria-label="Legend">
      {series.map((item) => (
        <li key={item.key}>
          <span className="legend-swatch" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
      <li>
        <span className="legend-swatch legend-failed" aria-hidden />
        Failed
      </li>
    </ul>
  );
}
