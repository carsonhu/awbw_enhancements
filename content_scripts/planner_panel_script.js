// Move planner panel for the game page: opens AWBW's move planner in a panel over the game, so lines can be
// explored without leaving the replay or the game for another tab.
//
// The panel is an iframe of moveplanner.php, the same page AWBW's own Move Planner button opens. AWBW keeps that
// button's link pointing at the replay's current turn (moveplanner.php?replays_id=...&ndx=...), or at the live
// game outside of replays. embedded_planner_script.js strips the planner page down inside the iframe and reports
// its size and turn back here.
//
// In a replay, the panel shows the board as it is at the moment on screen, part way through the turn: AWBW's
// replay keeps the board as data in the page (read by res/game_state_reader.js), which the panel loads into the
// planner like an uploaded savestate. That needs no requests to AWBW, so on the same turn (or in the same game) the
// panel loads the board into the planner it already has open rather than reloading the planner.
//
// The panel always follows the replay or game: reopening it after the replay has moved on (to another turn, or
// within the turn) or the game has changed shows it as it is now, and drops what was planned in the panel before.

const kEmbeddedPlannerHash = "awbwe-embedded";
const kEmbeddedPlannerSource = "awbwe-embedded-planner";

// The replay turn a move planner link loads, or null for a live game.
function plannerLinkTurn(href) {
    let url = new URL(href, window.location.href);
    return url.searchParams.has("ndx") ? url.searchParams.get("ndx") : null;
}

// A summary of what's on the game page's board, to tell when the game or replay has moved on: units (where they are,
// their sprites and HP, waited or not), building owners, and the players' funds.
function gameFingerprint() {
    let parts = [];
    for (let element of document.querySelectorAll("#gamemap span.game-unit, #gamemap span.game-building")) {
        let sprites = Array.from(element.getElementsByTagName("img"), (img) => img.getAttribute("src")).join(",");
        parts.push(`${element.className}@${element.style.left},${element.style.top}:${sprites}`);
    }
    for (let funds of document.querySelectorAll(".player-funds")) {
        parts.push(funds.textContent.trim());
    }
    return parts.join("|");
}

// A moveplanner savestate (see the moveplanner's saveState() and createLoadedState()) for the game page's board, as
// read by res/game_state_reader.js. Players' funds, COs, powers and whose turn it is go in the extension's own part
// of the savestate, for the moveplanner's player panels.
function plannerStateFromGame(game) {
    let unitsState = {};
    for (let unit of Object.values(game.unitsInfo || {})) {
        // The moveplanner has no way to show units loaded in transports.
        if (!unit || unit.units_carried === "Y") continue;
        let hp = parseFloat(unit.units_hit_points);
        unitsState[unit.units_id] = Object.assign({}, unit, {
            // The moveplanner draws whole HP (the game has e.g. 6.3, shown as 7) and calls waited units "moved".
            units_hit_points: isNaN(hp) ? unit.units_hit_points : Math.min(10, Math.max(1, Math.ceil(hp))),
            moved: unit.units_moved ? 1 : 0,
            units_capture: unit.units_capture ? 1 : 0,
        });
    }
    let panelStates = Object.values(game.playersInfo || {}).map((player) => ({
        country_code: player.countries_code,
        state: {
            is_current_turn: String(player.players_id) === String(game.currentTurn),
            funds: typeof player.players_funds === "number" ? player.players_funds : undefined,
            players_co_id: player.players_co_id,
            co_name: player.co_name,
            co_power: player.players_co_power_on,
        },
    }));
    return {
        buildingsState: game.buildingsInfo,
        fogArray: null,
        unitsState,
        awbw_enhancements_extras: { states: [{ sourceId: "players_panel", data: { panel_states: panelStates } }] },
    };
}

// The same moveplanner page (game, or replay and turn), ignoring the #hash.
function samePlannerPage(lhs, rhs) {
    if (!lhs || !rhs || lhs === "about:blank" || rhs === "about:blank") return false;
    let a = new URL(lhs, window.location.href), b = new URL(rhs, window.location.href);
    return a.pathname === b.pathname && a.search === b.search;
}

