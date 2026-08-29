// flow-engine.js — EPIC-004: Universal Flow Engine Worker
// Constraint: §4.7 pg-boss MUST connect directly to PG :5432
// Constraint: §4.5 Advisory locks require session continuity (no pooler)
//
// Covers: MOTR.AV.01-02, MOTR.FN.01-05, MOTR.CR.01-02, MOTR.IN.01-03,
//         MOTR.RS.01-02
//
// This worker processes flows by interpreting the JSONB graph stored in
// tenant_flows. It executes nodes sequentially following edge connections,
// passing CloudEvent-compatible data between nodes.
//
// Node Types:
//   - trigger: Entry point (receives CloudEvent data)
//   - switch: Conditional branching (evaluates expressions)
//   - llm: AI model invocation (with mandatory on_ai_failure branch)
//   - stt: Speech-to-text transcription
//   - send_message: Sends message via channel
//   - sql_script: Executes parameterized SQL
//
// Inter-node data format: CloudEvents (ce-type, ce-source, ce-time, data)

import { PgBoss } from 'pg-boss';
import pg from 'pg';
import pino from 'pino';
import { createCloudEvent, wrapPayload, isCloudEvent, CE_TYPES } from '../../lib/cloudevent.js';
import config from '../../config.js';
import { executeDinoWikiNode } from './nodes/dinowiki-node.js';

const log = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const QUEUE_NAME = 'flow-execute';

const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT;
if (isTestEnv) {
  const isDefaultSandbox =
    (config.db.host === 'localhost' || config.db.host === '127.0.0.1' || config.db.host === '0.0.0.0') &&
    config.db.database === 'jarvis' &&
    !process.env.ALLOW_TEST_POLLUTION;

  if (isDefaultSandbox) {
    throw new Error(
      `[SECURITY/ISOLATION] Connection blocked: Attempted to connect to the active development/sandbox database during test execution.`
    );
  }
}

// MOTR.IN.02: Direct connection to PG :5432, NOT through pooler
const boss = new PgBoss({
  connectionString: config.boss.connectionString,
  newJobCheckIntervalSeconds: config.boss.newJobCheckIntervalSeconds,
});

// Worker-dedicated pool (MOTR.RS.02: max 10 connections)
const { Pool } = pg;
const workerPool = new Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

workerPool.on('error', (err) => {
  log.error({ err: err.message }, 'Flow engine pool error');
});

// CloudEvent factory imported from src/lib/cloudevent.js
// Ref: UD-039 (CloudEvents as interchange contract)

const KNOWN_NODE_TYPES = new Set(['trigger', 'switch', 'llm', 'stt', 'send_message', 'sql_script', 'dinowiki']);

/**
 * Validates all node types in a graph. Throws descriptive error for unknown types.
 * MOTR.RS.02: Unknown node type → descriptive error, job "failed"
 */
function validateGraph(graph, flowId) {
  const { nodes = [] } = graph || {};
  for (const node of nodes) {
    const nodeType = node.type || node.data?.type;
    if (!KNOWN_NODE_TYPES.has(nodeType)) {
      throw new Error(
        `Flow "${flowId}" contains unknown node type "${nodeType}" (node "${node.id}"). ` +
        `Valid types: ${[...KNOWN_NODE_TYPES].join(', ')}.`
      );
    }
  }
}

/**
 * Execute a single node in the flow graph.
 * Returns the output data to be passed to the next node.
 *
 * @param {object} node - Node definition from the graph
 * @param {object} inputEvent - CloudEvent input from previous node
 * @param {object} context - Execution context { client, tenantId, flowId }
 * @returns {object} { output: CloudEvent, nextNodeId: string|null, branch: string }
 */
