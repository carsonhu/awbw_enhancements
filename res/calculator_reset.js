// Runs in the move planner's own context when it's shown in the game page's planner panel (injected by
// content_scripts/embedded_planner_script.js). On an "awbwe-calculator-reset" event, closes AWBW's damage calculator
// and puts its matchup back to how it starts, leaving it where it is. (The multi-hit calculator resets itself on the
// same event.)
//
// AWBW's calculator asks the server for the damage whenever its matchup changes. The panel's planner page starts on
// the starting matchup, so the damage for it is kept from then and put back with it, without asking again.
(function () {
    let defaultDamage = null;

    function freshData(calc) {
        return calc.$options.data.call(calc);
    }

    function isDefaultMatchup(calc, fresh) {
        return JSON.stringify([calc.attacker, calc.defender]) === JSON.stringify([fresh.attacker, fresh.defender]);
    }

    function watchDefaultDamage(calc) {
        calc.$watch("damage", (damage) => {
            if (damage?.maxInfo && isDefaultMatchup(calc, freshData(calc))) defaultDamage = damage;
        }, { immediate: true });
    }

    function reset(calc) {
        let fresh = freshData(calc);
        if (!isDefaultMatchup(calc, fresh)) {
            // The attacker's and defender's watchers would each ask for the damage, so they're stopped from asking,
            // and it's asked for once, if it isn't known already.
            let updateDamage = calc.updateDamage;
            calc.updateDamage = () => {};
            if (defaultDamage) calc.damage = defaultDamage;
            calc.attacker = fresh.attacker;
            calc.defender = fresh.defender;
            // Queued after the watchers, which run on Vue's next tick.
            calc.$nextTick(() => {
                calc.updateDamage = updateDamage;
                if (!defaultDamage) calc.updateDamage();
            });
        }
        calc.menuToggles = fresh.menuToggles;
        calc.storeCalcInfo("toggled", false);
        calc.toggled = false;
    }

    let watching = false;
    function calculator() {
        let calc = window.calculator;
        if (!calc || !calc.$options) return null;
        if (!watching) {
            watching = true;
            watchDefaultDamage(calc);
        }
        return calc;
    }

    // AWBW's calculator is set up by the time this runs, unless the page is still loading.
    if (!calculator()) window.addEventListener("load", calculator, { once: true });

    document.addEventListener("awbwe-calculator-reset", () => {
        let calc = calculator();
        if (!calc) return;
        try {
            reset(calc);
        } catch (error) {
            console.log("[AWBW Enhancements] Couldn't reset the damage calculator:", error);
        }
    });
})();
