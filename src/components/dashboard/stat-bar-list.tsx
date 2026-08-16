interface StatBarListProps {
  data: { label: string; count: number }[];
  emptyMessage?: string;
}

export function StatBarList({ data, emptyMessage = "Sin datos todavía." }: StatBarListProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span>{d.label}</span>
            <span className="text-muted-foreground tabular-nums">{d.count}</span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full" role="presentation">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
