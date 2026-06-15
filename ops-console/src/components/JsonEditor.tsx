import React, { useState } from 'react';
import { CopyButton } from './CopyButton';

interface JsonEditorProps {
  label?: string;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  rows?: number;
}

export function JsonEditor({ label = "JSON", value, onChange, onBlur, error, rows = 8 }: JsonEditorProps) {
  return (
    <details style={{ background: "var(--surface-1)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", padding: "var(--sp-2)" }}>
      <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600, padding: "var(--sp-1)", color: "var(--text-secondary)" }}>
        {label}
      </summary>
      <div style={{ position: "relative", marginTop: "var(--sp-2)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
        <div style={{ position: 'absolute', top: 'var(--sp-2)', right: 'var(--sp-2)', zIndex: 10 }}>
          <CopyButton text={value} className="btn btn-ghost btn-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }} />
        </div>
        <textarea 
          className="form-input cell-mono" 
          rows={rows} 
          value={value} 
          onChange={(e) => onChange?.(e.target.value)} 
          onBlur={onBlur}
          readOnly={!onChange}
          spellCheck={false}
          style={{ 
            resize: "vertical", 
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-mono, monospace)",
            background: "var(--surface-2, #1e1e1e)",
            color: "var(--text-primary, #f5f5f5)",
            border: "1px solid var(--border-subtle)",
            padding: "var(--sp-2)",
            paddingTop: "var(--sp-5)",
            borderRadius: "var(--radius-sm)"
          }} 
        />
        {error && <span style={{ color: "var(--color-danger, #ff4d4f)", fontSize: "var(--text-xs)" }}>{error}</span>}
      </div>
    </details>
  );
}
