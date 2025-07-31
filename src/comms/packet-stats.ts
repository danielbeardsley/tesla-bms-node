export class PacketStats {
    private total: number = 0;
    private bad: number = 0;

    public incrementTotal() {
        this.total++;
    }

    public incrementBad() {
        this.bad++;
    }

    public getStatsAndReset() {
        const current = {
            total: this.total,
            bad: this.bad,
        };
        this.total = 0;
        this.bad = 0;
        return current;
    }
}
