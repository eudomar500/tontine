import { useEffect, useState, useRef, RefObject } from 'react';

/**
 * Hook to trigger entry-into-viewport animations using IntersectionObserver.
 * Returns a ref to attach to the observed DOM node and a boolean visibility state.
 */
export function useScrollReveal(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [hasRevealed, setHasRevealed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasRevealed(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    const element = ref.current;
    if (element) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, hasRevealed];
}
