// Multi-hit damage engine for the AWBW multi-hit KO calculator.
//
// Runs in the page context (exposed as `window.AwbwMultihitEngine`) and in Node for testing
// (exported via `module.exports`). It has no dependencies on the page.
//
// HP is tracked internally on a 0-100 scale (10 internal HP == 1 displayed HP), and the
// defender's HP is carried between attacks as a probability distribution so that luck in
// early attacks correctly affects the odds of follow-up attacks.
(function(root) {

// Official AWBW base damage chart (from damage.php), keyed by attacker then defender.
const kBaseDamage = {
    "infantry": { "infantry": 55, "mech": 45, "recon": 12, "apc": 14, "artillery": 15, "tank": 5, "anti-air": 5, "missile": 25, "rocket": 25, "md.tank": 1, "piperunner": 5, "neotank": 1, "megatank": 1, "t-copter": 30, "b-copter": 7 },
    "mech": { "infantry": 65, "mech": 55, "recon": 85, "apc": 75, "artillery": 70, "tank": 55, "anti-air": 65, "missile": 85, "rocket": 85, "md.tank": 15, "piperunner": 55, "neotank": 15, "megatank": 5, "t-copter": 35, "b-copter": 9 },
    "recon": { "infantry": 70, "mech": 65, "recon": 35, "apc": 45, "artillery": 45, "tank": 6, "anti-air": 4, "missile": 28, "rocket": 55, "md.tank": 1, "piperunner": 6, "neotank": 1, "megatank": 1, "t-copter": 35, "b-copter": 10 },
    "artillery": { "infantry": 90, "mech": 85, "recon": 80, "apc": 70, "artillery": 75, "tank": 70, "anti-air": 75, "missile": 80, "rocket": 80, "md.tank": 45, "piperunner": 70, "neotank": 40, "megatank": 15, "blackboat": 55, "lander": 55, "cruiser": 65, "sub": 60, "battleship": 40, "carrier": 45 },
    "tank": { "infantry": 75, "mech": 70, "recon": 85, "apc": 75, "artillery": 70, "tank": 55, "anti-air": 65, "missile": 85, "rocket": 85, "md.tank": 15, "piperunner": 55, "neotank": 15, "megatank": 10, "t-copter": 40, "b-copter": 10, "blackboat": 10, "lander": 10, "cruiser": 5, "sub": 1, "battleship": 1, "carrier": 1 },
    "anti-air": { "infantry": 105, "mech": 105, "recon": 60, "apc": 50, "artillery": 50, "tank": 25, "anti-air": 45, "missile": 55, "rocket": 55, "md.tank": 10, "piperunner": 25, "neotank": 5, "megatank": 1, "t-copter": 120, "b-copter": 120, "fighter": 65, "bomber": 75, "stealth": 75, "blackbomb": 120 },
    "missile": { "t-copter": 120, "b-copter": 120, "fighter": 100, "bomber": 100, "stealth": 100, "blackbomb": 120 },
    "rocket": { "infantry": 95, "mech": 90, "recon": 90, "apc": 80, "artillery": 80, "tank": 80, "anti-air": 85, "missile": 90, "rocket": 85, "md.tank": 55, "piperunner": 80, "neotank": 50, "megatank": 25, "blackboat": 60, "lander": 60, "cruiser": 85, "sub": 85, "battleship": 55, "carrier": 60 },
    "md.tank": { "infantry": 105, "mech": 95, "recon": 105, "apc": 105, "artillery": 105, "tank": 85, "anti-air": 105, "missile": 105, "rocket": 105, "md.tank": 55, "piperunner": 85, "neotank": 45, "megatank": 25, "t-copter": 45, "b-copter": 12, "blackboat": 35, "lander": 35, "cruiser": 45, "sub": 10, "battleship": 10, "carrier": 10 },
    "piperunner": { "infantry": 95, "mech": 90, "recon": 90, "apc": 80, "artillery": 80, "tank": 80, "anti-air": 85, "missile": 90, "rocket": 85, "md.tank": 55, "piperunner": 80, "neotank": 50, "megatank": 25, "t-copter": 105, "b-copter": 105, "fighter": 65, "bomber": 75, "stealth": 75, "blackbomb": 120, "blackboat": 60, "lander": 60, "cruiser": 60, "sub": 85, "battleship": 55, "carrier": 60 },
    "neotank": { "infantry": 125, "mech": 115, "recon": 125, "apc": 125, "artillery": 115, "tank": 105, "anti-air": 115, "missile": 125, "rocket": 125, "md.tank": 75, "piperunner": 105, "neotank": 55, "megatank": 35, "t-copter": 55, "b-copter": 22, "blackboat": 40, "lander": 40, "cruiser": 50, "sub": 15, "battleship": 15, "carrier": 15 },
    "megatank": { "infantry": 135, "mech": 125, "recon": 195, "apc": 195, "artillery": 195, "tank": 180, "anti-air": 195, "missile": 195, "rocket": 195, "md.tank": 125, "piperunner": 180, "neotank": 115, "megatank": 65, "t-copter": 55, "b-copter": 22, "blackboat": 105, "lander": 75, "cruiser": 65, "sub": 45, "battleship": 45, "carrier": 45 },
    "b-copter": { "infantry": 75, "mech": 75, "recon": 55, "apc": 60, "artillery": 65, "tank": 55, "anti-air": 25, "missile": 65, "rocket": 65, "md.tank": 25, "piperunner": 55, "neotank": 20, "megatank": 10, "t-copter": 95, "b-copter": 65, "blackboat": 25, "lander": 25, "cruiser": 55, "sub": 25, "battleship": 25, "carrier": 25 },
    "fighter": { "t-copter": 100, "b-copter": 100, "fighter": 55, "bomber": 100, "stealth": 85, "blackbomb": 120 },
    "bomber": { "infantry": 110, "mech": 110, "recon": 105, "apc": 105, "artillery": 105, "tank": 105, "anti-air": 95, "missile": 105, "rocket": 105, "md.tank": 95, "piperunner": 105, "neotank": 90, "megatank": 35, "blackboat": 95, "lander": 95, "cruiser": 85, "sub": 95, "battleship": 75, "carrier": 75 },
    "stealth": { "infantry": 90, "mech": 90, "recon": 85, "apc": 85, "artillery": 75, "tank": 75, "anti-air": 50, "missile": 85, "rocket": 85, "md.tank": 70, "piperunner": 80, "neotank": 60, "megatank": 15, "t-copter": 95, "b-copter": 85, "fighter": 45, "bomber": 70, "stealth": 55, "blackbomb": 120, "blackboat": 65, "lander": 65, "cruiser": 35, "sub": 55, "battleship": 45, "carrier": 45 },
    "cruiser": { "t-copter": 115, "b-copter": 115, "fighter": 55, "bomber": 65, "stealth": 100, "blackbomb": 120, "blackboat": 25, "sub": 90, "carrier": 5 },
    "sub": { "blackboat": 95, "lander": 95, "cruiser": 25, "sub": 55, "battleship": 55, "carrier": 75 },
    "battleship": { "infantry": 95, "mech": 90, "recon": 90, "apc": 80, "artillery": 80, "tank": 80, "anti-air": 85, "missile": 90, "rocket": 85, "md.tank": 55, "piperunner": 80, "neotank": 50, "megatank": 25, "blackboat": 95, "lander": 95, "cruiser": 95, "sub": 95, "battleship": 50, "carrier": 60 },
    "carrier": { "t-copter": 115, "b-copter": 115, "fighter": 100, "bomber": 100, "stealth": 100, "blackbomb": 120 },
};

// Secondary weapon (machine gun / anti-air gun) damage, used when the primary weapon is out of ammo.
const kSecondaryDamage = {
    "mech": { "infantry": 65, "mech": 55, "recon": 18, "apc": 20, "artillery": 32, "tank": 6, "anti-air": 6, "missile": 35, "rocket": 35, "md.tank": 1, "piperunner": 6, "neotank": 1, "megatank": 1, "t-copter": 35, "b-copter": 9 },
    "tank": { "infantry": 75, "mech": 70, "recon": 40, "apc": 45, "artillery": 45, "tank": 6, "anti-air": 5, "missile": 30, "rocket": 55, "md.tank": 1, "piperunner": 6, "neotank": 1, "megatank": 1, "t-copter": 40, "b-copter": 10 },
    "md.tank": { "infantry": 105, "mech": 95, "recon": 45, "apc": 45, "artillery": 45, "tank": 8, "anti-air": 7, "missile": 35, "rocket": 45, "md.tank": 1, "piperunner": 8, "neotank": 1, "megatank": 1, "t-copter": 45, "b-copter": 12 },
    "neotank": { "infantry": 125, "mech": 115, "recon": 65, "apc": 65, "artillery": 65, "tank": 10, "anti-air": 17, "missile": 55, "rocket": 75, "md.tank": 1, "piperunner": 10, "neotank": 1, "megatank": 1, "t-copter": 55, "b-copter": 22 },
    "megatank": { "infantry": 135, "mech": 125, "recon": 65, "apc": 65, "artillery": 65, "tank": 10, "anti-air": 17, "missile": 55, "rocket": 75, "md.tank": 1, "piperunner": 10, "neotank": 1, "megatank": 1, "t-copter": 55, "b-copter": 22 },
    "b-copter": { "infantry": 75, "mech": 75, "recon": 30, "apc": 20, "artillery": 25, "tank": 6, "anti-air": 6, "missile": 35, "rocket": 35, "md.tank": 1, "piperunner": 6, "neotank": 1, "megatank": 1, "t-copter": 95, "b-copter": 65 },
    "cruiser": { "t-copter": 115, "b-copter": 115, "fighter": 55, "bomber": 65, "stealth": 100, "blackbomb": 120 },
};

const kFootUnits = new Set(["infantry", "mech"]);
const kVehicleUnits = new Set(["recon", "apc", "artillery", "tank", "anti-air", "missile", "rocket", "md.tank",
                               "piperunner", "neotank", "megatank"]);
const kAirUnits = new Set(["t-copter", "b-copter", "fighter", "bomber", "stealth", "blackbomb"]);
const kCopterUnits = new Set(["t-copter", "b-copter"]);
const kSeaUnits = new Set(["blackboat", "lander", "cruiser", "sub", "battleship", "carrier"]);
const kIndirectUnits = new Set(["artillery", "rocket", "missile", "piperunner", "battleship", "carrier"]);

// Units in AWBW's build/calculator order, with display names.
const kUnitList = [
    ["infantry", "Infantry"], ["mech", "Mech"], ["recon", "Recon"], ["apc", "APC"], ["artillery", "Artillery"],
    ["tank", "Tank"], ["anti-air", "Anti-Air"], ["missile", "Missile"], ["rocket", "Rocket"],
    ["md.tank", "Md. Tank"], ["piperunner", "Piperunner"], ["neotank", "Neotank"], ["megatank", "Mega Tank"],
    ["t-copter", "T-Copter"], ["b-copter", "B-Copter"], ["fighter", "Fighter"], ["bomber", "Bomber"],
    ["stealth", "Stealth"], ["blackbomb", "Black Bomb"], ["blackboat", "Black Boat"], ["lander", "Lander"],
    ["cruiser", "Cruiser"], ["sub", "Sub"], ["battleship", "Battleship"], ["carrier", "Carrier"],
].map(([id, name]) => ({ id, name }));

function normalizeUnitName(name) {
    let key = String(name || "").toLowerCase().replace(/[\s_]/g, "");
    if (key === "md.tank" || key === "mdtank" || key === "mediumtank") return "md.tank";
    if (key === "missiles") return "missile";
    if (key === "rockets") return "rocket";
    if (key === "antiair") return "anti-air";
    if (key === "tcopter") return "t-copter";
    if (key === "bcopter") return "b-copter";
    return key;
}

function normalizeCoName(name) {
    return String(name || "").toLowerCase().replace(/[\s_]/g, "");
}

// Terrain categories that matter for CO abilities.
function classifyTerrain(terrainName) {
    let name = String(terrainName || "").toLowerCase();
    return {
        plain: /plain/.test(name),
        road: /road/.test(name),
        bridge: /bridge/.test(name),
        urban: /city|base|airport|port|hq|comtower|lab/.test(name),
    };
}

function powerLevel(power) {
    if (power === "S") return 2;
    if (power === "Y") return 1;
    return 0;
}

// Returns {good, bad}: the attacker's luck is a uniform roll in [0, good] minus a uniform roll in [0, bad].
function luckRange(coName, power) {
    let co = normalizeCoName(coName);
    let p = powerLevel(power);
    switch (co) {
    case "nell": return { good: [19, 59, 99][p], bad: 0 };
    case "rachel": return { good: p === 1 ? 39 : 9, bad: 0 };
    case "flak": return { good: [24, 49, 89][p], bad: [9, 19, 39][p] };
    case "jugger": return { good: [29, 54, 94][p], bad: [14, 24, 44][p] };
    case "sonja": return { good: 9, bad: 9 };
    default: return { good: 9, bad: 0 };
    }
}

// Returns an array of [luckValue, probability].
function luckDistribution(coName, power) {
    let { good, bad } = luckRange(coName, power);
    let counts = new Map();
    for (let g = 0; g <= good; g++) {
        for (let b = 0; b <= bad; b++) {
            counts.set(g - b, (counts.get(g - b) || 0) + 1);
        }
    }
    let total = (good + 1) * (bad + 1);
    return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]).map(([luck, n]) => [luck, n / total]);
}

