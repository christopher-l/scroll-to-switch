import { KeyBindings } from 'services/KeyBindings';
import { Settings } from 'services/Settings';
import { Switcher } from 'services/Switcher';

class Extension {
    enable() {
        console.log('Enable switcher');
        Settings.init();
        Switcher.init();
        KeyBindings.init();
    }

    disable() {
        console.log('Disable switcher');
        Settings.destroy();
        Switcher.destroy();
        KeyBindings.destroy();
    }
}

function init() {
    return new Extension();
}
