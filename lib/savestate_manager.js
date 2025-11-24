const kSnapshotButtonsHtml = `
<td colspan="4">
  <div class="awbwenhancements-btn-container">
    <div id="planner-snapshot-state" class="awbwenhancements-btn"
         title="Snapshot the current board state without downloading a savestate file.">
      Snapshot
    </div>
    <div id="planner-restore-state" class="awbwenhancements-btn"
         title="Restore the selected snapshot.">
      Restore
    </div>
    <select id="planner-snapshot-selecter" class="awbwenhancements-select">
      <option></option>
    </select>
    <div id="planner-toggle-view" class="awbwenhancements-btn"
         title="Switch to Tree View interface.">
      Tree View
    </div>
  </div>
</td>`;

const kTreeSnapshotButtonHtml = `
<td colspan="4">
  <div class="awbwenhancements-btn-container">
    <div id="planner-snapshot-state" class="awbwenhancements-btn awbwenhancements-fixed-btn"
         title="Snapshot the current board state without downloading a savestate file.">
      Snapshot
    </div>
    <div id="planner-restore-state" class="awbwenhancements-btn awbwenhancements-fixed-btn"
         title="Restore the selected snapshot.">
      Restore
    </div>
    <div id="planner-delete-state" class="awbwenhancements-btn awbwenhancements-fixed-btn"
         title="Delete the selected snapshot and all its children.">
      Delete
    </div>
    <div id="planner-toggle-view" class="awbwenhancements-btn awbwenhancements-fixed-btn"
         title="Switch to List View interface.">
      List View
    </div>
  </div>
</td>`;


function setButtonText(button, text) {
    for (let node of button.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            node.nodeValue = text;
            return;
        }
    }
}

function appendSnapshotButtons(controlsTable) {
    let tbody = controlsTable.getElementsByTagName("tbody")[0];
    let newTr = document.createElement("tr");
    newTr.innerHTML = kSnapshotButtonsHtml;
    tbody.appendChild(newTr);
}

function appendTreeSnapshotButton(controlsTable) {
    let tbody = controlsTable.getElementsByTagName("tbody")[0];
    let newTr = document.createElement("tr");
    newTr.innerHTML = kTreeSnapshotButtonHtml;
    tbody.appendChild(newTr);
}

class TreeNode {
    constructor(id, parentId, data, metadata) {
        this.id = id;
        this.parentId = parentId;
        this.children = [];
        this.data = data;
        this.metadata = metadata; // { name, timestamp, type: 'day'|'snapshot' }
    }
}

class SavestateManager {
    constructor(controlsTable, baseUrl, savestateInterceptor) {
        this.controlsTable = controlsTable;
        this.baseUrl = baseUrl;
        this.savestateInterceptor = savestateInterceptor;

        this.snapshots = []; // Legacy list support
        this.manualSnapshotCounter = 0;

        // Tree support
        this.nodes = new Map();
        this.rootId = null;
        this.currentStateId = null;
        this.nextNodeId = 0;

        this.downloadStateButton = document.getElementById("planner-save-state");
        setButtonText(this.downloadStateButton, "Download State");
        this.downloadStateButton.title = "Download a savestate file that can be uploaded later.";
        this.uploadStateButton = document.getElementById("planner-load-state");
        setButtonText(this.uploadStateButton, "Upload State");
        this.uploadStateButton.title = "Upload a savestate file that was downloaded previously.";

        this.reloadStateButton = document.getElementById("planner-reload-state");
        this.reloadStateButton.addEventListener("click", this.onReloadStateClicked.bind(this));
        this.lastRestoredSavestateJson = undefined;

        this.options = {};
        OptionsReader.instance().onOptionsReady((options) => {
            this.options = options;
            if (this.options.options_enable_snapshot_tree_view) {
                this.initTreeUI();
                appendTreeSnapshotButton(this.controlsTable);
                this.snapshotStateButton = document.getElementById("planner-snapshot-state");
                this.snapshotStateButton.addEventListener("click", this.onSnapshotStateClick.bind(this));
                this.restoreStateButton = document.getElementById("planner-restore-state");
                this.restoreStateButton.addEventListener("click", this.onRestoreStateClick.bind(this));
                this.deleteStateButton = document.getElementById("planner-delete-state");
                this.deleteStateButton.addEventListener("click", this.onDeleteStateClick.bind(this));
                this.toggleViewButton = document.getElementById("planner-toggle-view");
                this.toggleViewButton.addEventListener("click", this.onToggleViewClick.bind(this));
            } else {
                appendSnapshotButtons(this.controlsTable);
                this.snapshotStateButton = document.getElementById("planner-snapshot-state");
                this.snapshotStateButton.addEventListener("click", this.onSnapshotStateClick.bind(this));
                this.restoreStateButton = document.getElementById("planner-restore-state");
                this.restoreStateButton.addEventListener("click", this.onRestoreStateClick.bind(this));
                this.snapshotSelecter = document.getElementById("planner-snapshot-selecter");
                this.toggleViewButton = document.getElementById("planner-toggle-view");
                this.toggleViewButton.addEventListener("click", this.onToggleViewClick.bind(this));
            }
        });
    }

