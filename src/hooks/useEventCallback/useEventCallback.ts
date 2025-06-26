// import { useRef, useEffect, useCallback } from 'react';

// export function useEventCallback<T extends (...args: any[]) => any>(fn: T): T {
//     const ref = useRef(fn);
//     useEffect(() => {
//         ref.current = fn;
//     });
//     return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
// }
import { useRef, useLayoutEffect, useCallback, useEffect } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined'
    ? useLayoutEffect
    : useEffect;

/**
 * Returns a stable function identity that always calls the latest version of the given callback.
 * Useful for avoiding stale closures inside event handlers passed to external systems.
 */
export function useEventCallback<T extends (...args: any[]) => any>(fn: T | undefined): T {
  const ref = useRef(fn);

  // Update ref.current to the latest version of fn on every render
  useIsomorphicLayoutEffect(() => {
    ref.current = fn;
  });

  // Return a stable function that always calls ref.current
  return useCallback(((...args: any[]) => {
    return ref.current?.(...args);
  }) as T, []);
}