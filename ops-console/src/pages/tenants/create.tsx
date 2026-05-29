import { useCreate, useNavigation } from "@refinedev/core";
import { useState, type FormEvent } from "react";

export function TenantCreatePage() {
  const { mutate: createTenant } = useCreate();
  const { list } = useNavigation();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    setIsPending(true);
    createTenant(
      {
        resource: "tenants",
        values: { name: name.trim() },
      },
      {
        onSuccess: () => {
          list("tenants"); // Refine resource name stays in English
        },
        onError: (err) => {
          setError(err?.message || "Error al crear usuario");
          setIsPending(false);
        },
      }
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nuevo Usuario</h1>
          <p className="page-subtitle">Registrar un nuevo usuario en el sistema</p>
        </div>
      </div>

      <div
        style={{
          maxWidth: "480px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--sp-6)",
        }}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="tenant-name-input">
              Nombre del usuario
            </label>
            <input
              id="tenant-name-input"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Clínica Salud Integral"
              maxLength={255}
              autoFocus
            />
          </div>

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--sp-3)" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => list("tenants")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
              id="submit-tenant-button"
            >
              {isPending ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