    onToggleViewClick() {
        let newValue = !this.options.options_enable_snapshot_tree_view;
        let saveObj = { "options_enable_snapshot_tree_view": newValue };
        chrome.storage.sync.set(saveObj, () => {
            window.location.reload();
        });
    }

    initTreeUI() {
        // Create container for tree visualizer
        let tr = document.createElement("tr");
        let td = document.createElement("td");
        td.colSpan = 4;
        let container = document.createElement("div");
        container.id = "planner-tree-container";
        td.appendChild(container);
        tr.appendChild(td);

        // Insert into the controls table (at the end, or before the snapshot button?)
        // The user wants it "underneath the current menu".
        // If we just append to tbody, it goes to the bottom.
        let tbody = this.controlsTable.getElementsByTagName("tbody")[0];
        tbody.appendChild(tr);

        // Initialize visualizer
        this.treeVisualizer = new TreeVisualizer(container, this);
    }

    // TODO: allow downloading a package containing all snapshots?
    takeSnapshot(snapshotName, explicitSnapshot) {
        console.log("Started waiting for snapshot:", snapshotName);
        this.savestateInterceptor.takeNextSnapshot((snapshot) => {
            console.log("manager got snapshot:", snapshot);

            if (this.options.options_enable_snapshot_tree_view) {
                this.addSnapshotNode(snapshot, snapshotName, explicitSnapshot ? 'snapshot' : 'day');
            } else {
                this.snapshots.push({
                    name: snapshotName,
                    data: JSON.parse(JSON.stringify(snapshot))
                });
                if (explicitSnapshot) {
                    this.lastSnapshotIndex = this.snapshots.length - 1;
                }
                this.updateSnapshotSelecter();
            }
            console.log("Finished taking snapshot:", snapshotName);
        });
        // TODO: refactor so that the interceptor handles this for us?
        this.downloadStateButton.click();
    }

    addSnapshotNode(snapshotData, name, type) {
        let newData = JSON.parse(JSON.stringify(snapshotData));

        // If we have a current state, check if we are just branching off it
        // or if we are already at a node that matches this state (e.g. re-snapshotting same state)
        // For simplicity, let's always create a new node if it's a manual snapshot or day start
        // unless we want to detect duplicates.

        // Basic duplicate detection: check children of current node
        let parentId = this.currentStateId;
        let existingChildId = this.findMatchingChild(parentId, newData);

        if (existingChildId !== null) {
            console.log("Found existing matching child node, moving to it:", existingChildId);
            this.currentStateId = existingChildId;
            this.treeVisualizer.render();
            return;
        }

        let nodeId = this.nextNodeId++;
        let node = new TreeNode(nodeId, parentId, newData, {
            name: name,
            timestamp: Date.now(),
            type: type
        });

        this.nodes.set(nodeId, node);

        if (parentId !== null) {
            let parent = this.nodes.get(parentId);
            parent.children.push(nodeId);
        } else {
            this.rootId = nodeId;
        }

        this.currentStateId = nodeId;
        this.treeVisualizer.render();
    }

    findMatchingChild(parentId, newData) {
        if (parentId === null) return null;
        let parent = this.nodes.get(parentId);
        for (let childId of parent.children) {
            let child = this.nodes.get(childId);
            if (this.areStatesEqual(child.data, newData)) {
                return childId;
            }
        }
        return null;
    }

    areStatesEqual(state1, state2) {
        // Deep comparison of relevant state parts
        // This can be expensive, so maybe optimize later
        return JSON.stringify(state1) === JSON.stringify(state2);
    }

    updateSnapshotSelecter() {
        if (!this.snapshotSelecter) return;
        let hasDefaultOption = this.snapshotSelecter.options[this.snapshotSelecter.options.length - 1].value === "";
        let startIndex = this.snapshotSelecter.options.length - (hasDefaultOption ? 1 : 0);
        for (let i = startIndex; i < this.snapshots.length; i++) {
            let snapshot = this.snapshots[i];
            let option = new Option(snapshot.name, i, true, true);
            this.snapshotSelecter.add(option, 0);
        }
        if (hasDefaultOption) {
            this.snapshotSelecter.options[this.snapshotSelecter.options.length - 1].remove();
        }
    }

