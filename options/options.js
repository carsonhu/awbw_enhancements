class KeybindListener {
    constructor(modalId) {
        this.keybindOptions = [];
        this.currentOption = undefined;
        this.modalElement = document.getElementById(modalId);
        this.modal = bootstrap.Modal.getOrCreateInstance(this.modalElement);

        this.modalElement.addEventListener("hidden.bs.modal", (event) => {
            this.cancelListen();
        });
        document.getElementById("clear-binding-btn").addEventListener("click", (event) => {
            this.handleClear();
        });

        document.addEventListener("keydown", (event) => {
            if (this.isActive()) {
                this.handleEvent(event);
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    addKeybindOption(keybindOption) {
        this.keybindOptions.push(keybindOption);
    }

    isActive() { return this.currentOption !== undefined; }

    handleEvent(event) {
        console.log("Got keyCode:", event.keyCode,
            "(" + keyCodeToName(event.keyCode) + ") for option:", this.currentOption.optionId);

        let currentOption = this.currentOption;
        this.cancelListen();
        currentOption.setKeyCode(event.keyCode);
        for (let keybindOption of this.keybindOptions) {
            if (keybindOption !== currentOption && keybindOption.keyCode() === event.keyCode
                && keybindOption.conflictsWith(currentOption)) {
                keybindOption.clearKeyCode();
            }
        }
    }

    handleClear() {
        let currentOption = this.currentOption;
        this.cancelListen();
        currentOption.clearKeyCode();
    }

    listen(option) {
        this.cancelListen();
        this.currentOption = option;

        let name = this.currentOption.name;
        let currentKey = this.currentOption.input.value || "None";
        let spans = this.modalElement.querySelectorAll(".modal-body span");
        spans[0].innerText = name;
        spans[1].innerText = currentKey;

        this.modal.show();
    }

    cancelListen() {
        if (this.modalElement.classList.contains("show")) {
            this.modal.hide();
        }
        this.currentOption = undefined;
    }
}

class KeybindOption {
    constructor(optionId, name, facility, keybindListener) {
        this.optionId = optionId;
        this.name = name;
        this.facility = facility;
        this.keybindListener = keybindListener;

        this.input = document.getElementById(this.optionId);
        this.input.addEventListener("click", (event) => { this.onClick(event); });
    }

    // Quick build keys only apply while hovering over their own kind of building, so a key can build a
    // different unit at a base, an airport, and a port. Every other binding conflicts with everything.
    conflictsWith(other) {
        return !this.facility || !other.facility || this.facility === other.facility;
    }

    keyCode() {
        if (this.input.hasAttribute("rawkeycode")) {
            return parseInt(this.input.getAttribute("rawkeycode"));
        }
        return undefined;
    }

    onClick(event) {
        console.log("clicked:", this.optionId);

        if (this.keybindListener.currentOption === this) {
            this.keybindListener.cancelListen();
        } else {
            this.startListen();
        }
    }

    startListen() {
        this.keybindListener.listen(this);
    }

    setKeyCode(keyCode) {
        this.input.value = keyCodeToName(keyCode);
        this.input.setAttribute("rawkeycode", keyCode);
        this.input.dispatchEvent(new Event("change"));
    }

    clearKeyCode() {
        this.input.value = "";
        this.input.removeAttribute("rawkeycode");
        this.input.dispatchEvent(new Event("change"));
    }
}



function templateDescription(lines) {
    let description = "";
    for (let i = 0; i < lines.length; i++) {
        let padding = (i === (lines.length - 1)) ? 'mb-0' : 'mb-2';
        description += `<p class="${padding}">${lines[i]}</p>`;
    }
    return description;
}

function templateCheckboxOption(mapping) {
    let description = templateDescription(mapping.description);
    let requires = (mapping.requires || []).join(" ");

    return `
<div class="row mb-3">
  <div class="col">
    <div class="form-check">
      <input type="checkbox" class="form-check-input ${requires}" id="${mapping.id}">
      <label for="${mapping.id}" class="form-check-label">${mapping.label}</label>
    </div>
  </div>
  <div class="form-text">${description}</div>
</div>`;
}

function initializeCheckboxOptions() {
    for (let optionMapping of kCheckOptionsMapping) {
        let container = document.getElementById(optionMapping.id + "-container");
        container.innerHTML = DOMPurify.sanitize(templateCheckboxOption(optionMapping));
    }
}

function templateRangeOption(mapping) {
    let description = templateDescription(mapping.description);
    let requires = (mapping.requires || []).join(" ");

    return `
<div class="row mb-3">
  <div class="col-sm-4 col-lg-3">
    <label for="${mapping.id}" class="form-label">${mapping.label}</label>
  </div>
  <div class="col-sm-2 col-xl-1">
      <input type="text" readonly class="form-control" id="${mapping.previewId}" value="${mapping.default}">
  </div>
  <div class="col">
    <input type="range" id="${mapping.id}" class="form-range ${requires}"
           min="${mapping.min}" max="${mapping.max}" step="${mapping.step}">
  </div>
  <div class="form-text">${description}</div>
</div>
    `;
}

function initializeRangeOptions() {
    for (let optionMapping of kRangeOptionsMapping) {
        let container = document.getElementById(optionMapping.id + "-container");
        container.innerHTML = DOMPurify.sanitize(templateRangeOption(optionMapping));

        let inputElement = document.getElementById(optionMapping.id);
        let previewElement = document.getElementById(optionMapping.previewId);
        if (inputElement && previewElement) {
            inputElement.addEventListener("input", () => {
                previewElement.value = inputElement.value;
            });
        }
        previewElement.value = inputElement.value;
    }
}

const kMaxKeyboardBindings = 2;
function templateKeyboardOption(mapping) {
    let description = templateDescription(mapping.description);
    let bindingHtml = "";
    let maxBindings = mapping.image ? 1 : kMaxKeyboardBindings;
    for (let i = 1; i <= maxBindings; i++) {
        bindingHtml += `
<div class="col">
  <input type="text" readonly class="form-control ${mapping.image ? 'form-control-sm' : ''}" id="${mapping.id}-${i}">
</div>`;
    }

    if (mapping.image) {
        return `
  <div class="d-flex align-items-center">
    <img src="${mapping.image}" class="me-2" title="${mapping.label}" style="width: 16px; height: 16px;">
    <div class="flex-grow-1 row g-1">
      ${bindingHtml}
    </div>
  </div>`;
    }

    return `
<div class="row mb-3">
  <label class="col-sm-3 col-lg-2 col-form-label">${mapping.label}</label>
  ${bindingHtml}
  <div class="form-text">${description}</div>
  <div class="form-text text-danger" id="${mapping.id}-advanced-hotkeys"></div>
</div>`;
}

// AWBW Advanced Hotkeys' bindings, as last seen on the game page (see content_scripts/advanced_hotkeys_script.js).
let advancedHotkeysBindingsSeen = null;

// Points out game page hotkeys that AWBW Advanced Hotkeys also uses: those keys are left to it.
function updateAdvancedHotkeysWarnings() {
    for (let mapping of kKeyboardOptionsMapping) {
        if (!mapping.gamePage) continue;
        let warning = document.getElementById(mapping.id + "-advanced-hotkeys");
        if (!warning) continue;
        let lines = [];
        for (let i = 1; i <= kMaxKeyboardBindings; i++) {
            let keyCode = document.getElementById(mapping.id + "-" + i)?.getAttribute("rawkeycode");
            let action = keyCode && advancedHotkeysActionForKeyCode(advancedHotkeysBindingsSeen, parseInt(keyCode));
            if (action) {
                let key = keyCodeToName(parseInt(keyCode));
                lines.push(`AWBW Advanced Hotkeys uses ${key} for "${advancedHotkeysActionName(action)}" on the game ` +
                           `page, so ${key} does nothing there. Pick another key, or change that one in AWBW ` +
                           `Advanced Hotkeys.`);
            }
        }
        warning.textContent = lines.join(" ");
    }
}

chrome.storage.local.get([kAdvancedHotkeysStorageKey], (result) => {
    advancedHotkeysBindingsSeen = result[kAdvancedHotkeysStorageKey] || null;
    updateAdvancedHotkeysWarnings();
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[kAdvancedHotkeysStorageKey]) {
        advancedHotkeysBindingsSeen = changes[kAdvancedHotkeysStorageKey].newValue || null;
        updateAdvancedHotkeysWarnings();
    }
});

function initializeKeyboardOptions() {
    let keybindListener = new KeybindListener("keybinding-modal");
    for (let optionMapping of kKeyboardOptionsMapping) {
        let containerId = optionMapping.id + "-container";
        let container = document.getElementById(containerId);
        if (!container) {
            console.error("Missing container for:", optionMapping.id);
            continue;
        }
        container.innerHTML = DOMPurify.sanitize(templateKeyboardOption(optionMapping));

        let maxBindings = optionMapping.image ? 1 : kMaxKeyboardBindings;
        for (let i = 1; i <= maxBindings; i++) {
            let inputId = optionMapping.id + "-" + i;
            keybindListener.addKeybindOption(new KeybindOption(inputId, optionMapping.label, optionMapping.facility, keybindListener));
        }
    }
}

function setOptionsOnPage(options) {
    console.log("Setting options:", options);
    for (let optionMapping of kCheckOptionsMapping) {
        if (options.hasOwnProperty(optionMapping.name)) {
            let inputElement = document.getElementById(optionMapping.id);
            if (inputElement) {
                inputElement.checked = options[optionMapping.name];
            }
        }
    }

    for (let optionMapping of kRangeOptionsMapping) {
        if (options.hasOwnProperty(optionMapping.name)) {
            let inputElement = document.getElementById(optionMapping.id);
            if (inputElement) {
                inputElement.value = options[optionMapping.name];
            }
            let previewElement = document.getElementById(optionMapping.previewId);
            if (previewElement) {
                previewElement.value = options[optionMapping.name];
            }
        }
    }

    for (let optionMapping of kKeyboardOptionsMapping) {
        if (options.hasOwnProperty(optionMapping.name)) {
            let bindings = options[optionMapping.name];
            for (let i = 0; i < kMaxKeyboardBindings; i++) {
                let inputElement = document.getElementById(optionMapping.id + "-" + (i + 1));
                if (inputElement) {
                    if (i < bindings.length) {
                        inputElement.value = keyCodeToName(bindings[i]);
                        inputElement.setAttribute("rawkeycode", bindings[i]);
                    } else {
                        inputElement.value = "";
                        inputElement.removeAttribute("rawkeycode");
                    }
                }
            }
        }
    }
}

function parseOptionsFromPage() {
    let parsedOptions = {};

    for (let optionMapping of kCheckOptionsMapping) {
        let inputElement = document.getElementById(optionMapping.id);
        if (inputElement) {
            parsedOptions[optionMapping.name] = inputElement.checked;
        }
    }

    for (let optionMapping of kRangeOptionsMapping) {
        let inputElement = document.getElementById(optionMapping.id);
        if (inputElement) {
            parsedOptions[optionMapping.name] = parseFloat(inputElement.value);
        }
    }

    for (let optionMapping of kKeyboardOptionsMapping) {
        let bindings = [];
        for (let i = 0; i < kMaxKeyboardBindings; i++) {
            let inputElement = document.getElementById(optionMapping.id + "-" + (i + 1));
            if (inputElement) {
                if (inputElement.hasAttribute("rawkeycode")) {
                    bindings.push(parseInt(inputElement.getAttribute("rawkeycode")));
                }
            }
        }
        parsedOptions[optionMapping.name] = bindings;
    }

    return parsedOptions;
}

initializeCheckboxOptions();
initializeRangeOptions();
initializeKeyboardOptions();

chrome.storage.sync.get(kOptionDefaults, (result) => {
    setOptionsOnPage(result);
    updateAdvancedHotkeysWarnings();

    let isFirefox = chrome.runtime.getManifest().browser_specific_settings?.hasOwnProperty("gecko");
    console.log("is firefox:", isFirefox);
    if (isFirefox) {
        let chromeOnlyOptions = document.getElementsByClassName("js-requires-chrome");
        for (let childOption of chromeOnlyOptions) {
            childOption.disabled = true;
        }
    }

    // TODO: generalize this
    let moveplannerPlusChildOptions = document.getElementsByClassName("js-requires-moveplanner-plus");
    for (let childOption of moveplannerPlusChildOptions) {
        childOption.disabled = !result.options_enable_moveplanner_plus;
    }

    let speedyEventPanelChildOptions = document.getElementsByClassName("js-requires-speedy-event-panel");
    for (let childOption of speedyEventPanelChildOptions) {
        childOption.disabled = !result.options_enable_speedy_event_panel;
    }

    let inputs = document.querySelectorAll("input");
    for (let input of inputs) {
        input.addEventListener("change", (event) => {
            let parsedOptions = parseOptionsFromPage();
            console.log("Updating options:", parsedOptions);
            chrome.storage.sync.set(parsedOptions);
            updateAdvancedHotkeysWarnings();

            let moveplannerPlusDisabled = !parsedOptions.options_enable_moveplanner_plus;
            for (let childOption of moveplannerPlusChildOptions) {
                childOption.disabled = moveplannerPlusDisabled;
            }

            let speedyEventPanelDisabled = !parsedOptions.options_enable_speedy_event_panel;
            for (let childOption of speedyEventPanelChildOptions) {
                childOption.disabled = speedyEventPanelDisabled;
            }
        });
    }

    let resetDefaultsBtn = document.getElementById("reset-defaults-btn");
    resetDefaultsBtn.addEventListener("click", (event) => {
        chrome.storage.sync.set(kOptionDefaults, () => {
            setOptionsOnPage(kOptionDefaults);
            inputs[0].dispatchEvent(new Event("change"));
        });
    });

    let disableQuickActionsBtn = document.getElementById("disable-quick-actions-btn");
    disableQuickActionsBtn.addEventListener("click", (event) => {
        // List of all quick action hotkey options from Quick Move through End Turn
        const quickActionOptions = [
            "options_bindings_quick_move_hotkey",
            "options_bindings_quick_convert_army_hotkey",
            "options_bindings_quick_convert_neutral_hotkey",
            "options_bindings_quick_remove_unit_hotkey",
            "options_bindings_quick_capture_hotkey",
            "options_bindings_quick_wait_hotkey",
            "options_bindings_quick_unwait_hotkey",
            "options_bindings_quick_build_infantry_hotkey",
            "options_bindings_quick_build_mech_hotkey",
            "options_bindings_quick_build_recon_hotkey",
            "options_bindings_quick_build_tank_hotkey",
            "options_bindings_quick_build_md_tank_hotkey",
            "options_bindings_quick_build_neotank_hotkey",
            "options_bindings_quick_build_megatank_hotkey",
            "options_bindings_quick_build_apc_hotkey",
            "options_bindings_quick_build_artillery_hotkey",
            "options_bindings_quick_build_rocket_hotkey",
            "options_bindings_quick_build_anti_air_hotkey",
            "options_bindings_quick_build_missile_hotkey",
            "options_bindings_quick_build_piperunner_hotkey",
            "options_bindings_quick_build_t_copter_hotkey",
            "options_bindings_quick_build_b_copter_hotkey",
            "options_bindings_quick_build_fighter_hotkey",
            "options_bindings_quick_build_bomber_hotkey",
            "options_bindings_quick_build_stealth_hotkey",
            "options_bindings_quick_build_black_boat_hotkey",
            "options_bindings_quick_build_lander_hotkey",
            "options_bindings_quick_build_cruiser_hotkey",
            "options_bindings_quick_build_sub_hotkey",
            "options_bindings_quick_build_battleship_hotkey",
            "options_bindings_quick_build_carrier_hotkey",
            "options_bindings_quick_build_black_bomb_hotkey",
            "options_bindings_end_turn_hotkey"
        ];

        // Set all quick action hotkeys to empty arrays
        let updatedOptions = {};
        for (let optionName of quickActionOptions) {
            updatedOptions[optionName] = [];
        }

        chrome.storage.sync.set(updatedOptions, () => {
            setOptionsOnPage(updatedOptions);
            inputs[0].dispatchEvent(new Event("change"));
        });
    });

    let form = document.getElementById("optionsForm");
    form.classList.remove("d-none");
});