// Attack bonus (in percent, on top of the base 100) for `side` attacking with `unit`.
// `side` = {co, power, towers, funds, cities, terrain: {name, defense}}
function attackBonus(side, unit) {
    let co = normalizeCoName(side.co);
    let p = powerLevel(side.power);
    let terrain = classifyTerrain(side.terrain?.name);
    let stars = Number(side.terrain?.defense) || 0;
    let towers = Number(side.towers) || 0;
    let isFoot = kFootUnits.has(unit);
    let isVehicle = kVehicleUnits.has(unit);
    let isAir = kAirUnits.has(unit);
    let isSea = kSeaUnits.has(unit);
    let isIndirect = kIndirectUnits.has(unit);
    let isDirect = !isIndirect;

    let bonus = (p > 0 ? 10 : 0) + 10 * towers;
    switch (co) {
    case "andy": if (p === 2) bonus += 10; break;
    case "colin":
        bonus -= 10;
        if (p === 2) bonus += 3 * (Number(side.funds) || 0) / 1000;
        break;
    case "drake": if (isAir) bonus -= 30; break;
    case "eagle":
        if (isAir) bonus += p > 0 ? 20 : 15;
        if (isSea) bonus -= 30;
        break;
    case "grimm": bonus += [30, 50, 80][p]; break;
    case "grit":
        if (isIndirect) bonus += p > 0 ? 40 : 20;
        else if (!isFoot) bonus -= 20;
        break;
    case "hawke": bonus += 10; break;
    case "jake": if (terrain.plain) bonus += [10, 20, 40][p]; break;
    case "javier": bonus += 10 * towers * p; break;  // com tower bonus doubled/tripled by powers
    case "jess":
        if (isVehicle) bonus += [10, 20, 40][p];
        else bonus -= 10;
        break;
    case "kanbei": bonus += p > 0 ? 40 : 30; break;
    case "kindle":
        if (terrain.urban) bonus += [40, 80, 130][p];
        if (p === 2) bonus += 3 * (Number(side.cities) || 0);
        break;
    case "koal": if (terrain.road) bonus += [10, 20, 30][p]; break;
    case "lash": if (!isAir) bonus += 10 * stars * (p === 2 ? 2 : 1); break;
    case "max":
        if (isIndirect) bonus -= 10;
        else if (!isFoot) bonus += [20, 30, 50][p];
        break;
    case "sami":
        if (isFoot) bonus += [30, 50, 70][p];
        else if (isDirect) bonus -= 10;
        break;
    case "sensei":
        if (kCopterUnits.has(unit)) bonus += p > 0 ? 65 : 50;
        else if (isFoot) bonus += 40;
        else if (!isAir) bonus -= 10;
        break;
    case "sturm": bonus -= 20; break;
    case "vonbolt": bonus += 10; break;
    }
    return bonus;
}

