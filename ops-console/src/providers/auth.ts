/**
 * Auth provider for Jarvis Admin API (JWT RS256).
 *
 * Security constraints (AAPI.IN.02, AAPI.CR.01):
 * - Token stored in sessionStorage (not localStorage) to limit exposure.
 *   sessionStorage is cleared when the browser tab closes, reducing the
 *   window of token theft via XSS compared to localStorage.
 * - Token must use RS256 algorithm exclusively (verified server-side).
 *
 * Phase 1 (sandbox): Login uses a pre-signed JWT generated from the
 * ADMIN_JWT_PRIVATE_KEY in docker-compose.yml. In production, this will
 * be replaced by an OAuth2/OIDC flow or a dedicated auth endpoint.
 */
import type { AuthProvider } from "@refinedev/core";
import { API_URL } from "./constants";

const TOKEN_KEY = "jarvis_admin_token";

/**
 * Retrieve the stored JWT token from sessionStorage.
 * Returns null if no token exists.
 */
export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Build the Authorization header object for fetch requests.
 * Returns an empty object if no token is stored.
 */
export function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Decode JWT payload without verification (client-side display only).
 * Server-side RS256 verification is the security boundary.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired based on its `exp` claim.
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  // 30-second buffer to avoid edge-case race conditions
  return Date.now() >= (payload.exp - 30) * 1000;
}

export const authProvider: AuthProvider = {
  login: async ({ token }: { token: string }) => {
    // Phase 1: Accept a pre-signed JWT directly.
    // Phase 2: This will be replaced by a POST /admin/auth/login flow.
    if (!token) {
      throw new Error("No token provided");
    }

    // Validate JWT structure (3 dot-separated parts)
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    // Decode and verify the algorithm claim is RS256
    const header = JSON.parse(atob(parts[0]));
    if (header.alg !== "RS256") {
      throw new Error(`Unsupported algorithm: ${header.alg}. Only RS256 is accepted.`);
    }

    // Verify token is not expired
    if (isTokenExpired(token)) {
      throw new Error("Token is expired");
    }

    sessionStorage.setItem(TOKEN_KEY, token);
    return {
      success: true,
      redirectTo: "/",
    };
  },

  logout: async () => {
    sessionStorage.removeItem(TOKEN_KEY);
    return {
      success: true,
      redirectTo: "/login",
    };
  },

  check: async () => {
    const token = getStoredToken();
    if (!token) {
      return {
        authenticated: false,
        redirectTo: "/login",
      };
    }

    if (isTokenExpired(token)) {
      sessionStorage.removeItem(TOKEN_KEY);
      return {
        authenticated: false,
        redirectTo: "/login",
        error: {
          name: "SessionExpired",
          message: "Your session has expired. Please log in again.",
        },
      };
    }

    return { authenticated: true };
  },

  getIdentity: async () => {
    const token = getStoredToken();
    if (!token) return null;

    const payload = decodeJwtPayload(token);
    if (!payload) return null;

    return {
      id: (payload.sub as string) || "admin",
      name: (payload.name as string) || "Super Admin",
      role: (payload.role as string) || "super_admin",
    };
  },

  getPermissions: async () => {
    const token = getStoredToken();
    if (!token) return null;

    const payload = decodeJwtPayload(token);
    return payload?.role || null;
  },

  onError: async (error) => {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) {
      sessionStorage.removeItem(TOKEN_KEY);
      return {
        logout: true,
        redirectTo: "/login",
        error: {
          name: "Unauthorized",
          message: "Your session is invalid. Please log in again.",
        },
      };
    }
    return { error };
  },
};