class PlannerPanel {
    constructor(options, plannerLink, mapControls) {
        this.hotkeys = options.options_bindings_planner_panel_hotkey || [];
        this.plannerLink = plannerLink;
        this.mapControls = mapControls;
        // What the panel last loaded: the link, and the game's fingerprint at the time.
        this.loadedHref = null;
        this.loadedFingerprint = null;
        this.contentWidth = 0;
        // Whether the planner in the iframe can take a board (null until it says), and the board to give it once it can.
        this.plannerCanLoad = null;
        this.pendingBoard = null;
        this.loadingTimeout = null;
        this.turnLabel = null;

        this.panel = document.createElement("div");
        this.panel.id = "awbwe-planner-panel";
        this.panel.innerHTML = `
<div class="awbwe-rp-bar">
  <span class="awbwe-rp-title">Move Planner</span>
  <button type="button" data-action="resync"></button>
  <button type="button" data-action="tab" title="Open what this panel shows in the move planner in a new tab">Open in tab</button>
  <button type="button" data-action="close" title="Close${this.hotkeyHint()}">&#10005;</button>
</div>
<div class="awbwe-rp-loading">Loading the move planner...</div>
<iframe title="Move Planner"></iframe>`;
        this.iframe = this.panel.querySelector("iframe");
        this.title = this.panel.querySelector(".awbwe-rp-title");
        this.resyncButton = this.panel.querySelector("[data-action='resync']");
        document.body.appendChild(this.panel);

        this.panel.querySelector(".awbwe-rp-bar").addEventListener("click", (e) => {
            let action = e.target.closest("[data-action]")?.dataset.action;
            if (action === "resync") this.load();
            else if (action === "tab") this.openInTab();
            else if (action === "close") this.close();
        });
        window.addEventListener("message", this.onMessage.bind(this));
        window.addEventListener("resize", () => this.position());
        // Captured on the window so that Esc still reaches it when AWBW Advanced Hotkeys, which listens on the
        // document, stops it there (it binds Esc to closing the chat).
        window.addEventListener("keydown", this.onKeyDown.bind(this), true);

        this.injectGameStateReader();
        this.addButton();
        this.updateLabels();
    }

    injectGameStateReader() {
        let script = document.createElement("script");
        script.src = chrome.runtime.getURL("/res/game_state_reader.js");
        (document.head || document.documentElement).appendChild(script);
    }

    // The board the game page is showing, as a moveplanner savestate, or null if it can't be read.
    captureBoard() {
        let json = null;
        let onState = (e) => { json = e.detail; };
        document.addEventListener("awbwe-game-state", onState);
        // Answered synchronously by res/game_state_reader.js.
        document.dispatchEvent(new CustomEvent("awbwe-game-state-request"));
        document.removeEventListener("awbwe-game-state", onState);
        if (!json) return null;
        try {
            return plannerStateFromGame(JSON.parse(json));
        } catch (error) {
            console.warn("[AWBW Enhancements] Couldn't read the game page's board:", error);
            return null;
        }
    }

    frameHref() {
        try {
            return this.iframe.contentWindow?.location.href || null;
        } catch (e) {
            return null;
        }
    }

    // Keys that AWBW Advanced Hotkeys also uses are left to it, so they aren't mentioned.
    hotkeyHint() {
        let bindings = advancedHotkeysBindings();
        let hotkeys = this.hotkeys.filter((code) => !advancedHotkeysActionForKeyCode(bindings, code));
        return hotkeys.length ? ` (Hotkey: ${hotkeys.map((code) => keyCodeToName(code)).join(" / ")})` : "";
    }

    isReplay() {
        return plannerLinkTurn(this.plannerLink.href) !== null;
    }

    // A "Plan here" button beside AWBW's Move Planner button, in the same style.
    addButton() {
        let button = document.createElement("div");
        button.className = "awbwe-plan-btn game-tools-btn";
        button.style.borderRight = "none";
        button.innerHTML = `
<div class="game-tools-bg"><img src="terrain/moveplanner.gif" style="margin-top: 7px; vertical-align: middle;"></div>
<span class="game-tools-btn-text small_text">Plan here${this.hotkeyHint()}</span>`;
        button.addEventListener("click", () => this.toggle());
        let plannerButton = this.plannerLink.closest(".move-planner-btn");
        plannerButton.parentNode.insertBefore(button, plannerButton.nextSibling);
    }

    isOpen() {
        return this.panel.classList.contains("awbwe-rp-open");
    }

    toggle() {
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.panel.classList.add("awbwe-rp-open");
        this.position();
        if (this.loadedHref === null || this.isStale()) {
            this.load();
        } else {
            this.iframe.contentWindow?.focus();
        }
        this.updateLabels();
    }

    close() {
        this.panel.classList.remove("awbwe-rp-open");
        window.focus();
    }

    // Shows what the game page is showing. In a replay that's the board at the moment on screen; in a game, the
    // planner page itself is the game as it is now, so a board is only needed to update a planner that's open.
    load() {
        let replay = this.isReplay();
        let samePage = samePlannerPage(this.frameHref(), this.plannerLink.href);
        let board = replay || samePage ? this.captureBoard() : null;
        this.loadedHref = this.plannerLink.href;
        this.loadedFingerprint = gameFingerprint();
        this.setLoading(true);
        if (samePage && board && this.plannerCanLoad) {
            // Same game and turn: no need to reload the planner (or ask AWBW for anything).
            this.sendBoard(board);
        } else {
            this.pendingBoard = board;
            this.navigate();
        }
        this.updateLabels();
    }