// Defense bonus (in percent, on top of the base 100) for `side` defending with `unit`.
function defenseBonus(side, unit, attackerUnit) {
    let co = normalizeCoName(side.co);
    let p = powerLevel(side.power);
    let towers = Number(side.towers) || 0;
    let isAir = kAirUnits.has(unit);
    let isSea = kSeaUnits.has(unit);

    let bonus = p > 0 ? 10 : 0;
    switch (co) {
    case "drake": if (isSea) bonus += 10; break;
    case "eagle": if (isAir) bonus += p > 0 ? 20 : 10; break;
    case "grimm": bonus -= 20; break;
    case "javier":
        bonus += 10 * towers * (p + 1);
        if (kIndirectUnits.has(attackerUnit)) bonus += [20, 40, 80][p];
        break;
    case "kanbei": bonus += p === 2 ? 50 : 30; break;
    case "sturm": bonus += 20; break;
    case "vonbolt": bonus += 10; break;
    }
    return bonus;
}

function defenderTerrainStars(side, unit) {
    if (kAirUnits.has(unit)) return 0;
    let stars = Number(side.terrain?.defense) || 0;
    if (normalizeCoName(side.co) === "lash" && powerLevel(side.power) === 2) stars *= 2;
    return stars;
}

function counterMultiplier(side) {
    let co = normalizeCoName(side.co);
    if (co === "sonja") return 1.5;
    if (co === "kanbei" && powerLevel(side.power) === 2) return 1.5;
    return 1;
}

