/**
 * Downtime class to track service downtime.
 * It records the total downtime in milliseconds and the number of downtime events.
 * It also tracks the last time the service was marked as up.
 */
export class Downtime {
    private downtimeMs = 0;
    private downtimeEvents = 0;
    private lastUpTimestamp = 0;
    private start = Date.now();
    private timeoutMs: number;

    constructor(timeoutMs: number) {
        this.timeoutMs = timeoutMs;
        this.lastUpTimestamp = this.start;
    }

    public up() {
        const now = Date.now();
        if ((now - this.lastUpTimestamp) > this.timeoutMs) {
            this.downtimeMs += now - this.lastUpTimestamp - this.timeoutMs;
            this.downtimeEvents++;
        }
        this.lastUpTimestamp = now;
    }

    public getDowntime() {
        const msSinceLastUp = Date.now() - this.lastUpTimestamp;
        const currentDowntimeMs = msSinceLastUp > this.timeoutMs ? msSinceLastUp - this.timeoutMs : 0;
        const totalDowntimeMs = this.downtimeMs + currentDowntimeMs;
        return {
            start: Math.round(this.start / 1000),
            downtimePercent: ((totalDowntimeMs / (Date.now() - this.start)) * 100).toFixed(2),
            downtimeS: totalDowntimeMs / 1000,
            downtimeEvents: this.downtimeEvents,
            lastUpTimestamp: Math.round(this.lastUpTimestamp / 1000),
            timeSinceLastUpS: msSinceLastUp / 1000,
        };
    }
}
