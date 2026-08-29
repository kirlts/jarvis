/**
 * phone.js — Centralized phone number normalization for Jarvis.
 *
 * All phone numbers in the system are stored as E.164 digits (no '+' prefix)
 * to match WhatsApp JID format (e.g. "56994172921@s.whatsapp.net").
 *
 * This module provides:
 * - normalizePhone(raw): strips formatting, returns digits-only E.164
 * - formatPhoneDisplay(digits): best-effort server-side display formatting
 *
 * Usage:
 *   import { normalizePhone } from './phone.js';
 *   const clean = normalizePhone('+56 9 9417 2921'); // → '56994172921'
 *   const clean2 = normalizePhone('56994172921');     // → '56994172921'
 */

/**
 * Normalize a phone number to E.164 digits (without '+' prefix).
 * Strips all non-digit characters. If it starts with '+', strips that too.
 *
 * @param {string} raw - Raw phone input (e.g. "+56 9 9417 2921", "56994172921")
 * @returns {string} Digits-only E.164 (e.g. "56994172921")
 */
export function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^\d]/g, '');
}

/**
 * Format E.164 digits for display (best-effort, no libphonenumber dependency).
 * This is a server-side fallback; the frontend uses libphonenumber-js for
 * accurate international formatting.
 *
 * @param {string} digits - E.164 digits (e.g. "56994172921")
 * @returns {string} Display format (e.g. "+56 9 9417 2921")
 */
export function formatPhoneDisplay(digits) {
  if (!digits) return '';
  const d = digits.replace(/[^\d]/g, '');
  if (!d) return '';
  // Chilean numbers: 56 + 9 digits
  if (d.startsWith('56') && d.length === 11) {
    return `+${d.substring(0, 2)} ${d.substring(2, 3)} ${d.substring(3, 7)} ${d.substring(7)}`;
  }
  // Generic fallback: +CC XXXXXXX
  return `+${d}`;
}