// Units whose weapons never run out of ammo.
const kUnitsWithoutAmmo = new Set(["infantry", "recon", "apc", "lander", "t-copter", "blackboat", "blackbomb"]);

// The base damage `attacker` can deal to `defender`, or null if it can't attack it.
function baseDamage(attackerUnit, defenderUnit, hasAmmo) {
    let primary = kBaseDamage[attackerUnit]?.[defenderUnit];
    let secondary = kSecondaryDamage[attackerUnit]?.[defenderUnit];
    if (hasAmmo === false && !kUnitsWithoutAmmo.has(attackerUnit)) {
        return secondary ?? null;
    }
    return primary ?? secondary ?? null;
}

function canCounter(defenderUnit, attackerUnit, defenderHasAmmo) {
    if (kIndirectUnits.has(attackerUnit) || kIndirectUnits.has(defenderUnit)) return false;
    return baseDamage(defenderUnit, attackerUnit, defenderHasAmmo) !== null;
}

// AWBW rounds the final damage down, unless the fractional part is at least .95.
function roundDamage(raw) {
    raw = Math.round(raw * 1e6) / 1e6;
    return Math.max(0, Math.floor(raw + 0.05));
}

// Precomputes everything about a single attack that doesn't depend on HP or luck.
function makeStrike(atkSide, atkUnit, atkHasAmmo, defSide, defUnit, multiplier) {
    let base = baseDamage(atkUnit, defUnit, atkHasAmmo);
    if (base === null) return null;
    return {
        base,
        attack: 100 + attackBonus(atkSide, atkUnit),
        defense: 100 + defenseBonus(defSide, defUnit, atkUnit),
        stars: defenderTerrainStars(defSide, defUnit),
        luck: luckDistribution(atkSide.co, atkSide.power),
        multiplier: multiplier || 1,
    };
}