    navigate() {
        let url = new URL(this.plannerLink.href, window.location.href);
        url.hash = kEmbeddedPlannerHash;
        this.plannerCanLoad = null;
        // Setting the URL the iframe is already on (it ends in a #hash) only scrolls to the hash, so reload instead.
        if (this.frameHref() === url.toString()) {
            this.iframe.contentWindow.location.reload();
        } else {
            this.iframe.src = url.toString();
        }
    }

    sendBoard(board) {
        this.iframe.contentWindow.postMessage({ source: "awbwe-planner-panel", type: "load-state", state: board },
                                              window.location.origin);
    }

    // While loading, the panel says so rather than showing a planner that's about to change. Gives up after a while
    // (e.g. if the planner never finishes setting up), and shows whatever the planner has.
    setLoading(loading) {
        this.panel.classList.toggle("awbwe-rp-is-loading", loading);
        clearTimeout(this.loadingTimeout);
        if (loading) {
            this.loadingTimeout = setTimeout(() => this.setLoading(false), 20000);
        } else if (this.isOpen()) {
            this.iframe.contentWindow?.focus();
        }
    }

    openInTab() {
        let url = new URL(this.iframe.contentWindow?.location.href || this.plannerLink.href, window.location.href);
        url.hash = "";
        window.open(url.toString(), "_blank");
    }

    // Covers the page's content column from its top, where the title bar is, like the move planner page.
    position() {
        if (!this.isOpen()) return;
        let outer = document.getElementById("outer");
        let rect = (outer || this.mapControls).getBoundingClientRect();
        this.panel.style.left = (rect.left + window.scrollX) + "px";
        this.panel.style.top = (rect.top + window.scrollY) + "px";
        this.panel.style.width = Math.max(rect.width, this.contentWidth) + "px";
    }

    // The turn the panel shows: the planner's turn selector can move it to another turn than the one loaded.
    shownTurn() {
        try {
            let href = this.iframe.contentWindow?.location.href;
            if (href && href !== "about:blank") return plannerLinkTurn(href);
        } catch (e) {}
        return plannerLinkTurn(this.loadedHref);
    }

    // Whether the panel no longer shows what the replay or game is showing: the replay has moved on (to another turn,
    // or within the turn), the game has changed, or replay mode was left or entered.
    isStale() {
        if (this.loadedHref === null) return false;
        if (this.isReplay() && plannerLinkTurn(this.plannerLink.href) !== this.shownTurn()) return true;
        if (!this.isReplay() && plannerLinkTurn(this.loadedHref) !== null) return true;
        return gameFingerprint() !== this.loadedFingerprint;
    }

    // The button starts over from what the replay or game is showing, e.g. after trying out a line.
    updateLabels() {
        let replay = this.isReplay();
        this.resyncButton.textContent = replay ? "Load from here" : "Reload game";
        this.resyncButton.title = (replay ? "Load the board as the replay is showing it now" : "Load the game as it is now") +
            " (discards what you've planned here)";
    }

    onMessage(e) {
        if (e.source !== this.iframe.contentWindow || e.origin !== window.location.origin) return;
        let message = e.data || {};
        if (message.source !== kEmbeddedPlannerSource) return;
        if (message.type === "ready") {
            // A new planner page: it can't take a board until it says so ("planner-ready").
            this.plannerCanLoad = null;
            this.turnLabel = message.turn && this.isReplay() ? message.turn : null;
            this.title.textContent = this.turnLabel ? `Move Planner: ${this.turnLabel}` : "Move Planner";
            if (!this.pendingBoard) this.setLoading(false);
            this.updateLabels();
        } else if (message.type === "planner-ready") {
            this.plannerCanLoad = message.canLoadState;
            let board = this.pendingBoard;
            this.pendingBoard = null;
            if (board && this.plannerCanLoad) {
                this.sendBoard(board);
            } else {
                this.setLoading(false);
            }
        } else if (message.type === "state-loaded") {
            if (!message.loaded) console.warn("[AWBW Enhancements] The planner couldn't load the game page's board.");
            this.setLoading(false);
        } else if (message.type === "size") {
            this.iframe.style.height = message.height + "px";
            this.contentWidth = message.width;
            this.position();
        } else if (message.type === "close") {
            this.close();
        }
    }

    onKeyDown(e) {
        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
        let target = e.target;
        if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
        if (this.hotkeys.includes(e.keyCode) && !advancedHotkeysActionFor(e)) {
            e.preventDefault();
            this.toggle();
        } else if (e.key === "Escape" && this.isOpen()) {
            this.close();
        }
    }
}

OptionsReader.instance().onOptionsReady((options) => {
    if (!options.options_enable_planner_panel) {
        console.log("Move planner panel disabled.");
        return;
    }
    let plannerLink = document.querySelector(".move-planner-btn a");
    let mapControls = document.getElementById("map-controls-container");
    if (!plannerLink || !mapControls) {
        console.log("Move planner panel: no Move Planner button or map controls on this page.");
        return;
    }
    new PlannerPanel(options, plannerLink, mapControls);
});
