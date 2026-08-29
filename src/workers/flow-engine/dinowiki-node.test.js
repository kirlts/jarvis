import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { executeDinoWikiNode } from './nodes/dinowiki-node.js';

// Minimal logger stub
const log = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('DinoWiki Node', () => {
  let tmpDir;

  before(() => {
    // Create a temporary wiki structure
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dinowiki-test-'));

    // Create terreno/ and estrategia/ directories
    fs.mkdirSync(path.join(tmpDir, 'terreno'));
    fs.mkdirSync(path.join(tmpDir, 'estrategia'));

    // Create sample markdown files
    fs.writeFileSync(path.join(tmpDir, 'terreno', 'Planta de pirólisis.md'), `---
node_type: leaf
estado: draft
---

# Planta de pirólisis

La planta de pirólisis está ubicada en la región de Valparaíso. Procesa neumáticos fuera de uso (NFU) mediante descomposición térmica en ausencia de oxígeno. Los productos resultantes son aceite combustible, negro de humo y acero.

Capacidad actual: 10 toneladas diarias.
Estado operativo: En funcionamiento.
`);

    fs.writeFileSync(path.join(tmpDir, 'terreno', 'Dino Sauvageot.md'), `---
node_type: leaf
estado: draft
---

# Dino Sauvageot

Operador principal del sistema. Hombre de aproximadamente 50 años, residente en Viña del Mar, Chile. Veterano en construcción civil, transporte de residuos, reciclaje empresarial.
`);

    fs.writeFileSync(path.join(tmpDir, 'estrategia', 'Crear Trazambiental.md'), `---
node_type: leaf
estado: draft
---

# Crear Trazambiental

Software de cumplimiento normativo para gestión de residuos industriales. Permite a empresas generadoras de residuos certificar trazabilidad desde origen hasta disposición final.

Mercado objetivo: empresas medianas y grandes sujetas a la Ley REP.
`);

    // Create a hidden directory that should be skipped
    fs.mkdirSync(path.join(tmpDir, '.obsidian'));
    fs.writeFileSync(path.join(tmpDir, '.obsidian', 'config.md'), 'should be ignored');
  });

  after(() => {
    // Cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('query: finds relevant files by keyword', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'query' },
      { message: '¿Qué es la planta de pirólisis?' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    assert.strictEqual(result.dinowiki_operation, 'query');
    assert.ok(result.dinowiki_results > 0, 'Should find at least one result');
    assert.ok(result.dinowiki_response.includes('pirólisis'), 'Response should mention pirólisis');
    assert.ok(result.dinowiki_files.includes('Planta de pirólisis'), 'Should match the file');
  });

  test('query: returns no results for unmatched keywords', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'query' },
      { message: 'blockchain cryptocurrency ethereum' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    assert.strictEqual(result.dinowiki_operation, 'query');
    assert.strictEqual(result.dinowiki_results, 0);
    assert.ok(result.dinowiki_response.includes('No encontré'));
  });

  test('query: scores filename matches higher than body matches', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'query' },
      { message: 'Dino Sauvageot' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    assert.strictEqual(result.dinowiki_operation, 'query');
    assert.ok(result.dinowiki_results > 0);
    // The Dino Sauvageot file should be first because of filename scoring
    assert.strictEqual(result.dinowiki_files[0], 'Dino Sauvageot');
  });

  test('auto: detects query intent', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'auto' },
      { message: '¿Cuál es la capacidad de la planta?' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    assert.strictEqual(result.dinowiki_operation, 'query');
  });

  test('auto: detects modify intent', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'auto' },
      { message: 'Agregar que la planta ahora procesa 15 toneladas diarias' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    assert.strictEqual(result.dinowiki_operation, 'modify');
    assert.strictEqual(result.dinowiki_results, 1);
    assert.ok(result.dinowiki_response.includes('actualizado'));

    // Verify the file was actually modified
    const content = fs.readFileSync(path.join(tmpDir, 'terreno', 'Planta de pirólisis.md'), 'utf-8');
    assert.ok(content.includes('15 toneladas diarias'), 'File should contain the appended content');
  });

  test('modify: appends timestamp-stamped section', async () => {
    const content = fs.readFileSync(path.join(tmpDir, 'terreno', 'Planta de pirólisis.md'), 'utf-8');
    const today = new Date().toISOString().split('T')[0];
    assert.ok(content.includes(`## Actualización (${today})`), 'Should contain timestamped header');
  });

  test('throws on missing wiki_path', async () => {
    await assert.rejects(
      () => executeDinoWikiNode({}, { message: 'test' }, {}, log),
      /wiki_path/
    );
  });

  test('throws on non-existent wiki_path', async () => {
    await assert.rejects(
      () => executeDinoWikiNode(
        { wiki_path: '/nonexistent/path' },
        { message: 'test' },
        {},
        log
      ),
      /does not exist/
    );
  });

  test('skips .obsidian and other hidden directories', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'query' },
      { message: 'config should be ignored' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    // The .obsidian/config.md should NOT be in results
    if (result.dinowiki_files) {
      assert.ok(
        !result.dinowiki_files.some(f => f.includes('config')),
        'Hidden directory files should not be searched'
      );
    }
  });

  test('query with Trazambiental finds estrategia file', async () => {
    const result = await executeDinoWikiNode(
      { wiki_path: tmpDir, operation: 'query' },
      { message: 'Trazambiental residuos' },
      { client: null, tenantId: 'test', flowId: 'test' },
      log
    );

    assert.strictEqual(result.dinowiki_operation, 'query');
    assert.ok(result.dinowiki_results > 0);
    assert.ok(result.dinowiki_files.includes('Crear Trazambiental'));
  });
});
