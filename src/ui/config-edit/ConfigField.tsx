import { useState, useRef, useEffect } from "preact/hooks";

interface ConfigFieldProps {
  label: string;
  path: string;
  value: string | number | boolean;
  onSave: (path: string, value: string | number | boolean) => Promise<string | null>;
  requiresRestart?: boolean;
}

export function ConfigField({ label, path, value, onSave, requiresRestart }: ConfigFieldProps) {
  const [localValue, setLocalValue] = useState(String(value));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const timeoutRef = useRef<number | null>(null);

  // Reset local value when upstream value changes (e.g. after another field saves)
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const isDirty = localValue !== String(value);

  async function handleSave() {
    setStatus("saving");
    // Convert back to the original type
    let parsed: string | number | boolean;
    if (typeof value === "number") {
      parsed = Number(localValue);
      if (isNaN(parsed)) {
        setStatus("error");
        setErrorMsg("Not a valid number");
        return;
      }
    } else if (typeof value === "boolean") {
      parsed = localValue === "true";
    } else {
      parsed = localValue;
    }

    const err = await onSave(path, parsed);
    if (err) {
      setStatus("error");
      setErrorMsg(err);
    } else {
      setStatus("saved");
      setErrorMsg("");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
      <label style={{ minWidth: "220px", fontSize: "14px" }}>
        {label}
        {requiresRestart && <span style={{ color: "#999", fontSize: "11px" }}> (restart)</span>}
      </label>
      {typeof value === "boolean" ? (
        <select
          value={localValue}
          onChange={(e) => setLocalValue((e.target as HTMLSelectElement).value)}
          style={{ padding: "4px" }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={typeof value === "number" ? "number" : "text"}
          value={localValue}
          onInput={(e) => setLocalValue((e.target as HTMLInputElement).value)}
          step={typeof value === "number" ? "any" : undefined}
          style={{ padding: "4px 6px", width: typeof value === "number" ? "120px" : "300px" }}
        />
      )}
      <button
        onClick={handleSave}
        disabled={!isDirty || status === "saving"}
        style={{ padding: "4px 12px", opacity: isDirty ? 1 : 0.4 }}
      >
        {status === "saving" ? "..." : "Save"}
      </button>
      {status === "saved" && <span style={{ color: "green", fontSize: "12px" }}>Saved</span>}
      {status === "error" && <span style={{ color: "red", fontSize: "12px" }}>{errorMsg}</span>}
    </div>
  );
}
