// Runs in the move planner when it's shown in the game page's planner panel (see planner_panel_script.js), and
// tells the panel its size, the turn it shows, and when to close. embedded_planner_early_script.js has already
// hidden the site header and footer.
(function () {
    if (window.top === window || !window.location.hash.includes("awbwe-embedded")) return;

    function post(message) {
        window.parent.postMessage(Object.assign({ source: "awbwe-embedded-planner" }, message), window.location.origin);
    }

    // The height is the body's scroll height, which includes the zoomed map: AWBW zooms it with a CSS transform,
    // which doesn't make the page's layout any taller. (The embedded stylesheet keeps the body from stretching to
    // the iframe's height, so the panel can shrink again.) The width is the page column's, plus anything that
    // overflows it.
    let outer = document.getElementById("outer") || document.body;
    let lastSize = null;
    function reportSize() {
        let width = Math.ceil(Math.max(outer.scrollWidth, outer.getBoundingClientRect().width));
        let height = Math.ceil(document.body.scrollHeight);
        if (lastSize && lastSize.width === width && lastSize.height === height) return;
        lastSize = { width, height };
        post({ type: "size", width, height });
    }
    let resizeObserver = new ResizeObserver(reportSize);
    for (let element of [document.body, outer, document.getElementById("replay-container"),
                         document.getElementById("gamemap-container"), document.getElementById("gamemap")]) {
        if (element) resizeObserver.observe(element);
    }

    // e.g. "Day 2: YC", from the planner's own turn selector.
    let turnSelect = document.getElementById("selectndx");
    let turn = turnSelect?.selectedOptions?.[0]?.textContent.trim() || null;
    post({ type: "ready", turn });
    reportSize();

    // Boards from the panel (e.g. the replay part way through the turn) are loaded once the moveplanner's own setup
    // is done (moveplanner_plus_script.js).
    let plannerReady = new Promise((resolve) => {
        if (document.documentElement.dataset.awbwePlannerReady) {
            resolve();
        } else {
            document.addEventListener("awbwe-planner-ready", () => resolve(), { once: true });
        }
    });
    plannerReady.then(() => post({ type: "planner-ready", canLoadState: canLoadPlannerState() }));

    window.addEventListener("message", (e) => {
        if (e.source !== window.parent || e.origin !== window.location.origin) return;
        let message = e.data || {};
        if (message.source !== "awbwe-planner-panel" || message.type !== "load-state") return;
        plannerReady.then(() => {
            let state = message.state;
            // The day isn't part of the game page's data, but it's this page's turn.
            let day = parseInt((turn || "").match(/Day (\d+)/)?.[1]);
            let players = state.awbw_enhancements_extras?.states?.find((s) => s.sourceId === "players_panel");
            if (day && players) players.data.day = day;
            let loaded = false;
            try {
                loaded = loadPlannerState(state);
            } catch (error) {
                console.warn("[AWBW Enhancements] Couldn't load the board from the game page:", error);
            }
            post({ type: "state-loaded", loaded });
        });
    });

    OptionsReader.instance().onOptionsReady((options) => {
        let hotkeys = options.options_bindings_planner_panel_hotkey || [];
        document.addEventListener("keydown", (e) => {
            if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
            let target = e.target;
            if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
            if (hotkeys.includes(e.keyCode)) {
                e.preventDefault();
                post({ type: "close" });
            }
        });
    });
})();
