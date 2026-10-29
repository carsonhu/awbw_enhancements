// Runs at document_start, before the page is drawn, so that the move planner in the game page's planner panel never
// flashes the site header: marks the page as embedded for res/awbw_enhancements.css. The rest of the embedded
// handling is in embedded_planner_script.js.

// The panel's planner starts with the damage calculators closed and fresh. They keep what they show in sessionStorage,
// which the panel shares with the game page (and whatever planner it showed before), so this clears that, except
// where their windows are. Here, before AWBW's calculator reads it; embedded_planner_script.js also calls it each
// time the panel is opened.
function resetEmbeddedCalculatorStorage() {
    function keepOnly(key, kept) {
        try {
            let saved = JSON.parse(sessionStorage.getItem(key));
            if (!saved || typeof saved !== "object") return;
            let fresh = {};
            for (let prop of kept) {
                if (prop in saved) fresh[prop] = saved[prop];
            }
            sessionStorage.setItem(key, JSON.stringify(fresh));
        } catch (e) {}
    }
    // AWBW's damage calculator (calculator_new.js) and the multi-hit calculator (res/multihit_calculator.js).
    keepOnly("calculator", ["windowPosition", "coTheme"]);
    keepOnly("awbwEnhancementsMultihit", ["position", "width"]);
}

(function () {
    if (window.top === window || !window.location.hash.includes("awbwe-embedded")) return;
    document.documentElement.classList.add("awbwe-embedded");
    resetEmbeddedCalculatorStorage();

    // AWBW's move planner goes to the previous / next turn with the left and right arrow keys. In the panel they
    // scroll instead (the "Replay:" turn selector still changes turns). Stopped before they reach AWBW's own
    // listener, but not prevented, so the browser still scrolls with them.
    window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.stopImmediatePropagation();
        }
    }, true);
})();
