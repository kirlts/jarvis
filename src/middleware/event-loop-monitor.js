// Event Loop Lag Monitor
// Constraint: CORE.AV.02 – event loop lag must stay <50ms under sustained load
//
// Uses Node.js built-in monitorEventLoopDelay (perf_hooks).
// Exposed via /health/event-loop for K6 verification scripts.

import { monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * Registers event loop lag monitoring and exposes a diagnostic endpoint.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export async function registerEventLoopMonitor(app) {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  // Diagnostic endpoint (not rate-limited, internal use)
  app.get('/health/event-loop', async () => {
    return {
      min_ms: (histogram.min / 1e6).toFixed(2),
      max_ms: (histogram.max / 1e6).toFixed(2),
      mean_ms: (histogram.mean / 1e6).toFixed(2),
      p99_ms: (histogram.percentile(99) / 1e6).toFixed(2),
      stddev_ms: (histogram.stddev / 1e6).toFixed(2),
    };
  });

  // Log warning if lag exceeds threshold
  const THRESHOLD_NS = 50 * 1e6; // 50ms in nanoseconds
  const interval = setInterval(() => {
    const p99 = histogram.percentile(99);
    if (p99 > THRESHOLD_NS) {
      app.log.warn({
        p99_ms: (p99 / 1e6).toFixed(2),
        threshold_ms: 50,
      }, 'Event loop lag exceeds threshold');
    }
    histogram.reset();
  }, 10_000);

  // Clean up on server close
  app.addHook('onClose', () => {
    clearInterval(interval);
    histogram.disable();
  });
}
