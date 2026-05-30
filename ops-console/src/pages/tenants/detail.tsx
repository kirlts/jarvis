/**
 * Tenant Detail Page — B.3, B.5, B.7, B.8 & WhatsApp Onboarding Loop (Zero-CLI Mandate)
 *
 * Features:
 * - Profile card with inline name editing (B.3)
 * - Status toggle (B.5)
 * - Stats overview: sessions, inbox, storage (B.7)
 * - Config JSON editor (B.8)
 * - Restore button for deleted tenants (B.6)
 * - Integrated WhatsApp Connection tab (C.1 - C.8 onboarding lifecycle)
 * - Monospace audit logging modal.
 */
import { useOne, useUpdate, useCustom, useList, useDelete, useInvalidate, useCustomMutation } from "@refinedev/core";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { useToast } from "../../components/toast";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";
import { useWhatsAppSSE } from "../../hooks/useWhatsAppSSE";
import { formatJid, resolveBrowserUrl, formatBytes, timeAgo, copyToClipboard as copyToClipboardUtil, buildTimelineEvents, groupTimelineEvents, extractSearchTerm } from "./timeline-utils";
import { ChannelDetailPanel } from "../../components/ChannelDetailPanel";

interface Tenant {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

// formatJid, resolveBrowserUrl imported from ./timeline-utils

interface TenantStats {
  sessions: number;
  inbox: { total: number; pending: number };
  storage: { files: number; bytes: string };
}

interface WappChannel {
  id: string;
  tenant_id: string;
  name: string;
  phone_number: string | null;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  session_id: string | null;
  session_status: string | null;
  qr_code: string | null;
  qr_generated_at: string | null;
  qr_scanned_at: string | null;
  qr_scanned_by: string | null;
  session_updated_at: string | null;
}

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  details: { message?: string } | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: "badge-success",
  suspended: "badge-warning",
  trial: "badge-info",
  connected: "badge-success",
  disconnected: "badge-danger",
  connecting: "badge-warning",
  qr_pending: "badge-info",
  qr_expired: "badge-warning",
  waiting_qr: "badge-info",
};

const STATUS_DOT: Record<string, string> = {
  connected: "dashboard-dot-success",
  disconnected: "dashboard-dot-danger",
  connecting: "dashboard-dot-warning",
  qr_pending: "dashboard-dot-info",
  qr_expired: "dashboard-dot-warning",
  waiting_qr: "dashboard-dot-info",
};

