type Props = {
  /** Honest status text. Callers pass the sentence the screen already used. */
  label: string;
  /** Compact card, for a gate that is still checking. Full screen is the route default. */
  compact?: boolean;
};

/**
 * Shared loading mark: a short amber rule, not a spinner.
 * Used by route fallbacks, auth gates, and the terms check.
 */
export default function LoadingState({ label, compact = false }: Props) {
  return (
    <div
      className={compact ? "load-screen load-screen-compact" : "load-screen"}
      role="status"
      aria-live="polite"
    >
      <span className="load-rule" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
