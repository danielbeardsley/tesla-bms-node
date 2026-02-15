import gpio from 'gpio';
import { execSync } from 'child_process';
import { logger } from './logger';

const RESET_HOLD_MS = 3000;
const GPIO_PIN = 17;

export function setupResetButton(): void {
    let pressStart: number | null = null;
    let resetTimer: NodeJS.Timeout | null = null;

    const button = gpio.export(GPIO_PIN, {
        direction: gpio.DIRECTION.IN,
        interval: 50,
        ready: () => {
            logger.info('Reset button on GPIO %d ready', GPIO_PIN);
        },
    });

    button.on('change', (val: number) => {
        if (val === 1) {
            // Button pressed
            pressStart = Date.now();
            resetTimer = setTimeout(() => {
                logger.info('Reset button held for %ds, resetting', RESET_HOLD_MS / 1000);
                button.unexport();
                execSync('shutdown -r now');
            }, RESET_HOLD_MS);
        } else {
            // Button released
            if (resetTimer) {
                clearTimeout(resetTimer);
                resetTimer = null;
            }
            if (pressStart) {
                const held = Date.now() - pressStart;
                logger.info('Reset button released after %dms (need %dms)', held, RESET_HOLD_MS);
                pressStart = null;
            }
        }
    });

}