// formatBytes, timeAgo imported from ./timeline-utils

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboardUtil(text);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? '✓ Copiado' : '📋 Copiar'}
    </button>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const { query: tenantQuery } = useOne<Tenant>({
    resource: "tenants",
    id: id!,
  });

  const { result: statsResult } = useCustom<TenantStats>({
    url: '',
    method: 'get',
    meta: { rawUrl: `/admin/tenants/${id}/stats` },
    queryOptions: { queryKey: ['tenant-stats', id], enabled: !!id },
  });

  const { mutate: updateTenant } = useUpdate();
  const { mutate: deleteSession } = useDelete();
  const { mutate: deleteTenant } = useDelete();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'whatsapp'>('overview');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [configError, setConfigError] = useState('');
  
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [showJson, setShowJson] = useState(false);

  const [generatedToken, setGeneratedToken] = useState("");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [ttlValue, setTtlValue] = useState<number>(24);

  // WhatsApp Multichannel State
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState<WappChannel | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const { mutate: createChannelMutate } = useCustomMutation();

  // Timeline UI State
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [mediaItems, setMediaItems] = useState<{ url: string; mime_type: string; file_name: string }[]>([]);
  const [expandedMedia, setExpandedMedia] = useState<Set<string>>(new Set());

  const copyToClipboard = copyToClipboardUtil;

  // Fetch Tenant Event History
  // Real-time updates driven by SSE → PG LISTEN/NOTIFY (tenant_activity channel).
  // No polling needed — the SSE callback triggers explicit refetches.
  const { result: auditResult, query: auditQuery } = useList({
    resource: "audit",
    filters: [{ field: "resource_id", operator: "eq", value: id }],
    pagination: { currentPage: 1, pageSize: 50 },
    queryOptions: { enabled: activeTab === 'overview' && !!id },
  });
  const auditData = auditResult?.data;
  const isAuditLoadingList = auditQuery.isLoading;

  const { result: jobsResult, query: jobsQuery } = useList({
    resource: "jobs",
    filters: [{ field: "tenant_id", operator: "eq", value: id }],
    pagination: { currentPage: 1, pageSize: 50 },
    queryOptions: { enabled: activeTab === 'overview' && !!id },
  });
  const jobsData = jobsResult?.data;
  const isJobsLoading = jobsQuery.isLoading;

  const { result: inboxResult, query: inboxQuery } = useList({
    resource: "inbox",
    filters: [{ field: "tenant_id", operator: "eq", value: id }],
    pagination: { currentPage: 1, pageSize: 50 },
    queryOptions: { enabled: activeTab === 'overview' && !!id },
  });
  const inboxData = inboxResult?.data;
  const isInboxLoading = inboxQuery.isLoading;

  // Fetch WhatsApp channels via useCustom (sub-resource under tenant, per RULES.md)
  const { query: wappQuery, result: channelsResult } = useCustom<WappChannel[]>({
    url: '',
    method: 'get',
    meta: { rawUrl: `/admin/whatsapp/status/${id}/channels` },
    queryOptions: {
      queryKey: ['tenant-channels', id, refreshKey],
      enabled: !!id,
    },
  });

  const channels: WappChannel[] = Array.isArray(channelsResult?.data) ? channelsResult.data : [];

  const allEvents = useMemo(() => {
    const events = buildTimelineEvents(auditData as any[], jobsData as any[], inboxData as any[], channels);
    return groupTimelineEvents(events);
  }, [auditData, jobsData, inboxData, channels]);

  const availableTypes = useMemo(() => {
    const types = new Set(allEvents.map(e => e.type));
    return ['todos', ...Array.from(types)];
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => typeFilter === 'todos' || e.type === typeFilter);
  }, [allEvents, typeFilter]);

  // Fetch Media URLs for selected event — supports N attachments per activity
  useEffect(() => {
    setMediaItems([]);
    if (!selectedEvent) return;

    const searchTerms: string[] = [];

    const mainTerm = extractSearchTerm(selectedEvent);
    if (mainTerm) searchTerms.push(mainTerm);

    if (selectedEvent.additionalItems) {
      selectedEvent.additionalItems.forEach((evt: any) => {
        const term = extractSearchTerm(evt);
        if (term) searchTerms.push(term);
      });
    }

    if (searchTerms.length === 0 || !id) return;

    Promise.all(searchTerms.map(term =>
      fetch(`${API_URL}/admin/storage?tenant_id=${id}&search=${term}`, { headers: getAuthHeader() })
        .then(r => r.json())
        .then(data => {
          const storageList: any[] = Array.isArray(data) ? data : data.data || [];
          return storageList;
        })
    )).then(results => {
      const storageList = results.flat();
      if (storageList.length === 0) return;

      const ids = storageList.map((s: any) => s.id);
      fetch(`${API_URL}/admin/storage/batch-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ ids })
      }).then(r => r.json()).then(urlData => {
        const urlList: any[] = Array.isArray(urlData) ? urlData : urlData.data || [];
        const urlMap: Record<string, string> = {};
        urlList.forEach((item: any) => { urlMap[item.id] = item.url; });
        const items = storageList
          .filter((s: any) => urlMap[s.id])
          .map((s: any) => ({
            url: urlMap[s.id],
            mime_type: s.mime_type || 'application/octet-stream',
            file_name: s.file_name || 'archivo'
          }));
        setMediaItems(items);
      }).catch(e => console.error("Error fetching presigned urls:", e));
    }).catch(e => console.error("Error finding storage objects:", e));
  }, [selectedEvent, id, inboxData]);

  const tenant = tenantQuery?.data?.data as Tenant | undefined;
  const stats = statsResult?.data as TenantStats | undefined;
  const isLoading = tenantQuery?.isLoading;

  const hasActiveChannel = channels.some(c => c.session_status === 'connected' || c.session_status === 'qr_pending');

  // SSE-driven real-time updates for all tenant activity
  const invalidate = useInvalidate();
  useWhatsAppSSE(
    useCallback((event) => {
      if (event.tenant_id === id) {
        setRefreshKey(k => k + 1);
        auditQuery?.refetch?.();
        jobsQuery?.refetch?.();
        inboxQuery?.refetch?.();
        tenantQuery?.refetch?.();
      }
    }, [id, auditQuery, jobsQuery, inboxQuery, tenantQuery]),
    true // Always enabled to auto-refresh background activity (inbox, jobs, audits)
  );

  const handleDelete = useCallback(() => {
    if (!tenant) return;
    setIsDeleting(true);
    deleteTenant(
      { resource: "tenants", id: tenant.id },
      {
        onSuccess: () => {
          addToast(`"${tenant.name}" eliminado`, "success");
          setShowDeleteModal(false);
          setIsDeleting(false);
          navigate("/usuarios");
        },
        onError: (err) => {
          addToast(`Error al eliminar: ${err.message}`, "error");
          setIsDeleting(false);
        },
      }
    );
  }, [tenant, deleteTenant, addToast, navigate]);

  const handlePurge = useCallback(() => {
    if (!tenant) return;
    setIsPurging(true);
    deleteTenant(
      {
        resource: "tenants",
        id: tenant.id,
        meta: { purge: true },
      },
      {
        onSuccess: () => {
          addToast(`"${tenant.name}" purgado permanentemente`, "success");
          setShowPurgeModal(false);
          setIsPurging(false);
          navigate("/usuarios");
        },
        onError: (err) => {
          addToast(`Error al purgar: ${err.message}`, "error");
          setIsPurging(false);
        },
      }
    );
  }, [tenant, deleteTenant, addToast, navigate]);

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <div className="skeleton skeleton-text-lg" />
        </div>
        <div className="dashboard-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div>
        <div className="error-banner">Usuario no encontrado</div>
        <button className="btn btn-ghost" onClick={() => navigate('/usuarios')}>← Volver</button>
      </div>
    );
  }

  const isDeleted = !!tenant.deleted_at;

  function startEditName() {
    setNameValue(tenant!.name);
    setEditingName(true);
  }

  function saveName() {
    if (!nameValue.trim()) return;
    updateTenant(
      { resource: "tenants", id: tenant!.id, values: { name: nameValue.trim() } },
      {
        onSuccess: () => {
          addToast("Nombre actualizado", "success");
          setEditingName(false);
        },
        onError: (err) => addToast(`Error al actualizar: ${err.message}`, "error"),
      }
    );
  }

  function changeStatus(newStatus: string) {
    updateTenant(
      { resource: "tenants", id: tenant!.id, values: { status: newStatus } },
      {
        onSuccess: () => addToast(`Estado → ${newStatus}`, "success"),
        onError: (err) => addToast(`Error al cambiar estado: ${err.message}`, "error"),
      }
    );
  }

  function startEditConfig() {
    const rawConfig = tenant!.config || {};
    setTtlValue(typeof rawConfig.token_ttl_hours === 'number' ? rawConfig.token_ttl_hours : 24);
    setConfigValue(JSON.stringify(rawConfig, null, 2));
    setConfigError('');
    setActiveTab('config');
  }

  function handleDescSave() {
    updateTenant(
      { resource: "tenants", id: tenant!.id, values: { config: { ...(tenant!.config as Record<string, unknown>), description: descDraft } } },
      { onSuccess: () => { setEditingDesc(false); addToast("Descripción actualizada", "success"); } }
    );
  }

  function startEditDesc() {
    setDescDraft((tenant!.config as any)?.description || '');
    setEditingDesc(true);
  }

  function saveConfig() {
    try {
      const parsed = JSON.parse(configValue);
      setConfigError('');
      updateTenant(
        { resource: "tenants", id: tenant!.id, values: { config: parsed } },
        {
          onSuccess: () => addToast("Configuración guardada", "success"),
          onError: (err) => addToast(`Error al guardar: ${err.message}`, "error"),
        }
      );
    } catch {
      setConfigError('JSON inválido');
    }
  }

  function handleTtlChange(hours: number) {
    setTtlValue(hours);
    try {
      const parsed = JSON.parse(configValue || "{}");
      parsed.token_ttl_hours = hours;
      setConfigValue(JSON.stringify(parsed, null, 2));
      setConfigError('');
    } catch {
      // Ignore config editor syntax errors during TTL slider adjustment
    }
  }

  async function handleGenerateToken() {
    setGenerating(true);
    try {
      const resp = await fetch(
        `${API_URL}/admin/tenants/${tenant!.id}/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({}),
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setGeneratedToken(data.token);
      setShowTokenModal(true);
      addToast("Token API generado", "success");
    } catch (err) {
      addToast(`Error al generar token: ${(err as Error).message}`, "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyToken() {
    await copyToClipboard(generatedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRestore() {
    try {
      const resp = await fetch(
        `${API_URL}/admin/tenants/${tenant!.id}/restore`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({}),
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      addToast(`"${tenant!.name}" restaurado`, "success");
      tenantQuery?.refetch?.();
    } catch (err) {
      addToast(`Error al restaurar: ${(err as Error).message}`, "error");
    }
  }

  const handleCreateChannel = () => {
    if (!newChannelName.trim()) return;
    createChannelMutate({
      url: `${API_URL}/admin/whatsapp/status/${id}/channels`,
      method: "post",
      values: { name: newChannelName.trim() },
    }, {
      onSuccess: () => {
        addToast("Canal creado", "success");
        setNewChannelName("");
        setShowCreateChannel(false);
        setRefreshKey(k => k + 1);
      },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  const openAudits = async () => {
    setShowAuditModal(true);
    setIsAuditLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/whatsapp/status/${id}/audit`, {
        headers: { ...getAuthHeader() },
      });
      if (!response.ok) throw new Error("Error al obtener auditoría");
      const data = await response.json();
      setAudits(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAuditLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/usuarios')}
            style={{ marginBottom: 'var(--sp-2)' }}
          >
            ← Volver
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            {editingName ? (
              <>
                <input
                  className="form-input"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  autoFocus
                  id="tenant-name-input"
                />
                <button className="btn btn-primary btn-sm" onClick={saveName}>Guardar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <h1 className="page-title">{tenant.name}</h1>
                {!isDeleted && (
                  <button className="btn btn-ghost btn-sm" onClick={startEditName} title="Editar nombre">Editar</button>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
            <span className={`badge ${isDeleted ? 'badge-danger' : STATUS_BADGE[tenant.status] || 'badge-neutral'}`}>
              {isDeleted ? 'eliminado' : tenant.status}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {tenant.id}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {!isDeleted && tenant.status === 'active' && (
            <button
              className="btn btn-ghost"
              onClick={handleGenerateToken}
              disabled={generating}
              id="generate-token-button"
            >
              {generating ? "Generando…" : "+ Generar Token"}
            </button>
          )}
          {isDeleted ? (
            <>
              <button className="btn btn-primary" onClick={handleRestore} id="restore-tenant-button">
                Restaurar
              </button>
              <button className="btn btn-danger" onClick={() => setShowPurgeModal(true)} id="purge-tenant-button">
                Purgar
              </button>
            </>
          ) : (
            <>
              {tenant.status === 'active' && (
                <button className="btn btn-ghost" style={{ border: '1px solid var(--danger-subtle)', color: 'var(--danger)' }} onClick={() => changeStatus('suspended')}>Suspender</button>
              )}
              {tenant.status === 'suspended' && (
                <button className="btn btn-primary" onClick={() => changeStatus('active')}>Activar</button>
              )}
              <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)} id="delete-tenant-button">
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button
          className={`tab-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Resumen
        </button>
        <button
          className={`tab-item ${activeTab === 'config' ? 'active' : ''}`}
          onClick={startEditConfig}
        >
          Configuración
        </button>
        <button
          className={`tab-item ${activeTab === 'whatsapp' ? 'active' : ''}`}
          onClick={() => setActiveTab('whatsapp')}
        >
          Conexión WhatsApp
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--sp-6)', alignItems: 'start' }}>
            {/* Info and Description */}
            <div>
              <div style={{ background: 'var(--surface-1)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                {editingDesc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <textarea 
                      className="form-input" 
                      value={descDraft} 
                      onChange={(e) => setDescDraft(e.target.value)} 
                      onBlur={handleDescSave}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescSave(); } }}
                      rows={4}
                      autoFocus
                      placeholder="Descripción (Haz click fuera o presiona Enter para guardar)"
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                ) : (
                  <div 
                    onDoubleClick={startEditDesc}
                    style={{ position: 'relative', minHeight: '80px', display: 'flex', flexDirection: 'column', cursor: 'text' }}
                    title="Doble clic para editar"
                  >
                    <p style={{ margin: 0, color: (tenant.config as any)?.description ? 'var(--text-primary)' : 'var(--text-tertiary)', flex: 1, whiteSpace: 'pre-wrap' }}>
                      {(tenant.config as any)?.description || "Descripción (Doble clic para editar)"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Stats */}
            <div style={{ background: 'var(--surface-1)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Sesiones WA</span>
                      <strong style={{ fontSize: 'var(--text-lg)' }}>{stats?.sessions ?? '–'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Almacenamiento S3</span>
                      <strong>{stats?.storage?.files ?? '–'} arch. ({formatBytes(Number(stats?.storage?.bytes || 0))})</strong>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--sp-3)', marginTop: 'var(--sp-2)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Creado:</span>
                          <span className="cell-mono">{new Date(tenant.created_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {tenant.deleted_at && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                              <span style={{ color: 'var(--danger)' }}>Eliminado:</span>
                              <span className="cell-mono">{new Date(tenant.deleted_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                      )}
                  </div>
              </div>
            </div>
          </div>

          {/* Timeline Historial de Actividad */}
          <div style={{ display: 'grid', gridTemplateColumns: selectedEvent ? '1fr 1fr' : '1fr', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Historial de Actividad</h2>
                {availableTypes.length > 1 && (
                  <select 
                    className="form-input form-input-sm" 
                    value={typeFilter} 
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{ width: 'auto', padding: 'var(--sp-1) var(--sp-2)' }}
                  >
                    {availableTypes.map(t => <option key={t} value={t}>{t === 'todos' ? 'Todos' : t}</option>)}
                  </select>
                )}
              </div>
              <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-1)', zIndex: 1 }}>
                    <tr>
                      <th>Fecha</th>
                      <th>Canal</th>
                      <th>Tipo</th>
                      <th>Descripción / Contenido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isAuditLoadingList || isJobsLoading || isInboxLoading) ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--sp-4)' }}>Cargando historial...</td></tr>
                    ) : filteredEvents.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--sp-4)' }}>No hay eventos para mostrar.</td></tr>
                    ) : (
                      filteredEvents.slice(0, 50).map(evt => (
                        <tr 
                          key={`${evt.type}-${evt.id}`} 
                          onClick={() => setSelectedEvent(evt)}
                          style={{ 
                            cursor: 'pointer', 
                            background: selectedEvent?.id === evt.id ? 'var(--surface-2)' : 'transparent',
                            transition: 'background var(--duration-fast)'
                          }}
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(evt.date).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                          <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                            {evt.channelName || '—'}
                          </td>
                          <td>
                            <span className={`badge badge-${evt.type === 'operación' ? 'success' : evt.type === 'whatsapp' ? 'warning' : 'neutral'}`}>
                              {evt.type}
                            </span>
                          </td>
                          <td style={{ maxWidth: selectedEvent ? '200px' : '400px', overflow: 'hidden' }} title={typeof evt.content === 'string' ? evt.content : undefined}>
                            {evt.content}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedEvent && (
              <div className="card">
                <div className="card-header" style={{ paddingBottom: 'var(--sp-4)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedEvent(null)} style={{ padding: '0 8px' }}>✕</button>
                </div>
                <div className="card-body" style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', maxHeight: '600px', overflowY: 'auto' }}>
                  
                  {/* Priority Human-Readable Section */}
                  <div style={{ background: 'var(--surface-0)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent)' }}>
                    {selectedEvent.type === 'whatsapp' && (
                      <>
                         <h4 style={{ margin: '0 0 var(--sp-2) 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Contenido Recibido de {formatJid(selectedEvent.item.payload?.sender || selectedEvent.item.sender)}</h4>
                         <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                           {selectedEvent.item.payload?.type && selectedEvent.item.payload.type !== 'text' && (() => {
                             const totalCount = 1 + (selectedEvent.additionalItems?.length || 0);
                             const mediaLabels: Record<string, { icon: string; singular: string; plural: string }> = {
                               image: { icon: '🖼️', singular: 'Imagen', plural: 'Imágenes' },
                               audio: { icon: '🎵', singular: 'Nota de voz', plural: 'Notas de voz' },
                               video: { icon: '🎬', singular: 'Video', plural: 'Videos' },
                               document: { icon: '📄', singular: 'Documento', plural: 'Documentos' },
                               sticker: { icon: '✨', singular: 'Sticker', plural: 'Stickers' },
                             };
                             const label = mediaLabels[selectedEvent.item.payload.type] || { icon: '📎', singular: 'Archivo', plural: 'Archivos' };
                             const displayText = totalCount > 1
                               ? `${label.icon} ${totalCount} ${label.plural}`
                               : `${label.icon} ${label.singular}`;
                             return (
                               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                 {displayText}
                                 {selectedEvent.item.payload.type === 'audio' && selectedEvent.item.payload.transcription ? ' (Transcrita)' : ''}
                               </p>
                             );
                           })()}
                           {(() => {
                             // Collect all unique text messages from the group
                             const allEvts = [selectedEvent, ...(selectedEvent.additionalItems || [])];
                             const messages: string[] = [];
                             for (const evt of allEvts) {
                               const text = evt.item?.payload?.message || evt.item?.payload?.caption || evt.item?.payload?.textContent;
                               if (text && !messages.includes(text)) {
                                 messages.push(text);
                               }
                             }
                             if (messages.length === 0) {
                               return (!selectedEvent.item.payload?.type || selectedEvent.item.payload.type === 'text') ? (
                                 <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-secondary)' }}>Sin contenido textual.</p>
                               ) : null;
                             }
                             return (
                               <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                                 {messages.map((text, idx) => (
                                   <div key={idx} style={{ padding: 'var(--sp-3)', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)' }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-1)' }}>
                                       <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                         {messages.length > 1 ? `Mensaje ${idx + 1}:` : 'Mensaje:'}
                                       </span>
                                       <CopyButton text={text} />
                                     </div>
                                     <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', lineHeight: 1.5 }}>{text}</p>
                                   </div>
                                 ))}
                               </div>
                             );
                           })()}
                         </div>
                         {selectedEvent.item.payload?.transcription && (() => {
                           const mediaType = selectedEvent.item.payload?.type;
                           const isAudio = mediaType === 'audio';
                           const label = isAudio ? '✨ Transcripción de IA (Whisper)' : '🔍 Análisis OCR de IA';
                           return (
                             <div style={{ marginTop: 'var(--sp-3)', padding: 'var(--sp-3)', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)' }}>
                               <h5 style={{ margin: '0 0 var(--sp-1) 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{label}</h5>
                               <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{selectedEvent.item.payload.transcription}"</p>
                             </div>
                           );
                         })()}
                      </>
                    )}

                    {selectedEvent.type === 'operación' && selectedEvent.item.name === 'wapp-send-process' && (() => {
                       const allItems = [selectedEvent, ...(selectedEvent.additionalItems || [])];
                       const to = selectedEvent.item.data?.to;
                       return (
                         <>
                           <h4 style={{ margin: '0 0 var(--sp-2) 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>
                             {allItems.length > 1 ? `${allItems.length} Mensajes Enviados a` : 'Mensaje Enviado a'} {formatJid(to)}
                           </h4>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                             {allItems.map((evt: any, idx: number) => {
                               const text = evt.item?.data?.text || evt.data?.text || 'Multimedia/Documento';
                               return (
                                 <div key={evt.id || idx} style={{ padding: 'var(--sp-3)', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)' }}>
                                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-1)' }}>
                                     <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                       {allItems.length > 1 ? `Mensaje ${idx + 1}:` : 'Mensaje:'}
                                     </span>
                                     <CopyButton text={text} />
                                   </div>
                                   <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', lineHeight: 1.5 }}>{text}</p>
                                 </div>
                               );
                             })}
                           </div>
                         </>
                       );
                     })()}

                    {selectedEvent.type === 'operación' && selectedEvent.item.name === 'wapp-lifecycle' && (
                      <>
                         {selectedEvent.item.data?.event === 'connection_opened' ? (
                            <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 500 }}>✅ Conexión establecida correctamente</p>
                         ) : (
                            <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 500 }}>{selectedEvent.item.description || selectedEvent.item.name}</p>
                         )}
                      </>
                    )}

                    {selectedEvent.type === 'operación' && !['wapp-send-process', 'wapp-lifecycle'].includes(selectedEvent.item.name) && (
                      <>
                         <h4 style={{ margin: '0 0 var(--sp-2) 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Operación: {selectedEvent.item.name}</h4>
                         <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 500 }}>{selectedEvent.item.description || "Procesamiento interno encolado."}</p>
                      </>
                    )}

                    {selectedEvent.type === 'auditoría' && (
                      <>
                         <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 500 }}>{selectedEvent.item.details?.message || `Acción: ${selectedEvent.item.action}`}</p>
                      </>
                    )}

                  </div>

                  {/* Media Preview — collapsed by default, N items */}
                  {mediaItems.length > 0 && (
                    <div style={{ background: 'var(--surface-1)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                      <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: 0 }}>
                        Multimedia Asociada ({mediaItems.length})
                      </h4>
                      {mediaItems.map((item, idx) => {
                        const isAudio = item.mime_type.startsWith('audio/');
                        const isImage = item.mime_type.startsWith('image/');
                        const isVideo = item.mime_type.startsWith('video/');
                        const isPdf = item.mime_type === 'application/pdf';
                        const isDocument = item.mime_type.startsWith('application/') && !isPdf;
                        const mediaKey = `${selectedEvent?.id}-${idx}`;
                        const isExpanded = expandedMedia.has(mediaKey);
                        return (
                          <div key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: idx > 0 ? 'var(--sp-2)' : 0 }}>
                            <div
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', marginBottom: isExpanded ? 'var(--sp-2)' : 0 }}
                              onClick={() => setExpandedMedia(prev => {
                                const next = new Set(prev);
                                next.has(mediaKey) ? next.delete(mediaKey) : next.add(mediaKey);
                                return next;
                              })}
                            >
                              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
                                <span style={{ transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '10px' }}>▶</span>
                                {item.file_name}
                              </p>
                              <a
                                href={item.url}
                                download={item.file_name}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                                title={`Descargar ${item.file_name}`}
                              >
                                ⬇️
                              </a>
                            </div>
                            {isExpanded && (
                              <>
                                {isImage && (
                                  <img src={item.url} alt={item.file_name} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: 'var(--radius-sm)', objectFit: 'contain' }} />
                                )}
                                {isAudio && (
                                  <audio controls src={item.url} style={{ width: '100%', height: '40px' }} />
                                )}
                                {isVideo && (
                                  <video controls src={item.url} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: 'var(--radius-sm)' }} />
                                )}
                                {isPdf && (
                                  <iframe
                                    src={item.url}
                                    style={{ width: '100%', height: '400px', border: 'none', borderRadius: 'var(--radius-sm)' }}
                                    title={item.file_name}
                                  />
                                )}
                                {(isDocument || (!isAudio && !isImage && !isVideo && !isPdf)) && (
                                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                    📎 {item.mime_type} — {item.file_name}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsible JSON */}
                  <div style={{ marginTop: 'var(--sp-4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowJson(!showJson)}>
                        JSON {showJson ? '▲' : '▼'}
                      </button>
                    </div>
                    {showJson && (
                      <div style={{ position: 'relative', background: 'var(--surface-0)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginTop: 'var(--sp-2)' }}>
                        <button 
                          className="btn btn-primary btn-sm" 
                          style={{ position: 'absolute', top: 'var(--sp-2)', right: 'var(--sp-2)' }}
                          onClick={async () => { 
                            await copyToClipboard(JSON.stringify(selectedEvent.item, null, 2)); 
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? "Copiado ✓" : "Copiar"}
                        </button>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {JSON.stringify(selectedEvent.item, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'config' && (
        <div>
          <div className="dashboard-card" style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-4)', maxWidth: '700px' }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
              Política de expiración de tokens (TTL)
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-3)' }}>
              Configura la duración de vida de los tokens HS256 generados para este usuario.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }} htmlFor="token-ttl-input">
                TTL (Horas):
              </label>
              <input
                id="token-ttl-input"
                type="number"
                className="form-input"
                style={{ width: '120px' }}
                value={ttlValue}
                min={1}
                max={8760}
                onChange={(e) => handleTtlChange(Math.max(1, Math.min(8760, Number(e.target.value) || 24)))}
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                (1 hora a 1 año / 8760 horas)
              </span>
            </div>
          </div>

          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
            Configuración JSON
          </h3>
          <textarea
            className="form-input"
            value={configValue}
            onChange={(e) => { setConfigValue(e.target.value); setConfigError(''); }}
            rows={12}
            spellCheck={false}
            style={{
              width: '100%',
              maxWidth: '700px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              resize: 'vertical',
            }}
            id="tenant-config-editor"
          />
          {configError && (
            <div className="error-banner" style={{ marginTop: 'var(--sp-3)', maxWidth: '700px' }}>
              {configError}
            </div>
          )}
          <div style={{ marginTop: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn btn-primary" onClick={saveConfig} id="save-config-button">
              Guardar
            </button>
            <button className="btn btn-ghost" onClick={() => setActiveTab('overview')}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {activeTab === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Header with Create button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <h3 style={{ margin: 0 }}>Canales WhatsApp</h3>
              <span className="badge badge-neutral">{channels.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button className="btn btn-ghost btn-sm" onClick={openAudits}>Ver auditoría</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateChannel(true)} id="create-channel-button">
                + Nuevo canal
              </button>
            </div>
          </div>

          {/* Create Channel Inline Form */}
          {showCreateChannel && (
            <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-3)', background: 'var(--surface-1)', borderRadius: 'var(--radius-md)' }}>
              <input className="form-input" placeholder="Nombre del canal (ej: Bot Ventas)" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()} autoFocus style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={handleCreateChannel} disabled={!newChannelName.trim()}>Crear</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreateChannel(false); setNewChannelName(''); }}>Cancelar</button>
            </div>
          )}

          {/* Master-Detail Split Layout */}
          {wappQuery.isLoading ? (
            <div className="data-table-wrapper" style={{ padding: 'var(--sp-5)' }}>
              <span className="skeleton skeleton-line" style={{ width: '60%', marginBottom: 'var(--sp-3)' }} />
              <span className="skeleton skeleton-line" style={{ width: '40%' }} />
            </div>
          ) : channels.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
              <div className="empty-state-icon">🔌</div>
              <h2 style={{ margin: 'var(--sp-3) 0 var(--sp-2) 0' }}>Sin canales WhatsApp</h2>
              <p style={{ maxWidth: '480px', margin: '0 auto var(--sp-5) auto', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                Crea un canal para conectar un número de WhatsApp a {tenant.name}.
              </p>
              <button className="btn btn-primary" onClick={() => setShowCreateChannel(true)}>+ Crear primer canal</button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: selectedChannel ? '1fr 1.2fr' : '1fr',
              gap: 'var(--sp-4)',
              transition: 'grid-template-columns var(--duration-normal) ease',
              minHeight: '360px',
            }}>
              {/* LEFT: Channel List */}
              <div className="data-table-wrapper" style={{ overflowY: 'auto', maxHeight: '520px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {channels.map((ch) => {
                    const status = ch.session_status || ch.status;
                    const isSelected = selectedChannel?.id === ch.id;
                    return (
                      <div
                        key={ch.id}
                        onClick={() => setSelectedChannel(isSelected ? null : ch)}
                        className="channel-list-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--sp-3)',
                          padding: 'var(--sp-3) var(--sp-4)',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--surface-2)' : 'transparent',
                          borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                          transition: 'all var(--duration-fast) ease',
                        }}
                      >
                        <span className={`dashboard-dot ${STATUS_DOT[status] || 'dashboard-dot-neutral'}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.name}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            {ch.phone_number || 'Sin número'} · {status.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <span className={`badge ${STATUS_BADGE[status] || 'badge-neutral'}`} style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>
                          {status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Channel Detail (inline, no overlay) */}
              {selectedChannel && (
                <div style={{
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--sp-4)',
                  overflowY: 'auto',
                  maxHeight: '520px',
                }}>
                  <ChannelDetailPanel
                    channel={selectedChannel}
                    onRefresh={() => setRefreshKey(k => k + 1)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* K.1 — Token Generation Modal */}
      {showTokenModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="token-modal-title"
        >
          <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" id="token-modal-title">
              Token de acceso generado
            </h2>
            <p className="modal-body" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Token HS256 firmado para <strong>{tenant.name}</strong>. Guárdalo en un lugar seguro.
              <span style={{ color: 'var(--danger)', fontWeight: 500, display: 'block', marginTop: 'var(--sp-2)' }}>
                Este token no se mostrará de nuevo.
              </span>
            </p>
            
            <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
              <input
                className="form-input cell-mono"
                value={generatedToken}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{ flex: 1, backgroundColor: 'var(--surface-1)' }}
                id="generated-token-display"
              />
              <button className="btn btn-primary" onClick={handleCopyToken} id="copy-token-button">
                {copied ? "Copiado ✓" : "Copiar"}
              </button>
            </div>

            <div className="modal-actions" style={{ marginTop: 'var(--sp-4)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowTokenModal(false); setGeneratedToken(""); }}
                id="done-token-button"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Scan Audits Modal */}
      {showAuditModal && (
        <div className="modal-overlay" onClick={() => setShowAuditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <h2 className="modal-title">Historial de conexión WhatsApp</h2>
            
            {isAuditLoading ? (
              <div style={{ padding: 'var(--sp-6)', textAlign: 'center' }}>
                <span className="skeleton skeleton-line" style={{ width: '80%', margin: '0 auto var(--sp-2) auto' }} />
                <span className="skeleton skeleton-line" style={{ width: '60%', margin: '0 auto' }} />
              </div>
            ) : audits.length === 0 ? (
              <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'color-mix(in oklch, var(--text) 50%, transparent)' }}>
                Sin registros de auditoría de conexión para este usuario.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxHeight: '350px', overflowY: 'auto', paddingRight: 'var(--sp-2)' }}>
                {audits.map((audit) => (
                  <div key={audit.id} style={{ 
                    padding: 'var(--sp-3)', 
                    borderRadius: 'var(--radius)', 
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)', fontSize: '0.85rem' }}>
                      <span className="cell-mono" style={{ fontWeight: 6 }}>{audit.action.toUpperCase()}</span>
                      <span style={{ color: 'color-mix(in oklch, var(--text) 60%, transparent)' }}>
                        {new Date(audit.created_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', fontSize: '0.85rem', marginBottom: 'var(--sp-2)' }}>
                      <span>Actor:</span>
                      <span className="badge badge-neutral">{audit.actor}</span>
                    </div>
                    {audit.details && (
                      <pre className="monospace-block" style={{ fontSize: '0.8rem', padding: 'var(--sp-2)', margin: 0 }}>
                        {JSON.stringify(audit.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="modal-actions" style={{ marginTop: 'var(--sp-4)' }}>
              <button className="btn btn-secondary" onClick={() => setShowAuditModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" id="delete-modal-title">
              Eliminar usuario
            </h2>
            <p className="modal-body">
              ¿Eliminar{" "}
              <strong>{tenant.name}</strong>? Esta acción aplica soft-delete.
              Se puede restaurar después.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                id="cancel-delete-button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
                id="confirm-delete-button"
              >
                {isDeleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge confirmation modal */}
      {showPurgeModal && (
        <div
          className="modal-overlay"
          onClick={() => !isPurging && setShowPurgeModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-modal-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" id="purge-modal-title" style={{ color: "var(--color-danger)" }}>
              Purgar permanentemente
            </h2>
            <p className="modal-body">
              ¿Purgar permanentemente{" "}
              <strong>{tenant.name}</strong>? Esta acción eliminará
              el usuario y todos sus datos de forma irreversible.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                id="cancel-purge-button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handlePurge}
                disabled={isPurging}
                id="confirm-purge-button"
              >
                {isPurging ? "Purgando…" : "Purgar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
