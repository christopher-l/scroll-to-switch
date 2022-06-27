import { GLib } from 'imports/gi';

export class DebouncingNotifier<T> {
    private _subscribers: ((value: T) => void)[] = [];
    private _timeout: number | null = null;

    constructor(private _delayMs: number = 0) {}

    notify(value: T): void {
        if (this._timeout) {
            return;
        }
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._delayMs, () => {
            this._notify(value);
            this._timeout = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    subscribe(callback: (value: T) => void): void {
        this._subscribers.push(callback);
    }

    destroy(): void {
        if (this._timeout) {
            GLib.Source.remove(this._timeout);
            this._timeout = null;
        }
        this._subscribers = [];
    }

    private _notify(value: T): void {
        for (const subscriber of this._subscribers) {
            subscriber(value);
        }
    }
}
