/**
 * Sistema — Vista consolidada de Configuración, Tokens y Estado.
 *
 * Fusiona las antiguas páginas /config, /tokens y /health
 * en una sola interfaz con tabs internos.
 */
import { useState } from "react";
import { ConfigTab } from "./tabs/config";
import { TokensTab } from "./tabs/tokens";
import { EstadoTab } from "./tabs/estado";

type TabKey = "config" | "tokens" | "estado";

const TABS: { key: TabKey; label: string }[] = [
  { key: "config", label: "Configuración" },
  { key: "tokens", label: "Tokens" },
  { key: "estado", label: "Estado" },
];

export function SistemaPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("config");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sistema</h1>
          <p className="page-subtitle">Configuración global, gestión de tokens y estado de servicios</p>
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-item ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "config" && <ConfigTab />}
      {activeTab === "tokens" && <TokensTab />}
      {activeTab === "estado" && <EstadoTab />}
    </div>
  );
}
