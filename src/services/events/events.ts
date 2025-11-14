import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export class EventManager {
    private static instance: EventManager;

    private emitters: Map<string, EventEmitter> = new Map();

    private constructor() { }

    static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }

    createEventEmitter(emitterId: string): string {
        if (this.emitters.has(emitterId)) {
            return emitterId;
        }
        this.emitters.set(emitterId, new EventEmitter());
        return emitterId;
    }

    subscribe<T = unknown>(emitterId: string, eventName: string, callback: (data: T) => void): { id: string; unsubscribe: () => void } {
        const emitter = this.emitters.get(emitterId);
        if (!emitter) {
            throw new Error(`Event emitter with id ${emitterId} not found`);
        }

        const subscriptionId = randomUUID();
        emitter.on(eventName, callback);

        return {
            id: subscriptionId,
            unsubscribe: () => {
                emitter.off(eventName, callback);
            }
        };
    }

    emit<T = unknown>(emitterId: string, eventName: string, data?: T): boolean {
        const emitter = this.emitters.get(emitterId);
        if (!emitter) {
            throw new Error(`Event emitter with id ${emitterId} not found`);
        }
        return emitter.emit(eventName, data);
    }

    removeEventEmitter(emitterId: string): boolean {
        const emitter = this.emitters.get(emitterId);
        if (emitter) {
            emitter.removeAllListeners();
            return this.emitters.delete(emitterId);
        }
        return false;
    }
}