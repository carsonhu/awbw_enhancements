OptionsReader.instance().onOptionsReady((options) => {
    // Try multiple selectors to find the calculator button
    let calculatorButton = document.querySelector(".calculator-toggle") ||
        document.querySelector("a[title='Damage Calculator']") ||
        document.querySelector("img[src*='calculator']");

    if (calculatorButton) {
        // If we found an image, we might need to click its parent link/button
        if (calculatorButton.tagName === "IMG" && calculatorButton.parentElement.tagName === "A") {
            calculatorButton = calculatorButton.parentElement;
        }

        let toggleKeyCodes = options.options_bindings_toggle_calculator;
        if (!toggleKeyCodes || toggleKeyCodes.length === 0) {
            return;
        }

        document.addEventListener("keydown", (event) => {
            // Ignore if typing in an input or textarea
            if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
                return;
            }

            if (toggleKeyCodes.includes(event.keyCode)) {
                event.preventDefault();
                event.stopPropagation();
                calculatorButton.click();
            }
        }, true); // Use capture phase to handle event before the page script
    } else {
        console.log("AWBW Enhancements: Could not find calculator button.");
    }
});

