import { useId, useMemo } from "react";
import { minorToMajor } from "../../lib/financial.js";

const width = 720;
const height = 260;
const padding = 24;

function chartGeometry(points) {
  const values = points.flatMap((point) => [point.metrics.revenueMinor, point.metrics.netProfitMinor]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = maximum - minimum || 1;
  const x = (index) => padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
  const y = (value) => height - padding - ((value - minimum) / range) * (height - padding * 2);
  const polyline = (key) => points.map((point, index) => `${x(index)},${y(point.metrics[key])}`).join(" ");
  return { minimum, maximum, zeroY: y(0), revenue: polyline("revenueMinor"), profit: polyline("netProfitMinor") };
}

export function FinancialTrendChart({ points, currencyCode, labels, formatCurrency }) {
  const titleId = useId();
  const descriptionId = useId();
  const geometry = useMemo(() => chartGeometry(points), [points]);
  const first = points[0]?.label;
  const last = points.at(-1)?.label;

  return (
    <div className="financial-chart">
      <div className="financial-chart__legend" aria-hidden="true">
        <span>
          <i className="financial-chart__key financial-chart__key--revenue" />
          {labels.revenue}
        </span>
        <span>
          <i className="financial-chart__key financial-chart__key--profit" />
          {labels.profit}
        </span>
      </div>
      <svg
        className="financial-chart__plot"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{labels.title}</title>
        <desc id={descriptionId}>{labels.description}</desc>
        <line
          className="financial-chart__zero"
          x1={padding}
          x2={width - padding}
          y1={geometry.zeroY}
          y2={geometry.zeroY}
        />
        <polyline className="financial-chart__line financial-chart__line--revenue" points={geometry.revenue} />
        <polyline className="financial-chart__line financial-chart__line--profit" points={geometry.profit} />
      </svg>
      <div className="financial-chart__axis" aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </div>
      <table className="sr-only">
        <caption>{labels.tableCaption}</caption>
        <thead>
          <tr>
            <th>{labels.period}</th>
            <th>{labels.revenue}</th>
            <th>{labels.profit}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.from}>
              <th>{point.label}</th>
              <td>
                {formatCurrency(minorToMajor(point.metrics.revenueMinor, currencyCode), { currency: currencyCode })}
              </td>
              <td>
                {formatCurrency(minorToMajor(point.metrics.netProfitMinor, currencyCode), { currency: currencyCode })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
