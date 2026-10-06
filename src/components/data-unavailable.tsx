import Link from 'next/link';
export function DataUnavailable() {
  return <main id="main-content" className="page-container"><section className="panel section-padding"><p className="eyebrow">Practice library</p><h1 className="mt-3">Problems are currently unavailable.</h1><p className="muted mt-4">Please try again later. Your saved interviews will be available when the service reconnects.</p><Link href="/problems" className="text-link inline-block mt-5">Back to problems →</Link></section></main>;
}
