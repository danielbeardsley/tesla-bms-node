import * as fs from "fs";
import * as path from "path";

export interface ChangeEntry {
   timestamp: string;
   path: string;
   oldValue: unknown;
   newValue: unknown;
}

const MAX_ENTRIES = 200;
const CHANGELOG_PATH = path.resolve(__dirname, "../../config-changelog.json");

function readChangelog(): ChangeEntry[] {
   try {
      const data = fs.readFileSync(CHANGELOG_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
   } catch {
      // File missing or corrupt — start fresh
   }
   return [];
}

function writeChangelog(entries: ChangeEntry[]) {
   fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(entries, null, 2) + "\n");
}

export function getChangelog(): ChangeEntry[] {
   return readChangelog();
}

export function logConfigChanges(changes: ChangeEntry[]) {
   const log = readChangelog();
   log.push(...changes);
   // Keep only the most recent entries
   const trimmed = log.slice(-MAX_ENTRIES);
   writeChangelog(trimmed);
}

/**
 * Diff two config objects and return ChangeEntry items for each changed leaf.
 * Paths are dot-separated like "battery.charging.maxAmps".
 */
export function diffConfigs(
   oldConfig: Record<string, unknown>,
   newConfig: Record<string, unknown>,
   prefix = "",
): ChangeEntry[] {
   const changes: ChangeEntry[] = [];
   const timestamp = new Date().toISOString();

   for (const key of new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)])) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const oldVal = oldConfig[key];
      const newVal = newConfig[key];

      if (
         oldVal !== null && newVal !== null &&
         typeof oldVal === "object" && typeof newVal === "object" &&
         !Array.isArray(oldVal) && !Array.isArray(newVal)
      ) {
         changes.push(...diffConfigs(
            oldVal as Record<string, unknown>,
            newVal as Record<string, unknown>,
            fullPath,
         ));
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
         changes.push({ timestamp, path: fullPath, oldValue: oldVal, newValue: newVal });
      }
   }

   return changes;
}
