'use client';
export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="panel section-padding"><h1>Unable to load admin content.</h1><p className="muted mt-4">Please try again. Your access will be checked again.</p><button type="button" className="button button-primary mt-5" onClick={reset}>Try again</button></section>;
}
