/**
 * Yields execution to the browser's Main Thread.
 * Utilizes the Prioritized Task Scheduling API (window.scheduler.yield) 
 * if available, falling back to setTimeout and requestAnimationFrame.
 * This ensures user interactions (clicks, keypresses) are processed instantly.
 * 
 * @param {Function} callback - The heavy UI update function to run.
 */
export function yieldToMainThread(callback) {
  if (typeof window !== 'undefined') {
    if (window.scheduler && window.scheduler.yield) {
      window.scheduler.yield().then(() => {
        requestAnimationFrame(callback);
      });
    } else {
      setTimeout(() => {
        requestAnimationFrame(callback);
      }, 0);
    }
  } else {
    callback();
  }
}

/**
 * Optimizes event execution by wrapping the handler with a main thread yield.
 * Helps keep Interaction to Next Paint (INP) close to 0 ms.
 * 
 * @param {Function} handler - Event handler callback.
 * @returns {Function} Optimized handler.
 */
export function optimizedHandler(handler) {
  return (...args) => {
    yieldToMainThread(() => {
      handler(...args);
    });
  };
}
