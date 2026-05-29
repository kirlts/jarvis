/**
 * When using Vite dev proxy (default), leave API_URL empty so requests
 * go to /admin/* on the same origin and the proxy forwards them.
 *
 * For direct API access, set VITE_API_URL=http://localhost:3000.
 */
export const API_URL = import.meta.env.VITE_API_URL || "";