// Damage (in internal HP / percent) for a strike given displayed HPs and a luck roll.
function strikeDamage(strike, atkDisplayHp, defDisplayHp, luck) {
    // Counterattack multipliers (Sonja, Kanbei's SCOP) scale the attack but not luck.
    let raw = (strike.base * strike.attack / 100 * strike.multiplier + luck) * (atkDisplayHp / 10)
        * (200 - (strike.defense + strike.stars * defDisplayHp)) / 100;
    return roundDamage(raw);
}

function displayHp(internalHp) {
    return Math.ceil(internalHp / 10);
}

// Distribution of damage values for a strike: Map<damage, probability>.
function strikeDamageDistribution(strike, atkDisplayHp, defDisplayHp) {
    let result = new Map();
    for (let [luck, prob] of strike.luck) {
        let dmg = strikeDamage(strike, atkDisplayHp, defDisplayHp, luck);
        result.set(dmg, (result.get(dmg) || 0) + prob);
    }
    return result;
}

// Simple one-shot calculation, matching AWBW's built-in calculator (min/max damage and counter).
function calculateSingle(attacker, defender) {
    let atkUnit = normalizeUnitName(attacker.unit);
    let defUnit = normalizeUnitName(defender.unit);
    let strike = makeStrike(attacker, atkUnit, attacker.hasAmmo, defender, defUnit);
    if (!strike) return null;
    let atkHp = Number(attacker.hp), defHp = Number(defender.hp);
    let luckValues = strike.luck.map(([luck]) => luck);
    let minLuck = Math.min(...luckValues), maxLuck = Math.max(...luckValues);
    // Like AWBW's calculator, damage isn't capped by the target's remaining HP.
    let result = {
        min: strikeDamage(strike, atkHp, defHp, minLuck),
        max: strikeDamage(strike, atkHp, defHp, maxLuck),
        counter: null,
    };
    if (canCounter(defUnit, atkUnit, defender.hasAmmo)) {
        let counter = makeStrike(defender, defUnit, defender.hasAmmo, attacker, atkUnit, counterMultiplier(defender));
        let cLuck = counter.luck.map(([luck]) => luck);
        let cMin = Math.min(...cLuck), cMax = Math.max(...cLuck);
        let counterFor = (dmg) => {
            let remaining = displayHp(Math.max(defHp * 10 - dmg, 0));
            if (remaining <= 0) return null;
            return {
                min: strikeDamage(counter, remaining, atkHp, cMin),
                max: strikeDamage(counter, remaining, atkHp, cMax),
            };
        };
        result.counter = { afterMinDamage: counterFor(result.min), afterMaxDamage: counterFor(result.max) };
    }
    return result;
}