async function executeNode(node, inputEvent, context) {
  const { client, tenantId, flowId } = context;
  const nodeType = node.type || node.data?.type;
  const nodeConfig = node.data?.config || {};
  const startTime = performance.now();

  log.info({ flowId, nodeId: node.id, nodeType }, 'Executing flow node');

  let output = inputEvent.data;
  let branch = 'default';

  try {
    switch (nodeType) {
      case 'trigger':
        // Trigger nodes pass through the input data
        output = inputEvent.data;
        break;

      case 'switch': {
        // Evaluate condition against input data
        const field = nodeConfig.field || 'type';
        const value = inputEvent.data?.[field];
        const conditions = nodeConfig.conditions || {};
        
        // Find matching condition branch
        branch = 'default';
        for (const [condValue, condBranch] of Object.entries(conditions)) {
          if (String(value) === String(condValue)) {
            branch = condBranch;
            break;
          }
        }
        output = inputEvent.data;
        break;
      }

      case 'llm': {
        // MOTR.CR.02: Every LLM node MUST have on_ai_failure branch
        const model = nodeConfig.model || 'default';
        const prompt = nodeConfig.prompt || '';
        const systemPrompt = nodeConfig.system_prompt || '';

        try {
          // Construct prompt with input data interpolation
          const resolvedPrompt = prompt.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
            return inputEvent.data?.[key] ?? '';
          });

          // Mock LLM call - in production this would call the configured model
          // For now, we create a placeholder response
          output = {
            ...inputEvent.data,
            llm_response: `[LLM:${model}] Processed: ${resolvedPrompt.substring(0, 100)}`,
            llm_model: model,
          };
        } catch (llmErr) {
          log.error({ err: llmErr.message, nodeId: node.id }, 'LLM execution failed, routing to on_ai_failure');
          branch = 'on_ai_failure';
          output = {
            ...inputEvent.data,
            llm_error: llmErr.message,
          };
        }
        break;
      }

      case 'stt': {
        const audioUrl = inputEvent.data?.s3_url || inputEvent.data?.audio_url;
        if (audioUrl) {
          // Mock STT - in production this would call Whisper or similar
          output = {
            ...inputEvent.data,
            transcription: `[STT] Transcription of ${audioUrl}`,
          };
        } else {
          output = {
            ...inputEvent.data,
            transcription: '[STT] No audio source provided',
          };
        }
        break;
      }

      case 'send_message': {
        const to = nodeConfig.to || inputEvent.data?.sender;
        const text = nodeConfig.text || inputEvent.data?.llm_response || inputEvent.data?.transcription || '';

        // Resolve template variables in text
        const resolvedText = text.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
          return inputEvent.data?.[key] ?? '';
        });

        if (to && resolvedText) {
          // ── Channel-agnostic dispatch ──────────────────────────────────
          // Resolve the adapter queue and CE type from the channel that
          // originated this flow execution.  This keeps the flow-engine
          // decoupled from any specific adapter implementation.
          const channelId = inputEvent.data?.channelId || null;
          let sendQueue = null;
          let ceType = null;

          if (channelId) {
            const chRes = await client.query(
              `SELECT config->>'channel_type' AS channel_type FROM wapp_channels WHERE id = $1`,
              [channelId]
            );
            const channelType = chRes.rows[0]?.channel_type || 'whatsapp_baileys';

            // Adapter routing table — extend here when new adapters are added
            const ADAPTER_ROUTES = {
              whatsapp_baileys: { queue: 'wapp-send-process', ceType: CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_OUTBOUND },
              // Future: email, sms, telegram, etc.
            };

            const route = ADAPTER_ROUTES[channelType];
            if (route) {
              sendQueue = route.queue;
              ceType = route.ceType;
            } else {
              log.warn({ channelType, flowId, nodeId: node.id }, 'No adapter route for channel type, falling back to whatsapp_baileys');
              sendQueue = 'wapp-send-process';
              ceType = CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_OUTBOUND;
            }
          } else {
            // No channelId in trigger data — fall back to WhatsApp for backward compat
            sendQueue = 'wapp-send-process';
            ceType = CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_OUTBOUND;
          }

          await boss.send(sendQueue, wrapPayload(
            ceType, `flow/${flowId}/node/${node.id}`,
            { to, text: resolvedText, tenantId, channelId },
            { tenantid: tenantId, channelid: channelId }
          ));
          log.info({ to, flowId, nodeId: node.id, sendQueue }, 'Message enqueued for delivery');
        }

        output = {
          ...inputEvent.data,
          message_sent: !!to,
          message_to: to,
        };
        break;
      }

      case 'sql_script': {
        // Execute parameterized SQL within the tenant-isolated transaction
        const sql = nodeConfig.sql || '';
        const paramKeys = nodeConfig.params || [];
        const params = paramKeys.map(key => inputEvent.data?.[key] ?? null);

        if (sql) {
          const result = await client.query(sql, params);
          output = {
            ...inputEvent.data,
            sql_result: result.rows,
            sql_row_count: result.rowCount,
          };
        }
        break;
      }

      case 'dinowiki': {
        // Knowledge base read/write against Obsidian markdown files
        output = await executeDinoWikiNode(nodeConfig, inputEvent.data, context, log);
        break;
      }

      default:
        log.warn({ nodeType, nodeId: node.id }, 'Unknown node type, passing through');
        output = inputEvent.data;
    }
  } catch (err) {
    log.error({ err: err.message, nodeId: node.id, nodeType }, 'Node execution error');
    
    // For LLM nodes, route to on_ai_failure
    if (nodeType === 'llm') {
      branch = 'on_ai_failure';
      output = { ...inputEvent.data, llm_error: err.message };
    } else {
      throw err; // Non-LLM errors bubble up for transaction rollback
    }
  }

  const durationMs = performance.now() - startTime;
  log.info({ flowId, nodeId: node.id, nodeType, branch, durationMs }, 'Node execution complete');

  // Log to activity_logs
  await client.query(
    `INSERT INTO activity_logs (tenant_id, event_type, description, metadata)
     VALUES ($1, $2, $3, $4)`,
    [
      tenantId,
      'flow_node_executed',
      `Flow "${flowId}" node "${node.id}" (${nodeType}) executed. Branch: ${branch}`,
      JSON.stringify({ flowId, nodeId: node.id, nodeType, branch, durationMs }),
    ]
  );

  const outputEvent = createCloudEvent(
    `${CE_TYPES.FLOW_NODE_OUTPUT}.${nodeType}`,
    `flow/${flowId}/node/${node.id}`,
    output,
    { tenantid: tenantId }
  );

  return { output: outputEvent, branch };
}

