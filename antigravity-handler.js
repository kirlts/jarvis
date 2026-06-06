#!/usr/bin/env node
import fs from 'fs';
import { join } from 'path';

/**
 * Antigravity CLI - Message Processor Handler
 * 
 * Este procesador lee el mensaje entrante desde stdin en formato JSON.
 * Si se configura una "gemini_api_key" en el canal, realiza una consulta real a la API de Gemini.
 * De lo contrario, opera en modo local offline leyendo la Especificación Maestra (MASTER-SPEC.md) del repositorio.
 */

async function main() {
  try {
    // Leer todo el contenido de stdin
    const rawPayload = fs.readFileSync(0, 'utf-8');
    if (!rawPayload.trim()) {
      console.log('🤖 [Antigravity CLI]: No se recibió un payload válido.');
      return;
    }

    const payload = JSON.parse(rawPayload);
    const messageText = (payload.message || '').trim();
    const channelConfig = payload.channelConfig || {};

    // Obtener la API key de Gemini (desde la configuración de Ops Console o del entorno)
    const apiKey = channelConfig.gemini_api_key || (channelConfig.gemini_api_key_env_var ? process.env[channelConfig.gemini_api_key_env_var] : null) || process.env.GEMINI_API_KEY;

    if (apiKey) {
      // 1. MODO ONLINE: Consulta real a Google Gemini API
      try {
        let context = '';
        try {
          context = fs.readFileSync(join(process.cwd(), 'docs/MASTER-SPEC.md'), 'utf-8');
        } catch {
          try {
            context = fs.readFileSync('/app/docs/MASTER-SPEC.md', 'utf-8');
          } catch {}
        }

        const systemPrompt = `Eres Antigravity CLI / MelomanIA, un asistente inteligente para el repositorio del proyecto Jarvis.
El usuario te está haciendo una pregunta sobre el código o el diseño del sistema.
Mantén tu respuesta clara, profesional, concisa (adecuada para leer en WhatsApp) y responde en español.
Utiliza formato de texto en negrita (ej. *texto*) cuando sea útil para WhatsApp.

Aquí tienes el contenido de la Especificación Maestra de Jarvis para responder con precisión absoluta sin inventar nada:
---
${context ? context.slice(0, 10000) : 'No disponible'}
---`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemPrompt}\n\nPregunta del usuario: ${messageText}` }]
                }
              ]
            })
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generatedText) {
          console.log(generatedText.trim());
          return;
        } else {
          throw new Error('La respuesta de Gemini no contiene texto válido.');
        }
      } catch (apiErr) {
        console.log(`⚠️ *[Antigravity CLI - Error de API Real]*
No se pudo contactar a Gemini (${apiErr.message}). Evaluando respuesta con el motor fuera de línea local...`);
      }
    }

    // 2. MODO OFFLINE (FALLBACK INTELIGENTE): Búsqueda local de Especificación Maestra
    const searchPath = join(process.cwd(), 'docs/MASTER-SPEC.md');
    let specContent = '';
    try {
      specContent = fs.readFileSync(searchPath, 'utf-8');
    } catch {
      try {
        specContent = fs.readFileSync('/app/docs/MASTER-SPEC.md', 'utf-8');
      } catch (err) {
        // Fallback si no encuentra el archivo
      }
    }

    const messageLower = messageText.toLowerCase();

    if (!specContent) {
      console.log(`🤖 *[Antigravity CLI - Offline]*
Recibí tu pregunta: "${messageText}".
Para habilitar respuestas inteligentes en tiempo real, añade la clave \`"gemini_api_key"\` en la configuración del canal en la Ops Console.`);
      return;
    }

    // Búsqueda de coincidencia basada en palabras clave en la especificación
    let matchedSection = '';
    if (messageLower.includes('base de datos') || messageLower.includes('db') || messageLower.includes('schema') || messageLower.includes('tabla')) {
      matchedSection = specContent.match(/## §4\. Constraints[\s\S]*?(?=## §)/i)?.[0] || '';
    } else if (messageLower.includes('arquitectura') || messageLower.includes('componente') || messageLower.includes('diseño') || messageLower.includes('estructura')) {
      matchedSection = specContent.match(/## §2\. Architecture[\s\S]*?(?=## §)/i)?.[0] || '';
    } else if (messageLower.includes('concurrencia') || messageLower.includes('limite') || messageLower.includes('rata') || messageLower.includes('rate') || messageLower.includes('multicanal')) {
      matchedSection = specContent.match(/## §7\. Module Specifications[\s\S]*?(?=## §)/i)?.[0] || '';
    } else if (messageLower.includes('seguridad') || messageLower.includes('rls') || messageLower.includes('token') || messageLower.includes('trade-off')) {
      matchedSection = specContent.match(/## §5\. Agreed Trade-offs[\s\S]*?(?=## §)/i)?.[0] || '';
    } else if (messageLower.includes('consola') || messageLower.includes('ops') || messageLower.includes('interfaz') || messageLower.includes('ui')) {
      matchedSection = specContent.match(/## §6\. Ops Console Architecture[\s\S]*?(?=## §)/i)?.[0] || '';
    }

    if (matchedSection) {
      // Limpiar un poco el formato markdown para que sea ultra-legible en WhatsApp
      const summary = matchedSection
        .split('\n')
        .slice(0, 15) // Tomar los primeros 15 renglones significativos
        .filter(line => line.trim() !== '')
        .join('\n');

      console.log(`🤖 *[Antigravity CLI - Respuesta Local]*
He escaneado la *Especificación Maestra* para responder a tu pregunta sobre "${messageText}":

${summary}...

_💡 Nota: Para respuestas por Inteligencia Artificial de Gemini, ingresa la llave \`"gemini_api_key"\` en la configuración del canal desde la Ops Console._`);
    } else {
      console.log(`🤖 *[Antigravity CLI - Offline]*
He recibido tu pregunta: "${messageText}".
He escaneado \`docs/MASTER-SPEC.md\` pero no encontré una sección específica. 

*¿Cómo activar la IA real?*
Añade tu clave en la Ops Console:
\`\`\`json
{
  "processor": "antigravity",
  "gemini_api_key": "TU_API_KEY_AQUÍ"
}
\`\`\``);
    }
  } catch (err) {
    console.error('Error en el script antigravity-handler.js:', err.message);
    process.exit(1);
  }
}

main();
