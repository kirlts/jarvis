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
      if (!response.ok) throw new Error("Login de desarrollo falló. Asegurar NODE_ENV=development en el backend.");
      const data = await response.json();
      login(
        { token: data.token },
        {
          onError: (err) => setError(err?.message || "Login de desarrollo falló"),
        }
      );
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsDevLoginPending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token.trim()) {
      setError("El token es obligatorio");
      return;
    }

    login(
      { token: token.trim() },
      {
        onError: (err) => {
          setError(err?.message || "Autenticación fallida");
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
        background: "var(--surface-0)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-5)",
          padding: "var(--sp-8)",
          maxWidth: "480px",
          width: "100%",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
            <div className="sidebar-brand-icon">J</div>
            <h1 className="page-title" style={{ fontSize: 'var(--text-xl)' }}>
              Jarvis — Consola de Operaciones
            </h1>
          </div>
          <p className="page-subtitle">
            Fase 1: Ingresa tu JWT de administrador pre-firmado (RS256)
          </p>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="jwt-token-input">Token JWT Admin</label>
          <textarea
            id="jwt-token-input"
            className="form-input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="eyJhbGciOiJSUzI1NiIs..."
            rows={3}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
            }}
          />
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 0 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending || isDevLoginPending}
            style={{ flex: 1, justifyContent: 'center' }}
            id="login-submit-button"
          >
            {isPending ? "Autenticando…" : "Ingresar con token"}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDevLogin}
            disabled={isPending || isDevLoginPending}
            style={{ flex: 1, justifyContent: 'center' }}
            id="dev-login-button"
          >
            {isDevLoginPending ? "Solicitando…" : "Login Dev (1-Click)"}
          </button>
        </div>
      </form>
    </div>
  );
}
