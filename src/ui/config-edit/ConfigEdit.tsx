import { useState, useEffect, useCallback } from "preact/hooks";
import { ConfigField } from "./ConfigField";
import { ConfigChangelog } from "./ConfigChangelog";

interface FieldDef {
  label: string;
  path: string;
  requiresRestart?: boolean;
}

interface Section {
  title: string;
  fields: FieldDef[];
}

const SECTIONS: Section[] = [
  {
    title: "Battery - Charging",
    fields: [
      { label: "Max Amps", path: "battery.charging.maxAmps" },
      { label: "Max Volts", path: "battery.charging.maxVolts" },
    ],
  },
  {
    title: "Battery - Discharging",
    fields: [
      { label: "Max Amps", path: "battery.discharging.maxAmps" },
      { label: "Min Volts", path: "battery.discharging.minVolts" },
    ],
  },
  {
    title: "Battery - Safety",
    fields: [
      { label: "Min Cell Volt", path: "battery.safety.minCellVolt" },
      { label: "Max Cell Volt", path: "battery.safety.maxCellVolt" },
      { label: "Max Cell Volt Buffer", path: "battery.safety.maxCellVoltBuffer" },
      { label: "Cell Volt Limit SoC Recovery %", path: "battery.safety.cellVoltLimitSocRecovery" },
      { label: "High Temp Cutoff (C)", path: "battery.safety.highTempCutoffC" },
      { label: "Low Temp Cutoff (C)", path: "battery.safety.lowTempCutoffC" },
    ],
  },
  {
    title: "Battery - Balancing",
    fields: [
      { label: "Cell V Diff Max", path: "battery.balance.cellVDiffMax" },
      { label: "Only Above (V)", path: "battery.balance.onlyAbove" },
    ],
  },
  {
    title: "Battery - General",
    fields: [
      { label: "Module Count", path: "battery.moduleCount", requiresRestart: true },
      { label: "Capacity Per Module (Ah)", path: "battery.capacityPerModuleAh" },
      { label: "Volts Empty", path: "battery.voltsEmpty" },
      { label: "Volts Full", path: "battery.voltsFull" },
    ],
  },
  {
    title: "BMS",
    fields: [
      { label: "Interval (s)", path: "bms.intervalS" },
      { label: "Battery Recency Limit (s)", path: "bms.batteryRecencyLimitS" },
      { label: "Charging Strategy", path: "bms.chargingStrategy.name" },
    ],
  },
  {
    title: "BMS - Latterby Strategy",
    fields: [
      { label: "Stop Charge At %", path: "bms.chargingStrategy.latterby.stopChargeAtPct" },
      { label: "Resume Charge At %", path: "bms.chargingStrategy.latterby.resumeChargeAtPct" },
      { label: "Stop Discharge At %", path: "bms.chargingStrategy.latterby.stopDischargeAtPct" },
      { label: "Resume Discharge At %", path: "bms.chargingStrategy.latterby.resumeDischargeAtPct" },
      { label: "Recharge Delay (s)", path: "bms.chargingStrategy.latterby.rechargeDelaySec" },
      { label: "Days Between Syncs", path: "bms.chargingStrategy.latterby.daysBetweenSynchronizations" },
      { label: "Sync Voltage", path: "bms.chargingStrategy.latterby.synchronizationVoltage" },
      { label: "Charge From Grid Delay (days)", path: "bms.chargingStrategy.latterby.chargeFromGridDelayDays" },
    ],
  },
];

function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function buildPatch(path: string, value: any): Record<string, any> {
  const keys = path.split(".");
  const result: Record<string, any> = {};
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

export function ConfigEdit() {
  const [config, setConfig] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [changelogKey, setChangelogKey] = useState(0);

  useEffect(() => {
    fetch("/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch((e) => setLoadError(String(e)));
  }, []);

  const handleSave = useCallback(async (path: string, value: string | number | boolean): Promise<string | null> => {
    const patch = buildPatch(path, value);
    const res = await fetch("/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.error) {
        const errors = Array.isArray(body.error)
          ? body.error.map((e: any) => e.message).join(", ")
          : String(body.error);
        return errors;
      }
      return `HTTP ${res.status}`;
    }
    const updated = await res.json();
    setConfig(updated);
    setChangelogKey((k) => k + 1);
    return null;
  }, []);

  if (loadError) return <div style={{ color: "red" }}>Failed to load config: {loadError}</div>;
  if (!config) return <div>Loading config...</div>;

  return (
    <div>
      {SECTIONS.map((section) => (
        <fieldset key={section.title} style={{ marginBottom: "16px", padding: "12px" }}>
          <legend style={{ fontWeight: "bold", fontSize: "15px" }}>{section.title}</legend>
          {section.fields.map((field) => {
            const val = getByPath(config, field.path);
            if (val === undefined) return null;
            return (
              <ConfigField
                key={field.path}
                label={field.label}
                path={field.path}
                value={val}
                onSave={handleSave}
                requiresRestart={field.requiresRestart}
              />
            );
          })}
        </fieldset>
      ))}
      <ConfigChangelog refreshKey={changelogKey} />
    </div>
  );
}
