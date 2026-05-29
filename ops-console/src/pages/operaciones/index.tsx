/**
 * Operaciones — Vista consolidada de Jobs, Registro de auditoría y Logs.
 *
 * Fusiona las antiguas páginas /jobs, /audit y /logs en una sola
 * interfaz con tabs internos para reducir fragmentación cognitiva.
 */
import { useState } from "react";
import { JobsTab } from "./tabs/jobs";
import { RegistroTab } from "./tabs/registro";
import { LogsTab } from "./tabs/logs";

type TabKey = "jobs" | "registro" | "logs";

const TABS: { key: TabKey; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "registro", label: "Registro" },
  { key: "logs", label: "Logs" },
];

export function OperacionesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("jobs");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operaciones</h1>
          <p className="page-subtitle">Monitoreo de colas, registro de actividad y logs del sistema</p>
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

      {activeTab === "jobs" && <JobsTab />}
      {activeTab === "registro" && <RegistroTab />}
      {activeTab === "logs" && <LogsTab />}
    </div>
  );
}
