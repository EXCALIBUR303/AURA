export function ArrowIcon({ reset = false }: { reset?: boolean }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {reset ? <><path d="M4 5v6h6" /><path d="M4.5 11a8 8 0 1 1 1 7" /></> : <><path d="M6 18 18 6M6 6h12v12" /></>}
  </svg>;
}
