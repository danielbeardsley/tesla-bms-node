import gpio from 'gpio';
import { execSync } from 'child_process';
import { logger } from './logger';
import type { Config } from './config';

export function setupResetButton(config: NonNullable<Config['resetButton']>): void {
    const holdTimeMs = config.holdTimeS * 1000;
    const pin = config.gpioPin;

    let pressStart: number | null = null;
    let resetTimer: NodeJS.Timeout | null = null;

    const button = gpio.export(pin, {
        direction: gpio.DIRECTION.IN,
        interval: 50,
        ready: () => {
            logger.info('Reset button on GPIO %d ready', pin);
        },
    });

    button.on('change', (val: number) => {
        if (val === 1) {
            // Button pressed
            pressStart = Date.now();
            resetTimer = setTimeout(() => {
                logger.info('Reset button held for %ds, resetting', config.holdTimeS);
                button.unexport();
                execSync('shutdown -r now');
            }, holdTimeMs);
        } else {
            // Button released
            if (resetTimer) {
                clearTimeout(resetTimer);
                resetTimer = null;
            }
            if (pressStart) {
                const held = Date.now() - pressStart;
                logger.info('Reset button released after %dms (need %dms)', held, holdTimeMs);
                pressStart = null;
            }
        }
    });
}