/**
 * Process a flow by traversing its graph.
 * Executes nodes sequentially following edges.
 *
 * MOTR.FN.01: Sequential graph traversal
 * MOTR.FN.05: Forward-only idempotency — completed nodes are NOT rolled back.
 *             On retry, already-executed nodes are skipped. Each node commits
 *             independently to preserve side effects (messages sent, SQL executed).
 *
 * @param {PgBoss.Job[]} jobs
 */
async function handleFlowJob(jobs) {
  for (const job of jobs) {
    const jobData = isCloudEvent(job.data) ? job.data.data : job.data;
    const { flowId, tenantId, triggerData, executionId: existingExecutionId } = jobData;
    const executionId = existingExecutionId || job.id;

    log.info({ jobId: job.id, flowId, tenantId, executionId }, 'Processing flow execution');

    // ── Load previously completed nodes for this execution (idempotency) ──
    const completedNodes = new Set();
    const stateClient = await workerPool.connect();
    try {
      const stateRes = await stateClient.query(
        `SELECT completed_node_ids FROM flow_execution_state
         WHERE execution_id = $1 AND flow_id = $2`,
        [executionId, flowId]
      );
      if (stateRes.rows.length > 0) {
        const ids = stateRes.rows[0].completed_node_ids || [];
        ids.forEach(id => completedNodes.add(id));
        log.info({ executionId, resumeFromCount: completedNodes.size }, 'Resuming flow execution (forward-only idempotency)');
      }
    } catch (err) {
      // Table might not exist yet — proceed without idempotency state
      log.warn({ err: err.message }, 'Could not load execution state, proceeding fresh');
    } finally {
      stateClient.release();
    }

    const client = await workerPool.connect();
    try {
      // ── Fetch flow graph ──────────────────────────────────────────
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('request.jwt.claims.tenant_id', $1, true)`,
        [tenantId]
      );

      const flowRes = await client.query(
        `SELECT id, name, trigger_type, trigger_config, graph, is_active
         FROM tenant_flows
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [flowId, tenantId]
      );
      await client.query('COMMIT');

      if (flowRes.rows.length === 0) {
        log.warn({ flowId, tenantId }, 'Flow not found or inactive');
        return;
      }

      const flow = flowRes.rows[0];
      if (!flow.is_active) {
        log.info({ flowId }, 'Flow is inactive, skipping');
        return;
      }

      const { nodes = [], edges = [] } = flow.graph || {};

      if (nodes.length === 0) {
        log.warn({ flowId }, 'Flow has no nodes, skipping');
        return;
      }

      // MOTR.RS.02: Validate graph before execution
      validateGraph(flow.graph, flowId);

      // Find trigger node (entry point)
      const triggerNode = nodes.find(n => (n.type || n.data?.type) === 'trigger');
      if (!triggerNode) {
        log.warn({ flowId }, 'No trigger node found in flow');
        return;
      }

      // Build adjacency map from edges
      const adjacency = {};
      for (const edge of edges) {
        if (!adjacency[edge.source]) adjacency[edge.source] = [];
        adjacency[edge.source].push({
          targetNodeId: edge.target,
          branch: edge.sourceHandle || 'default',
          sourceHandle: edge.sourceHandle || null,
        });
      }

      // Build node lookup map
      const nodeMap = {};
      for (const node of nodes) {
        nodeMap[node.id] = node;
      }

      // ── Execute graph: forward-only per-node commit ────────────
      let currentEvent = createCloudEvent(
        CE_TYPES.FLOW_TRIGGER,
        `flow/${flowId}`,
        triggerData || {},
        { tenantid: tenantId }
      );

      const executionOrder = [];
      const visited = new Set();
      const queue = [triggerNode.id];

      while (queue.length > 0) {
        const currentNodeId = queue.shift();
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);

        const currentNode = nodeMap[currentNodeId];
        if (!currentNode) {
          log.warn({ flowId, nodeId: currentNodeId }, 'Node not found in graph');
          continue;
        }

        // ── Forward-only idempotency: skip already-completed nodes ──
        if (completedNodes.has(currentNodeId)) {
          log.info({ flowId, nodeId: currentNodeId }, 'Skipping already-completed node (forward-only)');
          executionOrder.push({ nodeId: currentNodeId, branch: 'skipped' });
          // Still need to traverse edges to reach remaining nodes
          const nextEdges = adjacency[currentNodeId] || [];
          for (const edge of nextEdges) {
            queue.push(edge.targetNodeId);
          }
          continue;
        }

        // ── Execute node in its own transaction ─────────────────
        const nodeClient = await workerPool.connect();
        try {
          await nodeClient.query('BEGIN');
          await nodeClient.query(
            `SELECT set_config('request.jwt.claims.tenant_id', $1, true)`,
            [tenantId]
          );

          const context = { client: nodeClient, tenantId, flowId };
          const { output, branch } = await executeNode(currentNode, currentEvent, context);
          currentEvent = output;
          executionOrder.push({ nodeId: currentNodeId, branch });

          // ── Persist completed node to execution state ──────────
          await nodeClient.query(
            `INSERT INTO flow_execution_state (execution_id, flow_id, tenant_id, completed_node_ids)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (execution_id) DO UPDATE
             SET completed_node_ids = flow_execution_state.completed_node_ids || $5,
                 updated_at = NOW()`,
            [executionId, flowId, tenantId, JSON.stringify([currentNodeId]), JSON.stringify([currentNodeId])]
          );

          await nodeClient.query('COMMIT');

          // Find next nodes based on branch
          const nextEdges = adjacency[currentNodeId] || [];
          for (const edge of nextEdges) {
            if (edge.branch === branch || (!edge.sourceHandle)) {
              queue.push(edge.targetNodeId);
            }
          }
        } catch (err) {
          await nodeClient.query('ROLLBACK');
          log.error({ jobId: job.id, flowId, nodeId: currentNodeId, err: err.message }, 'Node execution failed, rolled back this node only');

          // Log failure to activity_logs (outside failed transaction)
          const logClient = await workerPool.connect();
          try {
            await logClient.query(
              `INSERT INTO activity_logs (tenant_id, event_type, description, metadata)
               VALUES ($1, $2, $3, $4)`,
              [
                tenantId,
                'flow_node_failed',
                `Flow "${flow.name}" node "${currentNodeId}" failed: ${err.message}. Completed ${executionOrder.length} nodes before failure.`,
                JSON.stringify({ flowId, executionId, nodeId: currentNodeId, error: err.message, completedNodes: executionOrder }),
              ]
            );
          } finally {
            logClient.release();
          }

          throw err; // Let pg-boss handle retry (will resume from last completed node)
        } finally {
          nodeClient.release();
        }
      }

      // ── Flow completed: log success and clean up state ──────────
      const completionClient = await workerPool.connect();
      try {
        await completionClient.query('BEGIN');
        await completionClient.query(
          `INSERT INTO activity_logs (tenant_id, event_type, description, metadata)
           VALUES ($1, $2, $3, $4)`,
          [
            tenantId,
            'flow_completed',
            `Flow "${flow.name}" completed successfully. Executed ${executionOrder.length} nodes.`,
            JSON.stringify({ flowId, executionId, executionOrder, nodeCount: executionOrder.length }),
          ]
        );

        // Clean up execution state after successful completion
        await completionClient.query(
          `DELETE FROM flow_execution_state WHERE execution_id = $1`,
          [executionId]
        );
        await completionClient.query('COMMIT');
      } finally {
        completionClient.release();
      }

      log.info({ jobId: job.id, flowId, executionId, nodesExecuted: executionOrder.length }, 'Flow execution completed');
    } catch (err) {
      log.error({ jobId: job.id, flowId, executionId, err: err.message }, 'Flow execution failed (forward-only — completed nodes preserved)');
      throw err; // Let pg-boss handle retry
    } finally {
      client.release();
    }
  }
}

