// Undo for the moveplanner. Keeps the board as it was after each change, newest last, so that Undo can put back the
// one before. Each is taken the way snapshots are (see SavestateManager.takeSnapshot()): the moveplanner saves its
// state in the page, without asking AWBW's server for anything. Undoing restores one the way a snapshot is restored.
//
// A change is anything on the map or in the players panel. It's recorded once the board has been still for a moment,
// so the parts of one action (a build changes the map and the funds) are one step, and not while a unit is following
// the cursor to where it's being moved.

const kUndoSettleMs = 100;
const kUndoMovingRetryMs = 200;
const kUndoMaxSteps = 100;
const kUndoSnapshotTimeoutMs = 3000;
const kUndoLoadTimeoutMs = 5000;

class UndoHistory {
    // isMovingUnit() is whether AWBW has a unit following the cursor. clearSelection() ends that, or closes an open
    // menu, as a click on the map would.
    constructor(savestateManager, savestateInterceptor, gamemap, playersPanelElement, isMovingUnit, clearSelection) {
        this.savestateManager = savestateManager;
        this.savestateInterceptor = savestateInterceptor;
        this.isMovingUnit = isMovingUnit;
        this.clearSelection = clearSelection;

        // Savestate JSON, oldest first. The last is the board as it was last recorded.
        this.states = [];
        // Bumped when the history starts over, so that a board recorded before then isn't added after.
        this.generation = 0;
        this.timer = null;
        // Recording and undoing take turns, in the order they were asked for.
        this.queue = Promise.resolve();

        // The cursor and the move range preview's tiles don't change the board.
        new MutationObserver((mutations) => {
            if (mutations.some((m) => m.target.id !== "cursor" && !isRangeTileMutation(m))) this.onChange();
        }).observe(gamemap, { subtree: true, childList: true, attributes: true });
        new MutationObserver(() => this.onChange())
            .observe(playersPanelElement, { subtree: true, childList: true, attributes: true, characterData: true });

        // The Undo button is in SavestateManager's snapshot row, which it adds once the options are read.
        document.addEventListener("click", (e) => {
            if (e.target.closest?.("#planner-undo")) this.undo();
        });
        document.addEventListener("keydown", this.onKeyDown.bind(this));
    }

    // Ctrl+Z (Cmd+Z on a Mac). Held down, it undoes once.
    onKeyDown(e) {
        if (e.keyCode !== 90 || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat) return;
        let active = document.activeElement;
        if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return;
        if (advancedHotkeysActionFor(e)) return;
        e.preventDefault();
        this.undo();
    }

    onChange() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.onSettled(), kUndoSettleMs);
    }

    onSettled() {
        if (this.isMovingUnit()) {
            this.timer = setTimeout(() => this.onSettled(), kUndoMovingRetryMs);
            return;
        }
        this.record();
    }

    // Records the board as it is now, unless it's the same as the last one recorded.
    record() {
        clearTimeout(this.timer);
        this.timer = null;
        let generation = this.generation;
        this.enqueue(async () => {
            let json = JSON.stringify(await this.snapshot());
            if (generation !== this.generation || json === this.states[this.states.length - 1]) return;
            this.states.push(json);
            if (this.states.length > kUndoMaxSteps) this.states.shift();
        });
    }

    // Puts back the board from before the last change.
    undo() {
        // AWBW holds on to a unit being moved, or the one whose menu is open, from the board an undo replaces. A unit
        // being moved is dropped where it is, which records it there, so undoing that puts it back where it started.
        this.clearSelection();
        this.record();
        let generation = this.generation;
        this.enqueue(async () => {
            if (generation !== this.generation || this.states.length < 2) return;
            this.states.pop();
            await this.restore(JSON.parse(this.states[this.states.length - 1]));
            // The board as the moveplanner has it now, in case loading it changed anything (it fills in defaults).
            let json = JSON.stringify(await this.snapshot());
            if (generation !== this.generation) return;
            this.states[this.states.length - 1] = json;
        });
    }

    // Drops the history and starts it over from a board that's being loaded (by loadPlannerState()), like a planner
    // opened on it. Call it right after starting the load.
    startOver() {
        clearTimeout(this.timer);
        this.timer = null;
        this.generation++;
        this.states = [];
        let loaded = this.nextLoad();
        this.queue = this.queue.then(() => loaded);
        this.record();
    }

    enqueue(task) {
        this.queue = this.queue.then(task).catch((error) => {
            console.warn("[AWBW Enhancements] Undo:", error);
        }).then(() => this.updateButton());
    }

    // The board as a savestate, with the extension's own part.
    snapshot() {
        return new Promise((resolve, reject) => {
            let callback = (state) => {
                clearTimeout(timeout);
                resolve(state);
            };
            let timeout = setTimeout(() => {
                this.savestateInterceptor.cancelSnapshot(callback);
                reject(new Error("timed out waiting for the board's state"));
            }, kUndoSnapshotTimeoutMs);
            this.savestateInterceptor.takeNextSnapshot(callback);
            document.getElementById("planner-save-state").click();
        });
    }

    // Resolves once the moveplanner has drawn the next state loaded into it (res/savestate_injector.js says when).
    nextLoad() {
        let snapshotElement = document.getElementById("awbw_enhancements-savestate-snapshot");
        return new Promise((resolve) => {
            let done = () => {
                clearTimeout(timeout);
                snapshotElement.removeEventListener("awbwe-savestate-loaded", done);
                resolve();
            };
            let timeout = setTimeout(done, kUndoLoadTimeoutMs);
            snapshotElement.addEventListener("awbwe-savestate-loaded", done);
        });
    }

    async restore(state) {
        // AWBW shows its Reload State button once it's loaded a state, to load it again. An undo isn't one to go back
        // to, so the button stays as it was.
        let reloadButton = document.getElementById("planner-reload-state");
        let loadButton = document.getElementById("planner-load-state");
        let buttonStyles = [reloadButton?.style.cssText, loadButton?.style.cssText];

        let loaded = this.nextLoad();
        this.savestateManager.restoreState(state);
        await loaded;

        if (reloadButton) reloadButton.style.cssText = buttonStyles[0];
        if (loadButton) loadButton.style.cssText = buttonStyles[1];
    }

    // Shown as available once a change has been recorded. (Undo still works in the moment before that: it records
    // the change first.)
    updateButton() {
        let button = document.getElementById("planner-undo");
        if (!button) return;
        button.classList.toggle("awbwenhancements-btn-disabled", this.states.length < 2);
    }
}
