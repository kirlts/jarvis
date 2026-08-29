/**
 * ContactDirectoryPanel — EPIC-004: Directorio Agnóstico
 * 
 * Renders the contact directory for a tenant with:
 * - Paginated contact list with search
 * - Create contact modal with inline address creation
 * - Contact detail view with address management
 * - Metadata JSONB editor
 *
 * Verification: CTTO.AV.*, CTTO.FN.*, CTTO.CR.*, CTTO.IN.*
 */
import { useState, useCallback, useEffect } from "react";
import { useCustomMutation } from "@refinedev/core";
import { API_URL } from "../providers/constants";
import { getAuthHeader } from "../providers/auth";
import { PhoneInput, formatPhoneForDisplay } from "./PhoneInput";
import { JsonEditor } from "./JsonEditor";

interface Contact {
  id: string;
  tenant_id: string;
  display_name: string;
  metadata: Record<string, unknown>;
  addresses: ContactAddress[];
  created_at: string;
  deleted_at: string | null;
}

interface ContactAddress {
  id: string;
  contact_id: string;
  tenant_id: string;
  channel_type: string;
  address: string;
  created_at: string;
}

interface Props {
  tenantId: string;
  addToast: (message: string, type: "success" | "error") => void;
}

const CHANNEL_TYPES = ["phone", "email"];

