/**
 * FlowBuilderPanel — EPIC-004: Motor de Flujos (Visual Builder with React Flow)
 * Verification: MOTR.AV.*, MOTR.FN.*, FRONT.FN.*, FRONT.AV.02, SADM.AV.03
 */
import { useState, useCallback, useEffect, useMemo, memo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeProps,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { API_URL } from "../providers/constants";
import { getAuthHeader } from "../providers/auth";
import { JsonEditor } from "./JsonEditor";

// ── Interfaces ────────────────────────────────────────────────────────
interface TenantFlow {
  id: string;
  tenant_id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  graph: { nodes: any[]; edges: any[] };
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
}

interface Props {
  tenantId: string;
  addToast: (msg: string, type: "success" | "error") => void;
}

// ── Constants ─────────────────────────────────────────────────────────
const TRIGGER_TYPES = [
  { value: "inbound_channel", label: "Canal Entrante", icon: "📨" },
  { value: "scheduled", label: "Programado (Cron)", icon: "⏰" },
  { value: "webhook", label: "Webhook", icon: "🔗" },
  { value: "manual", label: "Manual", icon: "👆" },
];

const NODE_CATALOG = [
  { type: "trigger", label: "Trigger", icon: "⚡", color: "#6366f1" },
  { type: "switch", label: "Switch", icon: "🔀", color: "#e67e22" },
  { type: "llm", label: "LLM", icon: "🧠", color: "#9b59b6" },
  { type: "stt", label: "STT", icon: "🎤", color: "#2ecc71" },
  { type: "send_message", label: "Enviar Mensaje", icon: "📤", color: "#3498db" },
  { type: "sql_script", label: "SQL Script", icon: "🗃️", color: "#1abc9c" },
];

// ── Custom Node ───────────────────────────────────────────────────────
interface FlowNodeData {
  label?: string;
  nodeType?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

const FlowNode = memo(({ data, selected }: NodeProps<Node<FlowNodeData>>) => {
  const catalog = NODE_CATALOG.find(n => n.type === data.nodeType) || NODE_CATALOG[0];
  const config = data.config as Record<string, unknown> | undefined;
  return (
    <div
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: `2px solid ${selected ? catalog.color : "var(--border-subtle)"}`,
        background: "var(--surface-1)",
        minWidth: 140,
        boxShadow: selected ? `0 0 0 2px ${catalog.color}40` : "0 1px 3px rgba(0,0,0,.12)",
        transition: "all .15s ease",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: catalog.color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 18 }}>{catalog.icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
            {String(data.label || catalog.label)}
          </div>
          {data.nodeType === "llm" && !!config?.model && (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{String(config.model)}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: catalog.color }} />
      {data.nodeType === "switch" && (
        <Handle type="source" position={Position.Right} id="branch" style={{ background: "#e67e22", top: "50%" }} />
      )}
      {data.nodeType === "llm" && (
        <Handle type="source" position={Position.Right} id="on_ai_failure" style={{ background: "#e74c3c", top: "50%" }} />
      )}
    </div>
  );
});
FlowNode.displayName = "FlowNode";

const nodeTypes = { flowNode: FlowNode };

// ── Error Boundary ────────────────────────────────────────────────────
function FlowErrorBoundaryFallback({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={{ padding: "var(--sp-6)", textAlign: "center", background: "var(--surface-1)", borderRadius: "var(--radius-md)", border: "1px solid var(--danger)" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ color: "var(--danger)", fontWeight: 600, marginBottom: 4 }}>Grafo corrupto</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", marginBottom: 12, fontFamily: "var(--font-mono)" }}>{error}</div>
      <button className="btn btn-primary btn-sm" onClick={onRetry}>Reiniciar canvas</button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
function FlowBuilderInner({ tenantId, addToast }: Props) {
  const [flows, setFlows] = useState<TenantFlow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<TenantFlow | null>(null);

  // Canvas state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [graphJsonEditor, setGraphJsonEditor] = useState<string>("{}");

  // Drawer
  const [drawerNode, setDrawerNode] = useState<Node | null>(null);
  const [drawerConfig, setDrawerConfig] = useState("{}");
  const [drawerLabel, setDrawerLabel] = useState("");

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<TenantFlow | null>(null);
  const [flowName, setFlowName] = useState("");
  const [triggerType, setTriggerType] = useState("inbound_channel");
  const [triggerConfig, setTriggerConfig] = useState("{}");

  // Schema keys for Switch node
  const [schemaKeys, setSchemaKeys] = useState<string[]>([]);

  // Metadata for UI selections
  const [contacts, setContacts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);

  const limit = 20;

  // ── Fetchers ──────────────────────────────────────────────────────
  const fetchFlows = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/admin/tenants/${tenantId}/flows?page=${page}&limit=${limit}`, { headers: getAuthHeader() });
      if (!r.ok) throw new Error("fetch failed");
      const d = await r.json();
      setFlows(d.data || []);
      setTotal(d.meta?.total || 0);
    } catch (e) { addToast(`Error: ${(e as Error).message}`, "error"); }
    finally { setIsLoading(false); }
  }, [tenantId, page, addToast]);

  const fetchSchema = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts/schema`, { headers: getAuthHeader() });
      if (r.ok) { const d = await r.json(); setSchemaKeys(d.keys || []); }
    } catch { /* silent */ }
  }, [tenantId]);

  const fetchContacts = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/admin/tenants/${tenantId}/contacts?limit=100`, { headers: getAuthHeader() });
      if (r.ok) { const d = await r.json(); setContacts(d.data || []); }
    } catch { /* silent */ }
  }, [tenantId]);

  const fetchChannels = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/admin/whatsapp/status/${tenantId}/channels`, { headers: getAuthHeader() });
      if (r.ok) { const d = await r.json(); setChannels(d || []); }
    } catch { /* silent */ }
  }, [tenantId]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);
  useEffect(() => { fetchSchema(); fetchContacts(); fetchChannels(); }, [fetchSchema, fetchContacts, fetchChannels]);

  // ── Load graph into canvas ────────────────────────────────────────
  const loadGraph = useCallback((flow: TenantFlow) => {
    try {
      const g = flow.graph || { nodes: [], edges: [] };
      const rfNodes: Node[] = (g.nodes || []).map((n: any) => ({
        id: n.id,
        type: "flowNode",
        position: n.position || { x: 0, y: 0 },
        data: { label: n.data?.label || n.type, nodeType: n.type || n.data?.type || "trigger", config: n.data?.config || {} },
      }));
      const rfEdges: Edge[] = (g.edges || []).map((e: any) => ({
        id: e.id || `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || null,
        animated: true,
        style: { stroke: "var(--accent)" },
      }));
      setNodes(rfNodes);
      setEdges(rfEdges);
      setGraphError(null);
      setSelectedFlow(flow);
      setGraphJsonEditor(JSON.stringify(g, null, 2));
    } catch (err) {
      setGraphError((err as Error).message);
    }
  }, []);

  // ── Canvas callbacks ──────────────────────────────────────────────
  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes(nds => {
    const newNodes = applyNodeChanges(changes, nds);
    setGraphJsonEditor(JSON.stringify({ nodes: newNodes.map(n => ({ id: n.id, type: n.data.nodeType, position: n.position, data: { label: n.data.label, config: n.data.config } })), edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })) }, null, 2));
    return newNodes;
  }), [edges]);
  
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges(eds => {
    const newEdges = applyEdgeChanges(changes, eds);
    setGraphJsonEditor(JSON.stringify({ nodes: nodes.map(n => ({ id: n.id, type: n.data.nodeType, position: n.position, data: { label: n.data.label, config: n.data.config } })), edges: newEdges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })) }, null, 2));
    return newEdges;
  }), [nodes]);
  
  const onConnect: OnConnect = useCallback((conn) => setEdges(eds => {
    const newEdges = addEdge({ ...conn, animated: true, style: { stroke: "var(--accent)" } }, eds);
    setGraphJsonEditor(JSON.stringify({ nodes: nodes.map(n => ({ id: n.id, type: n.data.nodeType, position: n.position, data: { label: n.data.label, config: n.data.config } })), edges: newEdges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })) }, null, 2));
    return newEdges;
  }), [nodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setDrawerNode(node);
    setDrawerLabel(node.data.label as string || "");
    setDrawerConfig(JSON.stringify(node.data.config || {}, null, 2));
  }, []);

  // ── Save graph ────────────────────────────────────────────────────
  const saveGraph = useCallback(async () => {
    if (!selectedFlow) return;
    const graph = {
      nodes: nodes.map(n => ({ id: n.id, type: n.data.nodeType, position: n.position, data: { label: n.data.label, config: n.data.config } })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })),
    };
    try {
      const r = await fetch(`${API_URL}/admin/tenants/${tenantId}/flows/${selectedFlow.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ graph }),
      });
      if (!r.ok) throw new Error("save failed");
      addToast("Grafo guardado", "success");
      fetchFlows();
    } catch (e) { addToast(`Error: ${(e as Error).message}`, "error"); }
  }, [selectedFlow, nodes, edges, tenantId, addToast, fetchFlows]);

  // ── Drag from palette ─────────────────────────────────────────────
  const addNodeToCanvas = useCallback((catalogType: string) => {
    if (!selectedFlow) { addToast("Selecciona un flujo primero", "error"); return; }
    const cat = NODE_CATALOG.find(c => c.type === catalogType)!;
    const newNode: Node = {
      id: `${catalogType}_${Date.now()}`,
      type: "flowNode",
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label: cat.label, nodeType: catalogType, config: {} },
    };
    setNodes(nds => {
      const newNodes = [...nds, newNode];
      setGraphJsonEditor(JSON.stringify({ nodes: newNodes.map(n => ({ id: n.id, type: (n.data as any).nodeType, position: n.position, data: { label: n.data.label, config: n.data.config } })), edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })) }, null, 2));
      return newNodes;
    });
  }, [selectedFlow, edges, addToast]);

  // ── Drawer save ───────────────────────────────────────────────────
  const saveDrawer = useCallback(() => {
    if (!drawerNode) return;
    try {
      const parsed = JSON.parse(drawerConfig);
      setNodes(nds => {
        const newNodes = nds.map(n => n.id === drawerNode.id ? { ...n, data: { ...n.data, label: drawerLabel, config: parsed } } : n);
        setGraphJsonEditor(JSON.stringify({ nodes: newNodes.map(n => ({ id: n.id, type: (n.data as any).nodeType, position: n.position, data: { label: n.data.label, config: n.data.config } })), edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })) }, null, 2));
        return newNodes;
      });
      setDrawerNode(null);
      addToast("Nodo actualizado", "success");
    } catch { addToast("JSON inválido en config", "error"); }
  }, [drawerNode, drawerConfig, drawerLabel, edges, addToast]);

  // ── CRUD ──────────────────────────────────────────────────────────
  const openCreate = () => { setEditingFlow(null); setFlowName(""); setTriggerType("inbound_channel"); setTriggerConfig("{}"); setShowModal(true); };
  const openEdit = (f: TenantFlow) => { setEditingFlow(f); setFlowName(f.name); setTriggerType(f.trigger_type); setTriggerConfig(JSON.stringify(f.trigger_config, null, 2)); setShowModal(true); };

  const handleSave = async () => {
    if (!flowName.trim()) { addToast("Nombre requerido", "error"); return; }
    let pc = {};
    try { pc = JSON.parse(triggerConfig); } catch { addToast("Trigger config JSON inválido", "error"); return; }
    const payload: any = { name: flowName.trim(), trigger_type: triggerType, trigger_config: pc };
    try {
      const url = editingFlow ? `${API_URL}/admin/tenants/${tenantId}/flows/${editingFlow.id}` : `${API_URL}/admin/tenants/${tenantId}/flows`;
      const r = await fetch(url, { method: editingFlow ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Error"); }
      addToast(editingFlow ? "Flujo actualizado" : "Flujo creado", "success");
      setShowModal(false);
      fetchFlows();
    } catch (e) { addToast(`Error: ${(e as Error).message}`, "error"); }
  };

  const handleToggle = async (f: TenantFlow) => {
    try {
      const r = await fetch(`${API_URL}/admin/tenants/${tenantId}/flows/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ is_active: !f.is_active }) });
      if (!r.ok) throw new Error("toggle failed");
      addToast(`Flujo ${!f.is_active ? "activado" : "desactivado"}`, "success"); fetchFlows();
    } catch (e) { addToast(`Error: ${(e as Error).message}`, "error"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este flujo?")) return;
    try {
      const r = await fetch(`${API_URL}/admin/tenants/${tenantId}/flows/${id}?confirm=true`, { method: "DELETE", headers: getAuthHeader() });
      if (!r.ok) throw new Error("delete failed");
      addToast("Flujo eliminado", "success");
      if (selectedFlow?.id === id) { setSelectedFlow(null); setNodes([]); setEdges([]); }
      fetchFlows();
    } catch (e) { addToast(`Error: ${(e as Error).message}`, "error"); }
  };

  const totalPages = Math.ceil(total / limit);
  const triggerInfo = (t: string) => TRIGGER_TYPES.find(x => x.value === t);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--text-primary)" }}>Motor de Flujos</h3>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>{total} flujo{total !== 1 ? "s" : ""}</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate} id="create-flow-button">+ Nuevo Flujo</button>
      </div>

      {/* Node Palette */}
      <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-3)", flexWrap: "wrap" }}>
        {NODE_CATALOG.map(nt => (
          <button key={nt.type} className="btn btn-ghost btn-sm" onClick={() => addNodeToCanvas(nt.type)}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
            <span>{nt.icon}</span> {nt.label}
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: nt.color, display: "inline-block" }} />
          </button>
        ))}
      </div>

      {/* Layout: List + Canvas + Drawer */}
      <div style={{ display: "grid", gridTemplateColumns: drawerNode ? "240px 1fr 280px" : "240px 1fr", gap: "var(--sp-3)", height: 520 }}>
        {/* Flow list sidebar */}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          {isLoading ? <div className="skeleton skeleton-card" /> : flows.length === 0 ? (
            <div style={{ padding: "var(--sp-4)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>Sin flujos</div>
          ) : flows.map(f => {
            const ti = triggerInfo(f.trigger_type);
            return (
              <div key={f.id} onClick={() => loadGraph(f)} style={{
                padding: "var(--sp-2)", borderRadius: "var(--radius-md)", cursor: "pointer",
                border: `1px solid ${selectedFlow?.id === f.id ? "var(--accent)" : "var(--border-subtle)"}`,
                background: selectedFlow?.id === f.id ? "var(--surface-2)" : "var(--surface-1)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "var(--text-sm)" }}>{f.name}</strong>
                  <span className={`badge ${f.is_active ? "badge-success" : "badge-neutral"}`} style={{ fontSize: 10 }}>{f.is_active ? "ON" : "OFF"}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ti?.icon} {ti?.label}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: "2px 4px", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); handleToggle(f); }}>{f.is_active ? "⏸" : "▶"}</button>
                  <button className="btn btn-ghost" style={{ padding: "2px 4px", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); openEdit(f); }}>⚙</button>
                  <button className="btn btn-ghost" style={{ padding: "2px 4px", fontSize: 11, color: "var(--danger)" }} onClick={(e) => { e.stopPropagation(); handleDelete(f.id); }}>✕</button>
                </div>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span style={{ fontSize: 11, alignSelf: "center" }}>{page}/{totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </div>

        {/* React Flow Canvas */}
        <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden", background: "var(--surface-2)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "var(--sp-2)", background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)" }}>
            <button className={`btn btn-sm ${viewMode === "visual" ? "btn-primary" : "btn-ghost"}`} onClick={() => setViewMode("visual")}>Visual</button>
            <button className={`btn btn-sm ${viewMode === "json" ? "btn-primary" : "btn-ghost"}`} onClick={() => setViewMode("json")}>JSON Raw</button>
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            {graphError ? (
              <FlowErrorBoundaryFallback error={graphError} onRetry={() => { setGraphError(null); setNodes([]); setEdges([]); }} />
            ) : !selectedFlow ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                Selecciona un flujo para editar su grafo
              </div>
            ) : viewMode === "visual" ? (
              <ReactFlow
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                onNodeClick={onNodeClick} fitView
                style={{ width: "100%", height: "100%" }}
              >
                <Background gap={16} size={1} />
                <Controls />
                <MiniMap style={{ height: 80, width: 120 }} />
              </ReactFlow>
            ) : (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "var(--sp-3)", gap: "var(--sp-3)" }}>
                <JsonEditor label="Grafo JSON" value={graphJsonEditor} onChange={v => setGraphJsonEditor(v)} rows={20} />
                <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => {
                  try {
                    const parsed = JSON.parse(graphJsonEditor);
                    const rfNodes: Node[] = (parsed.nodes || []).map((n: any) => ({
                      id: n.id, type: "flowNode", position: n.position || { x: 0, y: 0 },
                      data: { label: n.data?.label || n.type, nodeType: n.type || n.data?.type || "trigger", config: n.data?.config || {} },
                    }));
                    const rfEdges: Edge[] = (parsed.edges || []).map((e: any) => ({
                      id: e.id || `${e.source}-${e.target}`, source: e.source, target: e.target, sourceHandle: e.sourceHandle || null,
                      animated: true, style: { stroke: "var(--accent)" },
                    }));
                    setNodes(rfNodes);
                    setEdges(rfEdges);
                    addToast("Grafo JSON aplicado a la vista visual", "success");
                  } catch (e) {
                    addToast("JSON inválido", "error");
                  }
                }}>Aplicar al Canvas Visual</button>
              </div>
            )}
          </div>
        </div>

        {/* Drawer lateral */}
        {drawerNode && (
          <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--sp-3)", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
              <h4 style={{ margin: 0, fontSize: "var(--text-md)" }}>Configurar Nodo</h4>
              <button className="btn btn-ghost btn-sm" onClick={() => setDrawerNode(null)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <div>
                <label className="form-label">Etiqueta</label>
                <input className="form-input" value={drawerLabel} onChange={e => setDrawerLabel(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Tipo</label>
                <div className="badge badge-info">{((drawerNode.data as any).nodeType as string) || "trigger"}</div>
              </div>
              {((drawerNode.data as any).nodeType === "llm") && (
                <div>
                  <label className="form-label">System Prompt</label>
                  <textarea className="form-input" rows={3} style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                    value={(JSON.parse(drawerConfig)?.system_prompt) || ""}
                    onChange={e => { try { const c = JSON.parse(drawerConfig); c.system_prompt = e.target.value; setDrawerConfig(JSON.stringify(c, null, 2)); } catch {} }}
                  />
                </div>
              )}
              {((drawerNode.data as any).nodeType === "switch") && schemaKeys.length > 0 && (
                <div>
                  <label className="form-label">Campo de evaluación</label>
                  <select className="form-input" value={JSON.parse(drawerConfig || "{}").field || ""}
                    onChange={e => { try { const c = JSON.parse(drawerConfig); c.field = e.target.value; setDrawerConfig(JSON.stringify(c, null, 2)); } catch {} }}>
                    <option value="">Seleccionar...</option>
                    {schemaKeys.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              )}
              {((drawerNode.data as any).nodeType === "send_message") ? (
                <>
                  <div>
                    <label className="form-label">Canal de Salida (Opcional)</label>
                    <select className="form-input" value={(JSON.parse(drawerConfig || "{}").channel_id) || ""}
                      onChange={e => { try { const c = JSON.parse(drawerConfig || "{}"); c.channel_id = e.target.value; setDrawerConfig(JSON.stringify(c, null, 2)); } catch {} }}>
                      <option value="">(Mismo que el origen)</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Mensaje a enviar</label>
                    <textarea className="form-input" rows={4} style={{ fontSize: 13 }}
                      value={(JSON.parse(drawerConfig || "{}").message) || ""}
                      onChange={e => { try { const c = JSON.parse(drawerConfig || "{}"); c.message = e.target.value; setDrawerConfig(JSON.stringify(c, null, 2)); } catch {} }}
                      placeholder="Escribe el mensaje..."
                    />
                  </div>
                </>
              ) : (
                <div>
                  <JsonEditor label="Config JSON" value={drawerConfig} onChange={v => setDrawerConfig(v)} rows={6} />
                </div>
              )}
              <button className="btn btn-primary btn-sm" onClick={saveDrawer}>Aplicar</button>
            </div>
          </div>
        )}
      </div>

      {/* Save graph button */}
      {selectedFlow && (
        <div style={{ marginTop: "var(--sp-3)", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={saveGraph} id="save-graph-button">Guardar Grafo</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ marginBottom: "var(--sp-3)" }}>{editingFlow ? "Editar Flujo" : "Nuevo Flujo"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div><label className="form-label">Nombre</label><input className="form-input" value={flowName} onChange={e => setFlowName(e.target.value)} id="flow-name-input" /></div>
              <div>
                <label className="form-label">Trigger</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)" }}>
                  {TRIGGER_TYPES.map(tt => (
                    <div key={tt.value} onClick={() => setTriggerType(tt.value)} style={{
                      padding: "var(--sp-2)", borderRadius: "var(--radius-md)", cursor: "pointer",
                      border: `2px solid ${triggerType === tt.value ? "var(--accent)" : "var(--border-subtle)"}`,
                      background: triggerType === tt.value ? "var(--surface-2)" : "var(--surface-1)",
                    }}>
                      <div style={{ fontSize: 18 }}>{tt.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{tt.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {triggerType === "inbound_channel" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                  <div>
                    <label className="form-label">Canal a Escuchar</label>
                    <select className="form-input" 
                      value={(() => { try { return JSON.parse(triggerConfig || "{}").channel_id || ""; } catch { return ""; } })()}
                      onChange={e => {
                        const val = e.target.value;
                        try {
                          const c = JSON.parse(triggerConfig || "{}");
                          if (val) c.channel_id = val; else delete c.channel_id;
                          setTriggerConfig(JSON.stringify(c, null, 2));
                        } catch {}
                      }}
                    >
                      <option value="">Cualquier Canal</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Restringir a Contactos Autorizados</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", maxHeight: 150, overflowY: "auto", border: "1px solid var(--border-subtle)", padding: "var(--sp-2)", borderRadius: "var(--radius-md)", background: "var(--surface-1)" }}>
                      {contacts.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No hay contactos en el directorio.</div>
                      ) : contacts.map(c => {
                        const phone = c.metadata?.phone_number || "";
                        if (!phone) return null;
                        const isSelected = (() => { try { return (JSON.parse(triggerConfig || "{}").filter_contacts || []).includes(phone); } catch { return false; } })();
                        return (
                          <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                            <input type="checkbox" checked={isSelected} onChange={e => {
                              try {
                                const cfg = JSON.parse(triggerConfig || "{}");
                                let arr = cfg.filter_contacts || [];
                                if (e.target.checked) arr.push(phone);
                                else arr = arr.filter((p: string) => p !== phone);
                                cfg.filter_contacts = arr;
                                setTriggerConfig(JSON.stringify(cfg, null, 2));
                              } catch {}
                            }} />
                            <span>{c.display_name} <span style={{ color: "var(--text-tertiary)" }}>({phone})</span></span>
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>Si no seleccionas ninguno, el flujo responderá a todos.</div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="form-label">Trigger Config (JSON)</label>
                  <JsonEditor label="Trigger Config" value={triggerConfig} onChange={v => setTriggerConfig(v)} rows={3} />
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} id="save-flow-button">{editingFlow ? "Guardar" : "Crear"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Wrapper with Provider ─────────────────────────────────────────────
export function FlowBuilderPanel(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
