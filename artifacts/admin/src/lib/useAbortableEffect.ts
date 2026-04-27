import { useEffect, useRef } from "react";

/**
 * useAbortableEffect — small wrapper around useEffect that hands the
 * effect callback an `AbortSignal` and cancels it on unmount or when the
 * dependency list changes.
 *
 * Use this for `fetch` calls that live inside `useEffect` so React can
 * cancel in-flight requests when the component unmounts. This prevents
 * the classic "Can't perform a React state update on an unmounted
 * component" warning and the associated memory leak.
 *
 * @example
 * useAbortableEffect((signal) => {
 *   fetch("/api/example", { signal })
 *     .then(r => r.json())
 *     .then(setData)
 *     .catch(err => {
 *       if (err.name === "AbortError") return;
 *       console.error("[Example] fetch failed:", err);
 *     });
 * }, []);
 */
export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | (() => void),
  deps: React.DependencyList,
): void {
  // Stable reference to the effect so eslint doesn't complain about
  // missing deps. We intentionally let the caller manage `deps`.
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const controller = new AbortController();
    const cleanup = effectRef.current(controller.signal);
    return () => {
      controller.abort();
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Returns true if the given error was caused by an AbortController.abort()
 * call. Use this in `.catch` handlers to silently swallow the abort
 * without re-logging it.
 */
export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (typeof err === "object" && err !== null && "name" in err) {
    return (err as { name?: string }).name === "AbortError";
  }
  return false;
}