/**
 * Handle scheduled (cron) flow triggers.
 * Scans tenant_flows for scheduled flows and enqueues execution jobs.
 *
 * MOTR.FN.04: Cron trigger support
 */
async function handleCronScan(jobs) {
  for (const job of jobs) {
    log.info({ jobId: job.id }, 'Scanning for scheduled flows');

    const client = await workerPool.connect();
    try {
      // Query all active scheduled flows
      const result = await client.query(
        `SELECT id, tenant_id, name, trigger_config
         FROM tenant_flows
         WHERE trigger_type = 'scheduled' AND is_active = true AND deleted_at IS NULL`
      );

      for (const flow of result.rows) {
        // Simple cron check: if trigger_config has a cron expression,
        // check if it should run now. For a full implementation,
        // this would use a cron parsing library.
        const cronExpr = flow.trigger_config?.cron;
        if (!cronExpr) continue;

        log.info({ flowId: flow.id, tenantId: flow.tenant_id, cron: cronExpr }, 'Enqueuing scheduled flow');

        await boss.send(QUEUE_NAME, wrapPayload(
          CE_TYPES.FLOW_CRON_SCAN, 'flow-engine/cron',
          {
            flowId: flow.id,
            tenantId: flow.tenant_id,
            triggerData: {
              trigger_type: 'scheduled',
              triggered_at: new Date().toISOString(),
              cron: cronExpr,
            },
          },
          { tenantid: flow.tenant_id }
        ));
      }
    } finally {
      client.release();
    }
  }
}

