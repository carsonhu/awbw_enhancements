// Saves AWBW Advanced Hotkeys' bindings (see lib/advanced_hotkeys_compat.js) for the options page, which can't read
// AWBW's localStorage, so it can point out keys that the extension and the userscript both use. Only written when
// they've changed.
(function () {
    function save() {
        let bindings = advancedHotkeysBindings();
        chrome.storage.local.get([kAdvancedHotkeysStorageKey], (result) => {
            if (JSON.stringify(result[kAdvancedHotkeysStorageKey] ?? null) !== JSON.stringify(bindings)) {
                chrome.storage.local.set({ [kAdvancedHotkeysStorageKey]: bindings });
            }
        });
    }

    // The userscript sets itself up once the page has loaded.
    let start = () => setTimeout(save, 1000);
    if (document.readyState === "complete") {
        start();
    } else {
        window.addEventListener("load", start, { once: true });
    }
})();
