import type { UsageDayAggregate, UsageScanAggregate } from "@/lib/ai/usage-queries";

function formatTokens(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCost(microUsd: number | null, billable: boolean): string {
  if (!billable) {
    return "$0 (free tier)";
  }
  if (microUsd == null) {
    return "—";
  }
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

export function UsageDayTable({ rows }: { rows: UsageDayAggregate[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No classification calls in the last 7 days.</p>
    );
  }

  return (
    <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-xs">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b">
            <th className="px-4 py-2.5 pr-3 font-medium">Day (UTC)</th>
            <th className="py-2.5 pr-3 font-medium">Provider</th>
            <th className="py-2.5 pr-3 font-medium">Model</th>
            <th className="py-2.5 pr-3 font-medium">Calls</th>
            <th className="py-2.5 pr-3 font-medium">Input</th>
            <th className="py-2.5 pr-3 font-medium">Output</th>
            <th className="py-2.5 pr-4 font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.day}-${row.provider}-${row.model}`}
              className="border-border/70 border-b last:border-0"
            >
              <td className="px-4 py-2.5 pr-3 whitespace-nowrap">{row.day}</td>
              <td className="py-2.5 pr-3">{row.provider}</td>
              <td className="py-2.5 pr-3 font-mono text-xs">{row.model}</td>
              <td className="py-2.5 pr-3">
                {row.calls}
                <span className="text-muted-foreground"> ({row.okCalls} ok)</span>
              </td>
              <td className="py-2.5 pr-3">{formatTokens(row.inputTokens)}</td>
              <td className="py-2.5 pr-3">{formatTokens(row.outputTokens)}</td>
              <td className="py-2.5 pr-4">{formatCost(row.microUsd, row.billable)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsageScanTable({ rows }: { rows: UsageScanAggregate[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No scan usage rows yet.</p>;
  }

  return (
    <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-xs">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b">
            <th className="px-4 py-2.5 pr-3 font-medium">Started</th>
            <th className="py-2.5 pr-3 font-medium">Trigger</th>
            <th className="py-2.5 pr-3 font-medium">Calls</th>
            <th className="py-2.5 pr-3 font-medium">Input</th>
            <th className="py-2.5 pr-3 font-medium">Output</th>
            <th className="py-2.5 pr-3 font-medium">Absent</th>
            <th className="py-2.5 pr-4 font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.scanId} className="border-border/70 border-b last:border-0">
              <td className="px-4 py-2.5 pr-3 whitespace-nowrap">
                {row.startedAt ? new Date(row.startedAt).toISOString().slice(0, 16) + "Z" : "—"}
              </td>
              <td className="py-2.5 pr-3">{row.triggerType ?? "—"}</td>
              <td className="py-2.5 pr-3">
                {row.calls}
                <span className="text-muted-foreground"> ({row.okCalls} ok)</span>
              </td>
              <td className="py-2.5 pr-3">{formatTokens(row.inputTokens)}</td>
              <td className="py-2.5 pr-3">{formatTokens(row.outputTokens)}</td>
              <td className="py-2.5 pr-3">{row.absentCalls}</td>
              <td className="py-2.5 pr-4">{formatCost(row.microUsd, row.billable)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
