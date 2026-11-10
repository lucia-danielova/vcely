/**
 * @file event-bus.js
 * @description Pub/Sub Event Bus a manažér systémových Toast notifikácií v svetlom Eko dizajne.
 */

export class EventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
}

export const globalBus = new EventBus();

export function showNotificationToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const styles = {
        info: 'border-sky-500 bg-white text-slate-900',
        success: 'border-emerald-600 bg-white text-slate-900',
        warning: 'border-amber-500 bg-amber-50/95 text-amber-950',
        danger: 'border-rose-600 bg-rose-50/95 text-rose-950'
    };

    const toast = document.createElement('div');
    toast.className = `backdrop-blur-md border-l-4 ${styles[type] || styles.info} border border-stone-200 text-xs px-4 py-3.5 rounded-2xl shadow-2xl pointer-events-auto transition-all duration-300 opacity-0 translate-y-2`;
    toast.innerHTML = `<div class="font-bold leading-snug">${message}</div>`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}