    getStateSnapshotToInject() {
        if (this.options.options_enable_snapshot_tree_view) {
            if (this.currentStateId === null) return null;
            let node = this.nodes.get(this.currentStateId);
            let snapshot = JSON.parse(JSON.stringify(node.data));
            snapshot.terrainPath = this.baseUrl + "/";
            return snapshot;
        } else {
            let snapshotIndex = parseInt(this.snapshotSelecter.options[this.snapshotSelecter.selectedIndex].value);
            let snapshot = JSON.parse(JSON.stringify(this.snapshots[snapshotIndex].data));
            snapshot.terrainPath = this.baseUrl + "/";
            return snapshot;
        }
    }

    onTurnStart(day, playerName) {
        let name = "Day " + day + " - " + playerName;
        // name += " (" + (new Date()).toLocaleTimeString() + ")"; // Tree view might not need time in name
        if (!this.options.options_enable_snapshot_tree_view) {
            name += " (" + (new Date()).toLocaleTimeString() + ")";
        }
        this.takeSnapshot(name, /*explicitSnapshot=*/false);
    }

    onSnapshotStateClick() {
        let name = "Snapshot " + ++this.manualSnapshotCounter;
        name += " (" + (new Date()).toLocaleTimeString() + ")";
        this.takeSnapshot(name, /*explicitSnapshot=*/true);
    }

    onSavestateUpload(filename, savestateData) {
        this.lastRestoredSavestateJson = JSON.stringify(savestateData);

        if (this.options.options_enable_snapshot_tree_view) {
            this.addSnapshotNode(savestateData, filename, 'upload');
        } else {
            this.snapshots.push({
                name: filename,
                data: JSON.parse(JSON.stringify(savestateData)),
            });
            this.updateSnapshotSelecter();
        }
    }

    // TODO: allow "undo" for individual units?
    onRestoreStateClick() {
        let savestateData = this.getStateSnapshotToInject();
        if (!savestateData) return;

        this.lastRestoredSavestateJson = JSON.stringify(savestateData);

        // Put the snapshot that we want to restore in the special node
        let snapshotElement = document.getElementById("awbw_enhancements-savestate-snapshot");
        snapshotElement.setAttribute("data", JSON.stringify(savestateData));
        // Then click the node to kick off the load trigger in the injected script.
        snapshotElement.click();

        // Inform our own hooks of the savestate being restored
        let lastActionsElement = document.getElementById("last-actions");
        if (lastActionsElement) {
            lastActionsElement.innerHTML = "";
        }
        this.savestateInterceptor.restoreSavestate(savestateData);
    }

    restoreNode(nodeId) {
        this.currentStateId = nodeId;
        this.onRestoreStateClick();
        this.treeVisualizer.render();
    }

    onDeleteStateClick() {
        if (this.currentStateId === null || this.currentStateId === this.rootId) {
            alert("Cannot delete the root node.");
            return;
        }

        if (confirm("Are you sure you want to delete this node and all its children?")) {
            this.deleteNode(this.currentStateId);
        }
    }

    deleteNode(nodeId) {
        if (nodeId === this.rootId) {
            return;
        }

        let node = this.nodes.get(nodeId);
        if (!node) return;

        // Remove from parent's children list
        if (node.parentId !== null) {
            let parent = this.nodes.get(node.parentId);
            if (parent) {
                parent.children = parent.children.filter(id => id !== nodeId);
            }
        }

        // Recursively delete children
        let deleteRecursively = (id) => {
            let n = this.nodes.get(id);
            if (!n) return;
            for (let childId of n.children) {
                deleteRecursively(childId);
            }
            this.nodes.delete(id);
        };

        deleteRecursively(nodeId);

        // Move current state to parent
        this.currentStateId = node.parentId;
        this.treeVisualizer.render();

        // Restore the parent state so the game board matches the new selection
        this.onRestoreStateClick();
    }

    onReloadStateClicked() {
        if (this.lastRestoredSavestateJson === undefined) {
            reportError("Reload state clicked but lastRestoredSavestateJson was undefined!");
            return;
        }

        // The reload state button's default listener only restores the moveplanner's state,
        // not the extension's, so we add our own hook to it as well.
        let savestateData = JSON.parse(this.lastRestoredSavestateJson);
        this.savestateInterceptor.restoreSavestate(savestateData);
    }
}

class TreeVisualizer {
    constructor(container, manager) {
        this.container = container;
        this.manager = manager;
        this.nodeRadius = 10;
        this.levelSpacing = 30;
        this.branchSpacing = 25;

        this.render();
    }