async function start() {
  log.info({ connectionTarget: 'PG direct :5432' }, 'Starting flow-engine worker');

  boss.on('error', (err) => {
    log.error({ err: err.message }, 'flow-engine pg-boss error');
  });

  await boss.start();

  // Create queues
  await boss.createQueue(QUEUE_NAME, { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('flow-cron-scan', { retryBackoff: true, retryLimit: 3 });

  log.info('flow-engine queues created, subscribing');

  // Process flow execution jobs
  await boss.work(QUEUE_NAME, {
    teamSize: 5,
    teamConcurrency: 5,
  }, handleFlowJob);

  // Cron scanner: runs every minute to check for scheduled flows
  await boss.work('flow-cron-scan', {
    teamSize: 1,
    teamConcurrency: 1,
  }, handleCronScan);

  // Schedule the cron scanner to run every minute
  await boss.schedule('flow-cron-scan', '* * * * *', {}, {
    retryLimit: 3,
  });

  log.info('Flow engine worker listening for jobs');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down flow-engine');
  await boss.stop({ graceful: true, timeout: 10_000 });
  await workerPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down flow-engine');
  await boss.stop({ graceful: true, timeout: 10_000 });
  await workerPool.end();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    log.fatal({ err: err.message }, 'Flow engine failed to start');
    process.exit(1);
  });
}

export { handleFlowJob, handleCronScan, workerPool, boss, start };
