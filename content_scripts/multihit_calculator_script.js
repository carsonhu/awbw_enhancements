OptionsReader.instance().onOptionsReady((options) => {
    if (!options.options_enable_multihit_calculator) {
        console.log("Multi-hit calculator disabled.");
        return;
    }
    console.log("Multi-hit calculator enabled.");

    // Added here rather than listed in the manifest so that it's read from disk on each page load, like the
    // scripts below, instead of only when the extension is reloaded.
    let stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("/res/multihit_calculator.css");
    (document.head || document.documentElement).appendChild(stylesheet);

    // The calculator runs in the page context so it can use AWBW's damage calculator and unit data.
    let pageOptions = {
        options_bindings_multihit_calculator_hotkey: options.options_bindings_multihit_calculator_hotkey,
    };
    let scripts = [
        "/lib/advanced_hotkeys_compat.js",
        "/res/multihit_engine.js",
        "/res/multihit_calculator.js#" + encodeURIComponent(JSON.stringify(pageOptions)),
    ];
    console.log("Injecting requested scripts:", scripts);

    function injectNext() {
        let scriptName = scripts.shift();
        if (!scriptName) return;
        let s = document.createElement("script");
        s.src = chrome.runtime.getURL(scriptName);
        s.onload = injectNext;
        (document.head || document.documentElement).appendChild(s);
    }
    injectNext();
});