export function ContactDirectoryPanel({ tenantId, addToast }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Create contact modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newMetadata, setNewMetadata] = useState("{}");
  const [newAddresses, setNewAddresses] = useState<{ channel_type: string; address: string }[]>([]);

  // Add address modal
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrChannelType, setAddrChannelType] = useState("phone");
  const [addrValue, setAddrValue] = useState("");

  // Schema keys
  const [schemaKeys, setSchemaKeys] = useState<string[]>([]);

  const { mutate: customMutate } = useCustomMutation();
  const limit = 20;

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const resp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts?${params}`, {
        headers: getAuthHeader(),
      });
      if (!resp.ok) throw new Error("Failed to fetch contacts");
      const data = await resp.json();
      setContacts(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err) {
      addToast(`Error al cargar directorio: ${(err as Error).message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, page, search, addToast]);

  const fetchSchema = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts/schema`, {
        headers: getAuthHeader(),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSchemaKeys(data.keys || []);
      }
    } catch { /* silent */ }
  }, [tenantId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { fetchSchema(); }, [fetchSchema]);

  const handleCreate = async () => {
    if (!newDisplayName.trim()) {
      addToast("Nombre requerido", "error");
      return;
    }
    let parsedMeta = {};
    try {
      parsedMeta = JSON.parse(newMetadata);
    } catch {
      addToast("Metadata JSON inválido", "error");
      return;
    }

    try {
      const resp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          display_name: newDisplayName.trim(),
          metadata: parsedMeta,
          addresses: newAddresses.filter(a => a.address.trim()),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || "Error creating contact");
      }
      addToast("Contacto creado", "success");
      setShowCreateModal(false);
      setNewDisplayName("");
      setNewMetadata("{}");
      setNewAddresses([]);
      fetchContacts();
      fetchSchema();
    } catch (err) {
      addToast(`Error: ${(err as Error).message}`, "error");
    }
  };

  const handleDelete = async (contactId: string) => {
    if (!confirm("¿Eliminar este contacto?")) return;
    try {
      const resp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts/${contactId}?confirm=true`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!resp.ok) throw new Error("Error deleting");
      addToast("Contacto eliminado", "success");
      setSelectedContact(null);
      fetchContacts();
    } catch (err) {
      addToast(`Error: ${(err as Error).message}`, "error");
    }
  };

  const handleAddAddress = async () => {
    if (!selectedContact || !addrValue.trim()) return;
    try {
      const resp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts/${selectedContact.id}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          channel_type: addrChannelType,
          address: addrChannelType === 'phone'
            ? addrValue.replace(/[^\d+]/g, "").replace(/^\+/, "")
            : addrValue.trim(),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || "Error");
      }
      addToast("Dirección agregada", "success");
      setShowAddAddress(false);
      setAddrValue("");
      // Refresh contact detail
      const detResp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts/${selectedContact.id}`, {
        headers: getAuthHeader(),
      });
      if (detResp.ok) setSelectedContact(await detResp.json());
    } catch (err) {
      addToast(`Error: ${(err as Error).message}`, "error");
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!selectedContact) return;
    try {
      const resp = await fetch(
        `${API_URL}/admin/tenants/${tenantId}/contacts/${selectedContact.id}/addresses?address_id=${addressId}`,
        { method: "DELETE", headers: getAuthHeader() }
      );
      if (!resp.ok) throw new Error("Error");
      addToast("Dirección eliminada", "success");
      const detResp = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts/${selectedContact.id}`, {
        headers: getAuthHeader(),
      });
      if (detResp.ok) setSelectedContact(await detResp.json());
    } catch (err) {
      addToast(`Error: ${(err as Error).message}`, "error");
    }
  };

  const totalPages = Math.ceil(total / limit);

  const channelIcon = (type: string) => {
    switch (type) {
      case "phone": return "📱";
      case "email": return "📧";
      default: return "🔗";
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--text-primary)" }}>Directorio de Contactos</h3>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
            {total} contacto{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
            {schemaKeys.length > 0 && ` · Campos: ${schemaKeys.join(", ")}`}
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)} id="create-contact-button">
          + Nuevo Contacto
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "var(--sp-3)" }}>
        <input
          className="form-input"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          id="contact-search-input"
          style={{ maxWidth: 320 }}
        />
      </div>

      {/* List + Detail Split */}
      <div style={{ display: "grid", gridTemplateColumns: selectedContact ? "1fr 1fr" : "1fr", gap: "var(--sp-4)" }}>
        {/* Contact List */}
        <div>
          {isLoading ? (
            <div className="skeleton skeleton-card" />
          ) : contacts.length === 0 ? (
            <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--text-tertiary)" }}>
              Sin contactos. Crea el primero.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {contacts.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  style={{
                    padding: "var(--sp-3)",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${selectedContact?.id === c.id ? "var(--accent)" : "var(--border-subtle)"}`,
                    background: selectedContact?.id === c.id ? "var(--surface-2)" : "var(--surface-1)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{c.display_name}</strong>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                      {c.addresses?.length || 0} dir.
                    </span>
                  </div>
                  {c.addresses && c.addresses.length > 0 && (
                    <div style={{ marginTop: "var(--sp-1)", display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                      {c.addresses.map((a) => (
                        <span key={a.id} className="badge badge-neutral" style={{ fontSize: "var(--text-xs)" }}>
                          {channelIcon(a.channel_type)} {a.channel_type === 'phone' ? formatPhoneForDisplay(a.address) : a.address}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", alignSelf: "center" }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </div>

        {/* Contact Detail */}
        {selectedContact && (
          <div style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "var(--sp-4)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
              <h4 style={{ margin: 0 }}>{selectedContact.display_name}</h4>
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedContact(null)}>✕</button>
              </div>
            </div>

            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: "var(--sp-3)" }}>
              {selectedContact.id}
            </div>

            {/* Metadata */}
            {Object.keys(selectedContact.metadata || {}).length > 0 && (
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <JsonEditor
                  label="Metadata"
                  value={JSON.stringify(selectedContact.metadata, null, 2)}
                  rows={4}
                />
              </div>
            )}


            {/* Addresses */}
            <div style={{ marginBottom: "var(--sp-3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                <strong style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  Direcciones ({selectedContact.addresses?.length || 0})
                </strong>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddAddress(true)}>+ Agregar</button>
              </div>
              {selectedContact.addresses?.map((addr) => (
                <div key={addr.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--sp-2)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>
                  <div>
                    <span style={{ marginRight: "var(--sp-2)" }}>{channelIcon(addr.channel_type)}</span>
                    <span className="badge badge-info" style={{ marginRight: "var(--sp-2)", fontSize: "var(--text-xs)" }}>
                      {addr.channel_type}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
                      {addr.channel_type === 'phone' ? formatPhoneForDisplay(addr.address) : addr.address}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--danger)" }}
                    onClick={() => handleDeleteAddress(addr.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--danger)" }}
              onClick={() => handleDelete(selectedContact.id)}
            >
              Eliminar contacto
            </button>
          </div>
        )}
      </div>

      {/* Create Contact Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ marginBottom: "var(--sp-4)" }}>Nuevo Contacto</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div>
                <label className="form-label">Nombre</label>
                <input
                  className="form-input"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Nombre del contacto"
                  id="new-contact-name"
                />
              </div>
              <JsonEditor
                label="Metadata (JSON)"
                value={newMetadata}
                onChange={setNewMetadata}
                rows={3}
              />
              <div>
                <label className="form-label">Direcciones</label>
                {newAddresses.map((addr, i) => (
                  <div key={i} style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
                    <select
                      className="form-input"
                      value={addr.channel_type}
                      onChange={(e) => {
                        const copy = [...newAddresses];
                        copy[i].channel_type = e.target.value;
                        setNewAddresses(copy);
                      }}
                      style={{ width: 120 }}
                    >
                      {CHANNEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {addr.channel_type === 'phone' ? (
                      <PhoneInput
                        value={addr.address}
                        onChange={(val) => {
                          const copy = [...newAddresses];
                          copy[i].address = val;
                          setNewAddresses(copy);
                        }}
                        placeholder="9 9417 2921"
                      />
                    ) : (
                      <input
                        className="form-input"
                        value={addr.address}
                        onChange={(e) => {
                          const copy = [...newAddresses];
                          copy[i].address = e.target.value;
                          setNewAddresses(copy);
                        }}
                        placeholder={addr.channel_type === "email" ? "correo@ejemplo.com" : "Dirección"}
                      />
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setNewAddresses(a => a.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setNewAddresses(a => [...a, { channel_type: "phone", address: "" }])}
                >
                  + Agregar dirección
                </button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}>
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate} id="save-contact-button">Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Address Modal */}
      {showAddAddress && selectedContact && (
        <div className="modal-overlay" onClick={() => setShowAddAddress(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: "var(--sp-3)" }}>Agregar Dirección</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div>
                <label className="form-label">Tipo de canal</label>
                <select className="form-input" value={addrChannelType} onChange={(e) => setAddrChannelType(e.target.value)}>
                  {CHANNEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Dirección</label>
                {addrChannelType === 'phone' ? (
                  <PhoneInput
                    value={addrValue}
                    onChange={setAddrValue}
                    placeholder="9 9417 2921"
                    id="add-address-phone-input"
                  />
                ) : (
                  <input
                    className="form-input"
                    value={addrValue}
                    onChange={(e) => setAddrValue(e.target.value)}
                    placeholder={addrChannelType === "email" ? "correo@ejemplo.com" : "Dirección"}
                    id="add-address-input"
                  />
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}>
              <button className="btn btn-ghost" onClick={() => setShowAddAddress(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAddAddress}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
