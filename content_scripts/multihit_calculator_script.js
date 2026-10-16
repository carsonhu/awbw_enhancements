OptionsReader.instance().onOptionsReady((options) => {
    if (!options.options_enable_multihit_calculator) {
        console.log("Multi-hit calculator disabled.");
        return;
    }
    console.log("Multi-hit calculator enabled.");

    // The calculator runs in the page context so it can use AWBW's damage calculator and unit data.
    let pageOptions = {
        options_bindings_multihit_calculator_hotkey: options.options_bindings_multihit_calculator_hotkey,
    };
    let scripts = [
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
