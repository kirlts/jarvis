import React, { useState } from 'react';
import { copyToClipboard } from '../pages/tenants/timeline-utils';

interface CopyButtonProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CopyButton({ text, className = "btn btn-ghost btn-sm", style }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className={className}
      style={{ padding: '2px 8px', fontSize: 'var(--text-xs)', ...style }}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(text);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      {copied ? '✓ Copiado' : '📋 Copiar'}
    </button>
  );
}
