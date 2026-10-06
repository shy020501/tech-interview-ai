import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="page-container"><p className="eyebrow">404 / Not available</p><h1 className="mt-3">This page is not available.</h1><p className="muted mt-4 mb-6">The problem may be unpublished, archived, or the address may be incorrect.</p><Link href="/problems" className="button button-primary">Return to the problem library</Link></main>;
}
