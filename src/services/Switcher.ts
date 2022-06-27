import { Clutter, Shell, Meta, GLib } from 'imports/gi';
import { Settings } from 'services/Settings';
import { DebouncingNotifier } from 'utils/DebouncingNotifier';
const Main = imports.ui.main;
const wm = imports.ui.windowManager;
const WindowManager = wm.WindowManager;

export class Switcher {
    private static _instance: Switcher | null;

    static init() {
        Switcher._instance = new Switcher();
        Switcher._instance.init();
    }

    static destroy() {
        Switcher._instance?.destroy();
        Switcher._instance = null;
    }

    static getInstance(): Switcher {
        return Switcher._instance as Switcher;
    }

    private readonly _settings = Settings.getInstance();
    private _onDestroy: (() => void)[] = [];

    init() {
        this._registerScrollBinding();
        // this._registerSuperRightClickBinding();
    }

    destroy() {
        this._onDestroy.forEach((f) => f());
        this._onDestroy = [];
    }

    toggleLayers() {
        const currentMonitor = global.display.get_current_monitor();
        const activeWorkspace = global.display.get_workspace_manager().get_active_workspace();
        const tabList = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, activeWorkspace);
        const windowsOnCurrentMonitor = tabList.filter(
            (window) => window.get_monitor() === currentMonitor,
        );
        if (windowsOnCurrentMonitor.length === 0) {
            return;
        }
        const mostRecentWindow = windowsOnCurrentMonitor[0];
        const windowsToRaise = windowsOnCurrentMonitor.filter(
            (window) => !!window.get_maximized() !== !!mostRecentWindow.get_maximized(),
        );
        if (windowsToRaise.length > 0) {
            windowsToRaise[0].focus(global.get_current_time());
            windowsToRaise.reverse().forEach((window) => window.raise());
        }
    }

    private _registerScrollBinding() {
        const connectId = global.stage.connect('scroll-event', (stage, event: Clutter.Event) => {
            const allowedModes = Shell.ActionMode.NORMAL;
            if ((allowedModes & Main.actionMode) === 0) {
                return Clutter.EVENT_PROPAGATE;
            } else if ((event.get_state() & global.display.compositor_modifiers) === 0) {
                return Clutter.EVENT_PROPAGATE;
            } else {
                return this._handleScroll(event);
            }
        });
        // TODO: can we replace the method on the instance instead of the prototype?
        const originalHandleWorkspaceScroll = WindowManager.prototype.handleWorkspaceScroll;
        WindowManager.prototype.handleWorkspaceScroll = function (event: Clutter.Event) {
            if (Main.overview.visible) {
                return originalHandleWorkspaceScroll.apply(this, [event]);
            } else {
                return Clutter.EVENT_PROPAGATE;
            }
        };
        this._onDestroy.push(() => {
            global.stage.disconnect(connectId);
            WindowManager.prototype.handleWorkspaceScroll = originalHandleWorkspaceScroll;
        });
    }

    // The right / middle click gets passed down to the window if we don't open a menu or something
    // else here.
    //
    // private _registerSuperRightClickBinding() { const originalShowWindowMenu =
    //     Main.wm._windowMenuManager.showWindowMenuForWindow; const self = this;
    //     Main.wm._windowMenuManager.showWindowMenuForWindow = function (...params: unknown[]) {
    //     const mods = global.get_pointer()[2]; if ((mods & global.display.compositor_modifiers)
    //     === 0) { originalShowWindowMenu.apply(this, params); } else { self._toggleActiveLayer();
    //         }
    //     };
    //     this._onDestroy.push(
    //         () => (Main.wm._windowMenuManager.showWindowMenuForWindow = originalShowWindowMenu),
    //     );
    // }

    private _handleScroll(event: Clutter.Event): boolean {
        console.log('scroll-event');
        const direction = event.get_scroll_direction();
        console.log('direction', direction);

        if (direction === Clutter.ScrollDirection.SMOOTH) {
            return Clutter.EVENT_PROPAGATE;
        }
        const currentMonitor = global.display.get_current_monitor();
        const activeWorkspace = global.display.get_workspace_manager().get_active_workspace();
        const workspaceWindows = activeWorkspace.list_windows();
        const startingWindow = this._getStartingWindow(event);
        if (!startingWindow) {
            return Clutter.EVENT_PROPAGATE;
        }
        const consideredWindows = workspaceWindows
            .filter(
                (window) =>
                    window.get_monitor() === currentMonitor &&
                    this._sameSwitchingGroup(window, startingWindow),
            )
            .sort(windowSortPredicate);
        console.log('startingWindow', startingWindow.get_id());
        console.log(consideredWindows.map((w) => w.get_id()));
        switch (direction) {
            case Clutter.ScrollDirection.UP:
                return this._switchWindow(consideredWindows, startingWindow, 'up');
            case Clutter.ScrollDirection.DOWN:
                return this._switchWindow(consideredWindows, startingWindow, 'down');
            default:
                return Clutter.EVENT_PROPAGATE;
        }
    }

    private _sameSwitchingGroup(a: Meta.Window, b: Meta.Window): boolean {
        return true;
        // if (!a.get_maximized() && !b.get_maximized()) {
        //     return true;
        // } else if (!a.get_maximized() || !b.get_maximized()) {
        //     return false;
        // } else {
        //     return a.get_frame_rect().overlap(b.get_frame_rect());
        // }
    }

    private _getStartingWindow(event: Clutter.Event): Meta.Window | null {
        const activeWorkspace = global.display.get_workspace_manager().get_active_workspace();
        const currentMonitor = global.display.get_current_monitor();
        const tabList = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, activeWorkspace);
        const windowsOnCurrentMonitor = tabList.filter(
            (window) => window.get_monitor() === currentMonitor,
        );
        if (windowsOnCurrentMonitor.length === 0) {
            return null;
        }
        const [x, y] = event.get_coords();
        const windowUnderCursor = windowsOnCurrentMonitor.find((window) =>
            rectangleContainsPoint(window.get_frame_rect(), x, y),
        );
        if (windowUnderCursor) {
            return windowsOnCurrentMonitor.find((window) =>
                this._sameSwitchingGroup(windowUnderCursor, window),
            ) as Meta.Window;
        } else {
            return (
                windowsOnCurrentMonitor.find((window) => !window.get_maximized()) ??
                windowsOnCurrentMonitor[0]
            );
        }
    }

    private _switchWindow(
        windows: Meta.Window[],
        currentWindow: Meta.Window,
        direction: 'up' | 'down',
    ): boolean {
        const currentWindowIndex = windows.indexOf(currentWindow);
        if (currentWindowIndex < 0) {
            return Clutter.EVENT_PROPAGATE;
        } else if (direction === 'up' && currentWindowIndex > 0) {
            this._focusWindow(windows[currentWindowIndex - 1]);
            return Clutter.EVENT_STOP;
        } else if (direction === 'down' && currentWindowIndex < windows.length - 1) {
            this._focusWindow(windows[currentWindowIndex + 1]);
            return Clutter.EVENT_STOP;
        } else if (!currentWindow.has_focus()) {
            this._focusWindow(currentWindow);
            return Clutter.EVENT_STOP;
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
    }

    private _focusWindow(window: Meta.Window) {
        window.focus(global.get_current_time());
        window.raise();
    }
}

function rectangleContainsPoint(rect: Meta.Rectangle, x: number, y: number): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function windowSortPredicate(a: Meta.Window, b: Meta.Window): number {
    return b.get_maximized() - a.get_maximized() || a.get_id() - b.get_id();
}
