/**
 * A printer's registration target — the mark you line a plate up against before
 * you pull a proof. It stands in for what the studio does: successive versions
 * of one page, each one registered against the last.
 */
export function RegistrationMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 0v4.2M12 19.8V24M0 12h4.2M19.8 12H24" strokeLinecap="square" />
    </svg>
  );
}