function emptyDistribution() {
    return new Float64Array(101);
}

function summarizeDistribution(dist) {
    let total = 0, mean = 0;
    let byDisplayHp = new Array(11).fill(0);
    let min = null, max = null;
    for (let hp = 0; hp <= 100; hp++) {
        let p = dist[hp];
        if (p <= 0) continue;
        total += p;
        mean += p * hp;
        byDisplayHp[displayHp(hp)] += p;
        if (min === null) min = hp;
        max = hp;
    }
    return {
        koChance: dist[0],
        meanHp: total > 0 ? mean / total : 0,
        minHp: min ?? 0,
        maxHp: max ?? 0,
        byDisplayHp,
    };
}

// Accumulates weighted samples into {min, max, mean, total}.
function makeStat() {
    return { min: null, max: null, sum: 0, total: 0 };
}
function addStat(stat, value, weight) {
    if (weight <= 0) return;
    stat.min = stat.min === null ? value : Math.min(stat.min, value);
    stat.max = stat.max === null ? value : Math.max(stat.max, value);
    stat.sum += value * weight;
    stat.total += weight;
}
function finishStat(stat) {
    return {
        min: stat.min,
        max: stat.max,
        mean: stat.total > 0 ? stat.sum / stat.total : null,
        probability: stat.total,
    };
}

