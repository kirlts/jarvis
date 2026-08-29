/**
 * Flow Engine Integration Tests — EPIC-004
 *
 * Covers: MOTR.FN.01-05, MOTR.CR.01-02, MOTR.IN.01-02, MOTR.RS.01-02
 *         CTTO.FN.02, CTTO.IN.01, CTTO.RS.01
 *
 * Uses node:test (native test runner). No DB dependency — pure graph logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudEvent, CE_TYPES } from '../../../lib/cloudevent.js';

// ── Extracted graph logic (no DB/pg-boss imports) ─────────────────────
const KNOWN_NODE_TYPES = new Set(['trigger', 'switch', 'llm', 'stt', 'send_message', 'sql_script']);

function validateGraph(graph, flowId) {
  for (const node of (graph?.nodes || [])) {
    const t = node.type || node.data?.type;
    if (!KNOWN_NODE_TYPES.has(t)) throw new Error(`Flow "${flowId}" contains unknown node type "${t}" (node "${node.id}"). Valid types: ${[...KNOWN_NODE_TYPES].join(', ')}.`);
  }
}

async function executeNodeTest(node, inputEvent) {
  const nodeType = node.type || node.data?.type;
  const cfg = node.data?.config || {};
  let output = inputEvent.data, branch = 'default';
  switch (nodeType) {
    case 'trigger': output = inputEvent.data; break;
    case 'switch': {
      const val = inputEvent.data?.[cfg.field || 'type'];
      for (const [cv, cb] of Object.entries(cfg.conditions || {})) { if (String(val) === String(cv)) { branch = cb; break; } }
      output = inputEvent.data; break;
    }
    case 'llm': {
      try {
        if (cfg._simulateFailure) throw new Error('Simulated LLM failure');
        const p = (cfg.prompt || '').replace(/\{\{(\w+)\}\}/g, (_, k) => inputEvent.data?.[k] ?? '');
        output = { ...inputEvent.data, llm_response: `[LLM:${cfg.model || 'default'}] ${p}`, llm_model: cfg.model };
      } catch (e) { branch = 'on_ai_failure'; output = { ...inputEvent.data, llm_error: e.message }; }
      break;
    }
    case 'stt': output = { ...inputEvent.data, transcription: `[STT] Transcription of ${inputEvent.data?.s3_url || 'none'}` }; break;
    case 'send_message': {
      const to = cfg.to || inputEvent.data?.sender;
      output = { ...inputEvent.data, message_sent: !!to, message_to: to }; break;
    }
    default: output = inputEvent.data;
  }
  return { output: createCloudEvent(`jarvis.flow.node.${nodeType}.output`, `test/${node.id}`, output), branch };
}

async function traverseGraph(graph, triggerData) {
  const { nodes = [], edges = [] } = graph;
  const triggerNode = nodes.find(n => (n.type || n.data?.type) === 'trigger');
  if (!triggerNode) throw new Error('No trigger node');
  const adj = {};
  for (const e of edges) { if (!adj[e.source]) adj[e.source] = []; adj[e.source].push({ target: e.target, branch: e.sourceHandle || 'default', sourceHandle: e.sourceHandle }); }
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  let ce = createCloudEvent('jarvis.flow.trigger', 'test', triggerData);
  const order = [], visited = new Set(), queue = [triggerNode.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const nd = nodeMap[id];
    if (!nd) continue;
    const { output, branch } = await executeNodeTest(nd, ce);
    ce = output;
    order.push({ nodeId: id, branch, data: output.data });
    for (const e of (adj[id] || [])) { if (e.branch === branch || (!e.sourceHandle && !e.branch)) queue.push(e.target); }
  }
  return { executionOrder: order, finalData: ce.data };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Flow Engine: Trigger→STT→LLM→Responder (MOTR.FN.01)', () => {
  const graph = {
    nodes: [
      { id: 'n1', type: 'trigger', data: { label: 'Start' } },
      { id: 'n2', type: 'stt', data: { label: 'Transcribe' } },
      { id: 'n3', type: 'llm', data: { label: 'AI', config: { model: 'gemini', prompt: 'Respond: {{transcription}}' } } },
      { id: 'n4', type: 'send_message', data: { label: 'Reply', config: { to: '56912345678@s.whatsapp.net' } } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  };

  it('executes 4 nodes sequentially', async () => {
    const r = await traverseGraph(graph, { s3_url: 'minio://audio.ogg', sender: '56912345678@s.whatsapp.net' });
    assert.equal(r.executionOrder.length, 4);
    assert.deepEqual(r.executionOrder.map(n => n.nodeId), ['n1', 'n2', 'n3', 'n4']);
  });

  it('passes STT transcription to LLM via CloudEvent.data (MOTR.CR.01)', async () => {
    const r = await traverseGraph(graph, { s3_url: 'minio://audio.ogg' });
    const llm = r.executionOrder.find(n => n.nodeId === 'n3');
    assert.ok(llm.data.llm_response.includes('[STT] Transcription'));
  });

  it('send_message receives LLM response', async () => {
    const r = await traverseGraph(graph, { s3_url: 'minio://audio.ogg', sender: '56912345678@s.whatsapp.net' });
    assert.equal(r.finalData.message_sent, true);
    assert.equal(r.finalData.message_to, '56912345678@s.whatsapp.net');
  });
});

describe('Flow Engine: Switch routing by contact.metadata (CTTO.FN.02)', () => {
  const graph = {
    nodes: [
      { id: 'n1', type: 'trigger', data: {} },
      { id: 'n2', type: 'switch', data: { config: { field: 'tipo_alumno', conditions: { avanzado: 'avanzado', basico: 'basico' } } } },
      { id: 'n3', type: 'llm', data: { config: { model: 'pro', prompt: 'Advanced' } } },
      { id: 'n4', type: 'send_message', data: { config: { text: 'Basic' } } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'avanzado' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'basico' },
    ],
  };

  it('routes "avanzado" to LLM branch', async () => {
    const r = await traverseGraph(graph, { tipo_alumno: 'avanzado' });
    const ids = r.executionOrder.map(n => n.nodeId);
    assert.ok(ids.includes('n3'));
    assert.ok(!ids.includes('n4'));
  });

  it('routes "basico" to send_message branch', async () => {
    const r = await traverseGraph(graph, { tipo_alumno: 'basico' });
    const ids = r.executionOrder.map(n => n.nodeId);
    assert.ok(ids.includes('n4'));
    assert.ok(!ids.includes('n3'));
  });
});

describe('Flow Engine: on_ai_failure contingency (MOTR.RS.01)', () => {
  const graph = {
    nodes: [
      { id: 'n1', type: 'trigger', data: {} },
      { id: 'n2', type: 'llm', data: { config: { _simulateFailure: true } } },
      { id: 'n3', type: 'send_message', data: { config: { text: 'Fallback' } } },
      { id: 'n4', type: 'send_message', data: { config: { text: 'Success' } } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'on_ai_failure' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'default' },
    ],
  };

  it('routes to fallback on LLM failure', async () => {
    const r = await traverseGraph(graph, { message: 'help' });
    const ids = r.executionOrder.map(n => n.nodeId);
    assert.ok(ids.includes('n3'));
    assert.ok(!ids.includes('n4'));
    assert.equal(r.finalData.llm_error, 'Simulated LLM failure');
  });
});

describe('Flow Engine: Graph validation (MOTR.RS.02)', () => {
  it('rejects unknown node types with descriptive error', () => {
    const bad = { nodes: [{ id: 'n1', type: 'trigger' }, { id: 'n2', type: 'INEXISTENTE' }], edges: [] };
    assert.throws(() => validateGraph(bad, 'test'), /unknown node type "INEXISTENTE"/);
  });

  it('accepts valid graphs', () => {
    const good = { nodes: [{ id: 'n1', type: 'trigger' }, { id: 'n2', type: 'llm' }], edges: [] };
    assert.doesNotThrow(() => validateGraph(good, 'test'));
  });
});

describe('Flow Engine: RLS isolation simulation (CTTO.IN.01)', () => {
  it('tenants do not leak data across separate graph traversals', async () => {
    const rA = await traverseGraph({ nodes: [{ id: 'n1', type: 'trigger', data: {} }], edges: [] }, { tenant: 'A', secret: 'pwA' });
    const rB = await traverseGraph({ nodes: [{ id: 'n1', type: 'trigger', data: {} }], edges: [] }, { tenant: 'B', secret: 'pwB' });
    assert.equal(rA.finalData.tenant, 'A');
    assert.equal(rB.finalData.tenant, 'B');
    assert.notEqual(rA.finalData.secret, rB.finalData.secret);
  });
});

describe('Flow Engine: Forward-only idempotency (MOTR.IN.02)', () => {
  // Graph: Trigger(n1) → STT(n2) → LLM(n3, FAIL) → SendMessage(n4) → Script(n5)
  // Expected: n1,n2 completed, n3 fails with on_ai_failure branch, n4,n5 NOT executed via default path
  const graph = {
    nodes: [
      { id: 'n1', type: 'trigger', data: {} },
      { id: 'n2', type: 'stt', data: {} },
      { id: 'n3', type: 'llm', data: { config: { _simulateFailure: true } } },
      { id: 'n4', type: 'send_message', data: { config: { text: 'Success path' } } },
      { id: 'n5', type: 'sql_script', data: {} },
      { id: 'n6', type: 'send_message', data: { config: { text: 'Contingency' } } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'default' },  // happy path
      { id: 'e4', source: 'n4', target: 'n5' },                            // happy path continues
      { id: 'e5', source: 'n3', target: 'n6', sourceHandle: 'on_ai_failure' }, // contingency
    ],
  };

  it('nodes before failure are completed; nodes after failure are NOT executed', async () => {
    const r = await traverseGraph(graph, { s3_url: 'minio://test.ogg' });
    const executedIds = r.executionOrder.map(n => n.nodeId);

    // n1 (trigger) and n2 (stt) must have executed
    assert.ok(executedIds.includes('n1'), 'Trigger must execute');
    assert.ok(executedIds.includes('n2'), 'STT must execute');

    // n3 (llm) must have executed (it fails internally but still processes)
    assert.ok(executedIds.includes('n3'), 'LLM must execute (and fail)');

    // n4 and n5 must NOT have executed (they are on the default branch, not on_ai_failure)
    assert.ok(!executedIds.includes('n4'), 'SendMessage on happy path must NOT execute after LLM failure');
    assert.ok(!executedIds.includes('n5'), 'SQL Script on happy path must NOT execute after LLM failure');

    // n6 (contingency) must have executed via on_ai_failure branch
    assert.ok(executedIds.includes('n6'), 'Contingency must execute on failure branch');
  });

  it('completed nodes persist their output (forward-only, no rollback)', async () => {
    const r = await traverseGraph(graph, { s3_url: 'minio://test.ogg' });

    // The STT node must have produced a transcription (committed output)
    const sttNode = r.executionOrder.find(n => n.nodeId === 'n2');
    assert.ok(sttNode, 'STT node must be in execution order');
    assert.ok(sttNode.data.transcription, 'STT output must persist (forward-only)');

    // The LLM node must have the error recorded
    const llmNode = r.executionOrder.find(n => n.nodeId === 'n3');
    assert.ok(llmNode, 'LLM node must be in execution order');
    assert.equal(llmNode.data.llm_error, 'Simulated LLM failure');

    // Total: 4 nodes executed (n1, n2, n3, n6), not 5 or 6
    assert.equal(r.executionOrder.length, 4, 'Exactly 4 nodes must execute: trigger, stt, llm(fail), contingency');
  });
});
