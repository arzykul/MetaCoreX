export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      data-testid="indicator-live"
      data-connected={connected}
    >
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
        />
      </span>
      <span className={connected ? "text-emerald-600" : "text-muted-foreground"}>
        {connected ? "Live" : "Reconnecting…"}
      </span>
    </span>
  );
}