    render() {
        this.container.innerHTML = "";
        if (this.manager.nodes.size === 0) return;

        // Calculate layout
        let layout = this.calculateLayout();

        // Create SVG
        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.width = "100%";
        svg.style.height = (layout.height + 40) + "px";
        svg.style.overflow = "visible";

        // Render edges
        for (let node of layout.nodes) {
            if (node.parentId !== null) {
                let parent = layout.nodes.find(n => n.id === node.parentId);
                if (parent) {
                    let line = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    // Bezier curve for smoother branches
                    let d = `M ${parent.x} ${parent.y} C ${(parent.x + node.x) / 2} ${parent.y}, ${(parent.x + node.x) / 2} ${node.y}, ${node.x} ${node.y}`;
                    line.setAttribute("d", d);
                    line.setAttribute("stroke", "#999");
                    line.setAttribute("stroke-width", "2");
                    line.setAttribute("fill", "none");
                    svg.appendChild(line);
                }
            }
        }

        // Render nodes
        for (let node of layout.nodes) {
            let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
            g.style.cursor = "pointer";
            g.onclick = () => this.manager.restoreNode(node.id);

            let circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("r", this.nodeRadius);

            // Color based on player
            let playerCode = "neutral";
            if (node.data.awbw_enhancements_extras) {
                let playersState = node.data.awbw_enhancements_extras.states.find(s => s.sourceId === "players_panel");
                if (playersState && playersState.data && playersState.data.panel_states) {
                    let currentPlayer = playersState.data.panel_states.find(ps => ps.state.is_current_turn);
                    if (currentPlayer) {
                        playerCode = currentPlayer.country_code;
                    }
                }
            }

            circle.setAttribute("class", `tree-node-circle country-${playerCode}`);
            if (node.id === this.manager.currentStateId) {
                circle.setAttribute("stroke", "black");
                circle.setAttribute("stroke-width", "3");
            } else {
                circle.setAttribute("stroke", "#666");
                circle.setAttribute("stroke-width", "1");
            }

            g.appendChild(circle);

            // Label (Day/Snapshot number)
            let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dy", ".3em");
            text.style.fontSize = "11px";
            text.style.fontWeight = "bold";
            text.style.fontFamily = "sans-serif";
            text.style.pointerEvents = "none";

            let label = "";
            if (node.metadata.type === 'day') {
                // Extract Day number from name "Day X - ..."
                let match = node.metadata.name.match(/Day (\d+)/);
                label = match ? "D" + match[1] : "D";
            } else {
                // Snapshot
                let match = node.metadata.name.match(/Snapshot (\d+)/);
                label = match ? "S" + match[1] : "S";
            }
            text.textContent = label;
            g.appendChild(text);

            // Tooltip title
            let title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = node.metadata.name;
            g.appendChild(title);

            svg.appendChild(g);
        }

        this.container.appendChild(svg);
    }

    calculateLayout() {
        // Simple Reingold-Tilford-ish layout or just depth-based with fixed spacing
        // Since we want a horizontal timeline, x = depth * spacing
        // y needs to handle branches.

        let nodes = [];
        let maxY = 0;

        // 1. Assign Depth (X)
        let assignDepth = (nodeId, depth) => {
            let node = this.manager.nodes.get(nodeId);
            nodes.push({
                id: nodeId,
                parentId: node.parentId,
                data: node.data,
                metadata: node.metadata,
                depth: depth,
                x: 20 + depth * this.levelSpacing,
                y: 0,
                children: node.children
            });
            for (let childId of node.children) {
                assignDepth(childId, depth + 1);
            }
        };

        if (this.manager.rootId !== null) {
            assignDepth(this.manager.rootId, 0);
        }

        // 2. Assign Y (Branching)
        // A simple approach: Leaf nodes get unique Y values. Parents are centered on children.
        // Actually, for a timeline, maybe just stacking branches is enough.
        // Let's try a simple "counter" for Y based on leaf traversal.

        let leafCounter = 0;
        let assignY = (nodeId) => {
            let node = nodes.find(n => n.id === nodeId);
            if (node.children.length === 0) {
                node.y = 20 + leafCounter * this.branchSpacing;
                leafCounter++;
                return node.y;
            }

            let childYs = [];
            for (let childId of node.children) {
                childYs.push(assignY(childId));
            }

            // Parent Y is average of children Ys? Or just the first child (main branch)?
            // For a timeline, main branch staying straight is nice.
            // Let's center it for now.
            node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
            return node.y;
        };

        if (this.manager.rootId !== null) {
            assignY(this.manager.rootId);
        }

        maxY = leafCounter * this.branchSpacing;

        return { nodes, height: maxY };
    }
}

