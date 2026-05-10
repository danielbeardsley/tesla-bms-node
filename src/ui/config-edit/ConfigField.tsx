import { useState, useRef, useEffect } from "preact/hooks";

type FieldType = "number" | "string" | "boolean";

interface ConfigFieldProps {
  label: string;
  path: string;
  value: string | number | boolean | undefined;
  // Explicit type hint. Required when value can be undefined; otherwise
  // inferred from the value at runtime.
  type?: FieldType;
  onSave: (path: string, value: string | number | boolean) => Promise<string | null>;
  requiresRestart?: boolean;
}

function asString(v: string | number | boolean | undefined): string {
  return v === undefined ? "" : String(v);
}

export function ConfigField({ label, path, value, type, onSave, requiresRestart }: ConfigFieldProps) {
  const fieldType: FieldType = type ?? (typeof value as FieldType);
  const [localValue, setLocalValue] = useState(asString(value));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const timeoutRef = useRef<number | null>(null);

  // Reset local value when upstream value changes (e.g. after another field saves)
  useEffect(() => {
    setLocalValue(asString(value));
  }, [value]);

  const isDirty = localValue !== asString(value);

  async function handleSave() {
    setStatus("saving");
    let parsed: string | number | boolean;
    if (fieldType === "number") {
      if (localValue.trim() === "") {
        setStatus("error");
        setErrorMsg("Value required");
        return;
      }
      parsed = Number(localValue);
      if (isNaN(parsed)) {
        setStatus("error");
        setErrorMsg("Not a valid number");
        return;
      }
    } else if (fieldType === "boolean") {
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
      {fieldType === "boolean" ? (
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
          type={fieldType === "number" ? "number" : "text"}
          value={localValue}
          onInput={(e) => setLocalValue((e.target as HTMLInputElement).value)}
          step={fieldType === "number" ? "any" : undefined}
          style={{ padding: "4px 6px", width: fieldType === "number" ? "120px" : "300px" }}
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
