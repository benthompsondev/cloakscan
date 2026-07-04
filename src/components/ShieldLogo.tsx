/** CloakGuard shield mark: a shield with a redaction bar. */
export function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" className="brand-mark" role="img" aria-label="CloakGuard logo">
      <path
        d="M12 2 20 5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V5l8-3Z"
        fill="var(--accent-dim)"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="7.5" y="10" width="9" height="3" rx="1.5" fill="var(--accent)" />
    </svg>
  );
}
