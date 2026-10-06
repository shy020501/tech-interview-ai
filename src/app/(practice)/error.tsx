'use client';
export default function PracticeError({ reset }: { reset: () => void }) {
  return <main id="main-content" className="page-container"><section className="panel section-padding"><h1>Unable to load this page.</h1><p className="muted mt-4">Please try again. Your previously saved conversation remains in your account.</p><button type="button" onClick={reset} className="button button-primary mt-5">Try again</button></section></main>;
}
