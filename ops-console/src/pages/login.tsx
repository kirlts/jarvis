/**
 * Login page for Phase 1 (sandbox).
 *
 * Accepts a pre-signed JWT token directly. In production (Phase 2),
 * this will be replaced by an OAuth2/OIDC flow with proper credential input.
 *
 * The login form validates the JWT structure and RS256 algorithm
 * before storing it in sessionStorage via the authProvider.
 */
import { useLogin } from "@refinedev/core";
import { useState, type FormEvent } from "react";
import { API_URL } from "../providers/constants";

export function LoginPage() {
  const { mutate: login, isPending } = useLogin();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [isDevLoginPending, setIsDevLoginPending] = useState(false);

  async function handleDevLogin() {
    setIsDevLoginPending(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/admin/dev-login`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Dev login failed. Ensure NODE_ENV=development in backend.");
      const data = await response.json();
      login(
        { token: data.token },
        {
          onError: (err) => setError(err?.message || "Dev login failed"),
        }
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDevLoginPending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token.trim()) {
      setError("Token is required");
      return;
    }

    login(
      { token: token.trim() },
      {
        onError: (err) => {
          setError(err?.message || "Authentication failed");
        },
      }
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#0a0a0f",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          padding: "2rem",
          maxWidth: "480px",
          width: "100%",
        }}
      >
        <h1
          style={{
            color: "#e0e0e8",
            fontSize: "1.5rem",
            fontWeight: 600,
            margin: 0,
          }}
        >
          Jarvis Ops Console
        </h1>
        <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>
          Phase 1: Enter your pre-signed Admin JWT (RS256)
        </p>

        <textarea
          id="jwt-token-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJSUzI1NiIs..."
          rows={4}
          style={{
            padding: "0.75rem",
            borderRadius: "6px",
            border: "1px solid #333",
            background: "#111118",
            color: "#e0e0e8",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            resize: "vertical",
          }}
        />

        {error && (
          <p
            style={{
              color: "#ef4444",
              fontSize: "0.8rem",
              margin: 0,
              padding: "0.5rem",
              background: "rgba(239, 68, 68, 0.1)",
              borderRadius: "4px",
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
          <button
            type="submit"
            disabled={isPending || isDevLoginPending}
            style={{
              padding: "0.75rem",
              borderRadius: "6px",
              border: "none",
              background: "#6366f1",
              color: "#fff",
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
              flex: 1,
            }}
          >
            {isPending ? "Authenticating..." : "Login with Token"}
          </button>
          
          <button
            type="button"
            onClick={handleDevLogin}
            disabled={isPending || isDevLoginPending}
            style={{
              padding: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #6366f1",
              background: "transparent",
              color: "#6366f1",
              fontWeight: 600,
              cursor: isDevLoginPending ? "not-allowed" : "pointer",
              opacity: isDevLoginPending ? 0.7 : 1,
              flex: 1,
            }}
          >
            {isDevLoginPending ? "Requesting..." : "Dev Login (1-Click)"}
          </button>
        </div>
      </form>
    </div>
  );
}
