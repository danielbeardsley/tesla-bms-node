/**
 * Downtime class to track service downtime.
 * It records the total downtime in milliseconds and the number of downtime events.
 * It also tracks the last time the service was marked as up.
 */
export class Downtime {
    private downtimeMs = 0;
    private eventCount = 0;
    private lastUpTimestamp = 0;
    private events: { timestamp: number; ms: number }[] = [];
    private start = Date.now();
    public readonly timeoutMs: number;

    constructor(timeoutMs: number) {
        this.timeoutMs = timeoutMs;
        this.lastUpTimestamp = this.start;
    }

    public up() {
        const now = Date.now();
        if ((now - this.lastUpTimestamp) > this.timeoutMs) {
            this.downtimeMs += now - this.lastUpTimestamp - this.timeoutMs;
            this.eventCount++;
            this.events.push({ timestamp: (this.lastUpTimestamp + this.timeoutMs), ms: now - this.lastUpTimestamp - this.timeoutMs });
            this.cullOldEvents();
        }
        this.lastUpTimestamp = now;
    }

    private cullOldEvents() {
       const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
       const firstEventToKeep = this.events.findIndex(event => event.timestamp >= cutoff);
       if (firstEventToKeep > 0) {
           this.events = this.events.slice(firstEventToKeep);
       }
    }

    public getDowntime() {
        const msSinceLastUp = Date.now() - this.lastUpTimestamp;
        const currentDowntimeMs = msSinceLastUp > this.timeoutMs ? msSinceLastUp - this.timeoutMs : 0;
        const totalDowntimeMs = this.downtimeMs + currentDowntimeMs;
        return {
            start: Math.round(this.start / 1000),
            downtimePercent: ((totalDowntimeMs / (Date.now() - this.start)) * 100).toFixed(2),
            downtimeS: totalDowntimeMs / 1000,
            eventCount: this.eventCount,
            lastUpTimestamp: Math.round(this.lastUpTimestamp / 1000),
            events24h: this.events,
            timeoutMs: this.timeoutMs,
            timeSinceLastUpS: msSinceLastUp / 1000,
            isUp: msSinceLastUp < this.timeoutMs,
        };
    }
}