// Runs a sequence of attacks against a single defender.
//
// defender = {co, power, towers, unit, hp (internal 1-100), hpMax (optional), terrain: {name, defense}, hasAmmo}
//   When hpMax is given, the defender's HP is unknown but somewhere in [hp, hpMax], each value equally likely.
// attacks = [{co, power, towers, funds, cities, unit, hp (displayed 1-10), terrain, hasAmmo,
//             hpChangeBefore (displayed HP, e.g. -3 for a Kindle COP)}]
//
// Returns one result per attack with the defender's HP distribution after it, the damage dealt,
// and the counterattack the attacker takes.
function calculateMultihit(defender, attacks) {
    let defUnit = normalizeUnitName(defender.unit);
    let clampHp = (hp) => Math.max(1, Math.min(100, Math.round(Number(hp) || 100)));
    let minHp = clampHp(defender.hp);
    let maxHp = defender.hpMax !== undefined && defender.hpMax !== null ? clampHp(defender.hpMax) : minHp;
    if (maxHp < minHp) [minHp, maxHp] = [maxHp, minHp];
    let dist = emptyDistribution();
    for (let hp = minHp; hp <= maxHp; hp++) {
        dist[hp] = 1 / (maxHp - minHp + 1);
    }

    let counterFirst = normalizeCoName(defender.co) === "sonja" && powerLevel(defender.power) === 2;
    let results = [];
    for (let attack of attacks) {
        let atkUnit = normalizeUnitName(attack.unit);
        let atkHp = Math.max(1, Math.min(10, Math.round(Number(attack.hp) || 10)));

        let change = Math.round((Number(attack.hpChangeBefore) || 0) * 10);
        if (change !== 0) {
            let changed = emptyDistribution();
            for (let hp = 0; hp <= 100; hp++) {
                if (dist[hp] <= 0) continue;
                // Power damage can't destroy units, and dead units stay dead.
                let next = hp === 0 ? 0 : Math.max(1, Math.min(100, hp + change));
                changed[next] += dist[hp];
            }
            dist = changed;
        }
        let before = summarizeDistribution(dist);

        let strike = makeStrike(attack, atkUnit, attack.hasAmmo, defender, defUnit);
        let counter = canCounter(defUnit, atkUnit, defender.hasAmmo)
            ? makeStrike(defender, defUnit, defender.hasAmmo, attack, atkUnit, counterMultiplier(defender))
            : null;

        let next = emptyDistribution();
        let damageStat = makeStat();
        let counterStat = makeStat();
        let attackerHpStat = makeStat();
        for (let hp = 0; hp <= 100; hp++) {
            let p = dist[hp];
            if (p <= 0) continue;
            if (hp === 0 || !strike) {
                next[hp] += p;
                addStat(attackerHpStat, atkHp * 10, p);
                continue;
            }

            // Sonja's Counter Break makes the defender strike first.
            let attackerHps = new Map([[atkHp * 10, 1]]);
            if (counter && counterFirst) {
                attackerHps = new Map();
                for (let [dmg, q] of strikeDamageDistribution(counter, displayHp(hp), atkHp)) {
                    let dealt = Math.min(dmg, atkHp * 10);
                    addStat(counterStat, dealt, p * q);
                    let remaining = atkHp * 10 - dealt;
                    attackerHps.set(remaining, (attackerHps.get(remaining) || 0) + q);
                }
            }

            for (let [atkInternal, q] of attackerHps) {
                if (atkInternal <= 0) {
                    next[hp] += p * q;
                    addStat(attackerHpStat, 0, p * q);
                    continue;
                }
                for (let [dmg, r] of strikeDamageDistribution(strike, displayHp(atkInternal), displayHp(hp))) {
                    let w = p * q * r;
                    let dealt = Math.min(dmg, hp);
                    let remaining = hp - dealt;
                    addStat(damageStat, dealt, w);
                    next[remaining] += w;

                    if (counter && !counterFirst && remaining > 0) {
                        for (let [cdmg, s] of strikeDamageDistribution(counter, displayHp(remaining), atkHp)) {
                            let cdealt = Math.min(cdmg, atkInternal);
                            addStat(counterStat, cdealt, w * s);
                            addStat(attackerHpStat, atkInternal - cdealt, w * s);
                        }
                    } else {
                        addStat(attackerHpStat, atkInternal, w);
                    }
                }
            }
        }
        dist = next;

        results.push({
            canAttack: !!strike,
            canCounter: !!counter,
            counterFirst: !!counter && counterFirst,
            before,
            after: summarizeDistribution(dist),
            damage: finishStat(damageStat),
            counter: finishStat(counterStat),
            attackerHp: finishStat(attackerHpStat),
            distribution: Array.from(dist),
        });
    }
    return results;
}

const AwbwMultihitEngine = {
    kBaseDamage, kSecondaryDamage, kUnitList,
    kFootUnits, kVehicleUnits, kAirUnits, kCopterUnits, kSeaUnits, kIndirectUnits, kUnitsWithoutAmmo,
    normalizeUnitName, normalizeCoName, classifyTerrain, luckRange, luckDistribution,
    attackBonus, defenseBonus, defenderTerrainStars, counterMultiplier, baseDamage, canCounter,
    roundDamage, displayHp, calculateSingle, calculateMultihit, summarizeDistribution,
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = AwbwMultihitEngine;
} else {
    root.AwbwMultihitEngine = AwbwMultihitEngine;
}
})(typeof window !== "undefined" ? window : globalThis);
