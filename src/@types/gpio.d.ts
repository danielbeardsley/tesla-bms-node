declare module 'gpio' {
    import { EventEmitter } from 'events';

    interface GpioOptions {
        direction?: string;
        interval?: number;
        ready?: () => void;
    }

    interface GpioPin extends EventEmitter {
        value: number;
        headerNum: number;
        set(value?: number | boolean | (() => void), fn?: (value: number, changed: boolean) => void): void;
        reset(fn?: () => void): void;
        unexport(fn?: () => void): void;
        setDirection(dir: string, fn?: () => void): void;
    }

    const DIRECTION: { IN: string; OUT: string };
    function export_(headerNum: number, opts?: GpioOptions): GpioPin;
    export { export_ as export, DIRECTION };
}
