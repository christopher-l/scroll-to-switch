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
    }

    destroy() {
        this._onDestroy.forEach((f) => f());
        this._onDestroy = [];
    }

    toggleLayers() {}

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
        const tabList = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, activeWorkspace);
        const windowsOnCurrentMonitor = tabList.filter(
            (window) => window.get_monitor() === currentMonitor,
        );
        if (windowsOnCurrentMonitor.length === 0) {
            return Clutter.EVENT_PROPAGATE;
        }
        const mostRecentWindow = windowsOnCurrentMonitor[0];
        const consideredWindows = workspaceWindows
            .filter(
                (window) =>
                    window.get_monitor() === currentMonitor &&
                    !!window.get_maximized() === !!mostRecentWindow.get_maximized(),
            )
            .reverse();
        console.log('mostRecentWindow', mostRecentWindow.get_id());
        console.log(consideredWindows.map((w) => w.get_id()));
        switch (direction) {
            case Clutter.ScrollDirection.UP:
                return this._switchWindow(consideredWindows, mostRecentWindow, 'up');
            case Clutter.ScrollDirection.DOWN:
                return this._switchWindow(consideredWindows, mostRecentWindow, 'down');
            default:
                return Clutter.EVENT_PROPAGATE;
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
