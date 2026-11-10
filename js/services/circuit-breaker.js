/**
 * @file circuit-breaker.js
 * @description Enterprise Circuit Breaker pre sieťové volania.
 */

export class CircuitBreaker {
    constructor(fn, options = {}) {
        this.fn = fn;
        this.failureThreshold = options.failureThreshold || 3;
        this.cooldownPeriod = options.cooldownPeriod || 15000;
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.nextAttemptTime = Date.now();
    }

    async execute(...args) {
        if (this.state === 'OPEN') {
            if (Date.now() > this.nextAttemptTime) {
                this.state = 'HALF-OPEN';
            } else {
                throw new Error('CircuitBreaker OPEN');
            }
        }

        try {
            const result = await this.fn(...args);
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure();
            throw error;
        }
    }

    _onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    _onFailure() {
        this.failureCount++;
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttemptTime = Date.now() + this.cooldownPeriod;
        }
    }
}