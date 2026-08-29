// dinowiki-node.js — Flow Engine Node: DinoWiki Knowledge Base
//
// Provides read/write access to a directory of Obsidian-compatible Markdown files.
// Used as a flow-engine node type to answer queries and modify content based on
// incoming WhatsApp messages.
//
// Operations:
//   - query:  Searches all .md files for keyword matches, returns relevant content.
//   - modify: Appends or overwrites content in a specific .md file.
//
// Configuration (via node.data.config in graph JSON):
//   - wiki_path:  Absolute path to the knowledge base directory (required).
//   - operation:  'query' | 'modify' | 'auto' (default: 'auto').
//                 'auto' uses heuristics to detect intent from the message.
//   - max_results: Maximum number of files to include in query response (default: 3).
//   - max_chars:   Maximum characters per file excerpt (default: 1500).

import fs from 'fs';
import path from 'path';

/**
 * Recursively collect all .md files under a directory.
 * @param {string} dir - Root directory to scan
 * @param {string[]} [acc] - Accumulator
 * @returns {string[]} Array of absolute paths
 */
function collectMarkdownFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    // Skip hidden directories (.obsidian, .git, .agents, etc.)
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(full, acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Simple keyword search: scores each file by number of keyword matches.
 * Strips frontmatter before scoring.
 *
 * @param {string[]} files - Absolute paths to .md files
 * @param {string[]} keywords - Lowercase keywords to match
 * @param {number} maxResults - Max files to return
 * @param {number} maxChars - Max chars per excerpt
 * @returns {{ file: string, basename: string, score: number, excerpt: string }[]}
 */
function searchFiles(files, keywords, maxResults = 3, maxChars = 1500) {
  const scored = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Strip YAML frontmatter for scoring (but keep it for context)
    const bodyContent = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    const lowerBody = bodyContent.toLowerCase();

    let score = 0;
    for (const kw of keywords) {
      // Count occurrences
      let idx = 0;
      while ((idx = lowerBody.indexOf(kw, idx)) !== -1) {
        score++;
        idx += kw.length;
      }
    }

    // Also score filename matches (higher weight)
    const basename = path.basename(filePath, '.md').toLowerCase();
    for (const kw of keywords) {
      if (basename.includes(kw)) {
        score += 5;
      }
    }

    if (score > 0) {
      scored.push({
        file: filePath,
        basename: path.basename(filePath, '.md'),
        score,
        excerpt: bodyContent.substring(0, maxChars),
      });
    }
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

/**
 * Detect operation intent from the message text.
 * Returns 'modify' if the message contains write-intent keywords, otherwise 'query'.
 */
function detectIntent(message) {
  const lower = (message || '').toLowerCase();
  const modifyPatterns = [
    'agregar', 'añadir', 'modificar', 'cambiar', 'actualizar', 'editar',
    'eliminar', 'borrar', 'quitar', 'crear nodo', 'nuevo nodo',
    'registrar', 'anotar', 'apuntar', 'documentar',
    'agrega', 'añade', 'modifica', 'cambia', 'actualiza',
  ];
  for (const pattern of modifyPatterns) {
    if (lower.includes(pattern)) {
      return 'modify';
    }
  }
  return 'query';
}

/**
 * Extract keywords from a natural language message.
 * Removes common Spanish stop words and short words.
 */
function extractKeywords(message) {
  const stopWords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del',
    'en', 'con', 'por', 'para', 'que', 'qué', 'como', 'cómo', 'es', 'son',
    'está', 'están', 'hay', 'no', 'si', 'sí', 'se', 'su', 'sus', 'al',
    'lo', 'le', 'les', 'me', 'te', 'nos', 'yo', 'tú', 'él', 'ella',
    'eso', 'esto', 'ese', 'esta', 'sobre', 'tiene', 'tiene', 'ser', 'haber',
    'hacer', 'poder', 'quiero', 'saber', 'decir', 'dime', 'cuál', 'cuáles',
    'quién', 'quiénes', 'dónde', 'cuándo', 'cuánto', 'cuántos',
    'más', 'menos', 'todo', 'todos', 'toda', 'todas', 'muy', 'mucho',
    'poco', 'algo', 'nada', 'otro', 'otra', 'otros', 'otras',
    'pero', 'sin', 'también', 'así', 'aquí', 'ahí', 'allí',
    'donde', 'cuando', 'porque', 'aunque', 'entre', 'cada',
    'agregar', 'añadir', 'modificar', 'cambiar', 'actualizar', 'editar',
    'eliminar', 'borrar', 'quitar', 'registrar', 'anotar', 'apuntar',
    'documentar', 'agrega', 'añade', 'modifica', 'cambia', 'actualiza',
    'consultar', 'buscar', 'información', 'dato', 'datos', 'cual',
  ]);

  return (message || '')
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Execute the DinoWiki node.
 *
 * @param {object} nodeConfig - Node configuration from graph
 * @param {object} inputData - Input CloudEvent data (trigger data from boss-worker)
 * @param {object} context - { client, tenantId, flowId }
 * @param {object} log - Pino logger
 * @returns {object} Output data for the next node
 */
export async function executeDinoWikiNode(nodeConfig, inputData, context, log) {
  const wikiPath = nodeConfig.wiki_path;
  if (!wikiPath) {
    throw new Error('dinowiki node requires wiki_path in config');
  }

  // Verify path exists
  if (!fs.existsSync(wikiPath)) {
    throw new Error(`DinoWiki path does not exist: ${wikiPath}`);
  }

  const message = inputData.message || '';
  const operation = nodeConfig.operation === 'auto' || !nodeConfig.operation
    ? detectIntent(message)
    : nodeConfig.operation;
  const maxResults = nodeConfig.max_results || 3;
  const maxChars = nodeConfig.max_chars || 1500;

  log.info({ wikiPath, operation, message: message.substring(0, 80) }, 'DinoWiki node executing');

  if (operation === 'query') {
    // ── QUERY: Search markdown files for relevant content ──
    const keywords = extractKeywords(message);
    if (keywords.length === 0) {
      return {
        ...inputData,
        dinowiki_response: 'No pude extraer palabras clave de tu consulta. ¿Podrías reformularla?',
        dinowiki_operation: 'query',
        dinowiki_results: 0,
      };
    }

    const files = collectMarkdownFiles(wikiPath);
    const results = searchFiles(files, keywords, maxResults, maxChars);

    if (results.length === 0) {
      return {
        ...inputData,
        dinowiki_response: `No encontré información relevante en la base de conocimientos para: "${keywords.join(', ')}".`,
        dinowiki_operation: 'query',
        dinowiki_results: 0,
      };
    }

    // Build a response with the relevant excerpts
    const sections = results.map((r, i) =>
      `### ${i + 1}. ${r.basename}\n${r.excerpt}`
    );

    const response = `Encontré ${results.length} documento(s) relevante(s):\n\n${sections.join('\n\n---\n\n')}`;

    return {
      ...inputData,
      dinowiki_response: response,
      dinowiki_operation: 'query',
      dinowiki_results: results.length,
      dinowiki_files: results.map(r => r.basename),
    };

  } else if (operation === 'modify') {
    // ── MODIFY: Append content to an existing file or create a new one ──
    // Extract target file from message heuristically
    const keywords = extractKeywords(message);
    const files = collectMarkdownFiles(wikiPath);

    // Find the best matching file to modify
    const matches = searchFiles(files, keywords, 1, 500);
    let targetFile;
    let isNew = false;

    if (matches.length > 0) {
      targetFile = matches[0].file;
    } else {
      // No existing file matches — suggest the user specify which file
      return {
        ...inputData,
        dinowiki_response: `No encontré un nodo existente que coincida con tu solicitud. ` +
          `Para crear uno nuevo, necesito más contexto. ¿A qué categoría pertenece? ` +
          `(terreno: hechos verificables, estrategia: planes y construcciones)`,
        dinowiki_operation: 'modify_pending',
        dinowiki_results: 0,
      };
    }

    // Append the message content to the file
    const timestamp = new Date().toISOString().split('T')[0];
    const appendContent = `\n\n## Actualización (${timestamp})\n\n${message}\n`;

    try {
      fs.appendFileSync(targetFile, appendContent, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write to ${targetFile}: ${err.message}`);
    }

    const basename = path.basename(targetFile, '.md');
    log.info({ targetFile: basename, operation: 'append' }, 'DinoWiki file modified');

    return {
      ...inputData,
      dinowiki_response: `✅ He actualizado el nodo **${basename}** con la información proporcionada.`,
      dinowiki_operation: 'modify',
      dinowiki_modified_file: basename,
      dinowiki_results: 1,
    };
  }

  // Fallback — should never reach here
  return {
    ...inputData,
    dinowiki_response: 'Operación no reconocida.',
    dinowiki_operation: 'unknown',
    dinowiki_results: 0,
  };
}
