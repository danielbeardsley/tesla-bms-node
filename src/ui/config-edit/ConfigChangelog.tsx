import { useState, useEffect } from "preact/hooks";

interface ChangeEntry {
  timestamp: string;
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

interface ConfigChangelogProps {
  refreshKey: number;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function ConfigChangelog({ refreshKey }: ConfigChangelogProps) {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);

  useEffect(() => {
    fetch("/config/changelog")
      .then((r) => r.json())
      .then((data: ChangeEntry[]) => setEntries(data.reverse()))
      .catch(() => {});
  }, [refreshKey]);

  if (entries.length === 0) {
    return (
      <fieldset style={{ marginBottom: "16px", padding: "12px" }}>
        <legend style={{ fontWeight: "bold", fontSize: "15px" }}>Change Log</legend>
        <div style={{ color: "#999", fontSize: "13px" }}>No changes recorded yet.</div>
      </fieldset>
    );
  }

  return (
    <fieldset style={{ marginBottom: "16px", padding: "12px" }}>
      <legend style={{ fontWeight: "bold", fontSize: "15px" }}>Change Log</legend>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={thStyle}>Time</th>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Old</th>
            <th style={thStyle}>New</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td style={tdStyle}>{formatTime(e.timestamp)}</td>
              <td style={tdStyle}><code>{e.path}</code></td>
              <td style={tdStyle}>{formatValue(e.oldValue)}</td>
              <td style={tdStyle}>{formatValue(e.newValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}

const thStyle = { textAlign: "left" as const, borderBottom: "1px solid #ccc", padding: "4px 8px" };
const tdStyle = { borderBottom: "1px solid #eee", padding: "4px 8px" };
