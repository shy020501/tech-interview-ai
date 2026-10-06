'use client';

import { useEffect, useRef } from 'react';

/** Reveal an editor when it opens or its selected item changes, not while typing. */
export function useEditorScroll<T extends HTMLElement>(openKey: string | boolean | null = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (openKey === null || openKey === false) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [openKey]);

  return ref;
}
