/**
 * Operaciones — Vista consolidada de Jobs, Registro de auditoría, Logs y Bandeja.
 *
 * Fusiona las antiguas páginas /jobs, /audit, /logs e /inbox en una sola
 * interfaz con tabs internos para reducir fragmentación cognitiva.
 */
import { useState } from "react";
import { useSearchParams } from "react-router";
import { JobsTab } from "./tabs/jobs";
import { RegistroTab } from "./tabs/registro";
import { LogsTab } from "./tabs/logs";
import { BandejaTab } from "./tabs/bandeja";

type TabKey = "jobs" | "registro" | "logs" | "bandeja";

const TABS: { key: TabKey; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "registro", label: "Registro" },
  { key: "logs", label: "Logs" },
  { key: "bandeja", label: "Bandeja" },
];

export function OperacionesPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = TABS.some(t => t.key === tabParam) ? (tabParam as TabKey) : "jobs";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operaciones</h1>
          <p className="page-subtitle">Monitoreo de colas, registro de actividad, logs y bandeja de entrada</p>
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
      {activeTab === "bandeja" && <BandejaTab />}
    </div>
  );
}

