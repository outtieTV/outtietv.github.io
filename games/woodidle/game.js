// --- Game Data Models ---

// Define tree properties
const TREES = {
    regular: { name: 'Regular', requiredLevel: 1, baseTime: 3000, xp: 25 },
    oak:     { name: 'Oak',     requiredLevel: 15, baseTime: 4500, xp: 35 },
    willow:  { name: 'Willow',  requiredLevel: 30, baseTime: 6000, xp: 50 },
    yew:     { name: 'Yew',     requiredLevel: 60, baseTime: 8000, xp: 70 },
    redwood: { name: 'Redwood', requiredLevel: 90, baseTime: 12000, xp: 100 }
};

// Define axe properties (speedBoost is a percentage reduction in cut time)
const AXES = [
    { name: 'Stone Axe',    requiredLevel: 1, speedBoost: 0.00 }, // 0% faster
    { name: 'Bronze Axe',   requiredLevel: 10, speedBoost: 0.10 }, // 10% faster
    { name: 'Iron Axe',     requiredLevel: 25, speedBoost: 0.20 }, // 20% faster
    { name: 'Steel Axe',    requiredLevel: 45, speedBoost: 0.35 }, // 35% faster
    { name: 'Diamond Axe',  requiredLevel: 70, speedBoost: 0.50 }, // 50% faster
    { name: 'Ultimate Axe', requiredLevel: 95, speedBoost: 0.65 }  // 65% faster
];

// --- Leveling Formula ---
// Classic OSRS-style exponential formula: total_xp = floor(0.25 * (level * level_base + level_base * (2 ^ (level / 7))))
// The simplified formula below increases XP required as level increases.
function calculateXPForLevel(level) {
    if (level >= 99) return Infinity;
    // XP to reach the *start* of the next level (level + 1)
    // A simplified, rapidly increasing curve (e.g., Lvl 2: 83, Lvl 50: ~13k, Lvl 99: ~13M)
    const baseXP = 83;
    const exponent = 1.05;
    return Math.floor(baseXP * (level - 1) * Math.pow(level, exponent)) + baseXP;
}

// --- Game State ---
let game = {
    level: 1,
    currentXP: 0,
    logs: 0,
    currentTree: 'regular',
    currentAxe: AXES[0],
    isCutting: false,
    cutTimer: null,
    totalCutTime: 0,
};

// --- DOM Elements ---
const D = {
    levelDisplay: document.getElementById('level-display'),
    xpDisplay: document.getElementById('xp-display'),
    currentTreeName: document.getElementById('current-tree-name'),
    requiredLevel: document.getElementById('required-level'),
    axeDisplay: document.getElementById('axe-display'),
    logsDisplay: document.getElementById('logs-display'),
    cutButton: document.getElementById('cut-tree-button'),
    timerBar: document.getElementById('timer-bar'),
    timerText: document.getElementById('timer-text'),
    treeSelectButtons: document.getElementById('tree-select-buttons'),
    notifications: document.getElementById('notifications'),
    treeImagePlaceholder: document.getElementById('tree-image-placeholder')
};

// --- Game Logic Functions ---

/** Loads game state from localStorage or initializes default. */
function loadGame() {
    const savedGame = localStorage.getItem('lumberjackLegends');
    if (savedGame) {
        Object.assign(game, JSON.parse(savedGame));
        // Ensure the currentAxe is the correct object based on the loaded level
        game.currentAxe = determineBestAxe(game.level);
    }
    updateDisplay();
    createTreeButtons();
}

/** Saves game state to localStorage. */
function saveGame() {
    localStorage.setItem('lumberjackLegends', JSON.stringify({
        level: game.level,
        currentXP: game.currentXP,
        logs: game.logs,
        currentTree: game.currentTree,
    }));
}

/** Updates all visible game elements. */
function updateDisplay() {
    // Level & XP
    const xpNeeded = calculateXPForLevel(game.level);
    const xpRemaining = xpNeeded - game.currentXP;

    D.levelDisplay.textContent = `Level: ${game.level} 🌳`;
    if (game.level < 99) {
        D.xpDisplay.textContent = `XP to Lvl ${game.level + 1}: ${xpRemaining.toLocaleString()}`;
    } else {
        D.xpDisplay.textContent = 'MAX LEVEL! (99)';
    }

    // Tree Info
    const treeData = TREES[game.currentTree];
    D.currentTreeName.textContent = treeData.name;
    D.requiredLevel.textContent = treeData.requiredLevel;
    D.treeImagePlaceholder.textContent = `[${treeData.name} Tree]`;

    // Axe & Logs
    const boostPercentage = (game.currentAxe.speedBoost * 100).toFixed(0);
    D.axeDisplay.textContent = `Axe: ${game.currentAxe.name} (${boostPercentage}% speed boost)`;
    D.logsDisplay.textContent = `Logs: ${game.logs.toLocaleString()}`;

    // Update button states
    const canCut = game.level >= treeData.requiredLevel;
    D.cutButton.disabled = !canCut || game.isCutting;
    D.cutButton.textContent = canCut ? 'Chop Tree!' : `Need Lvl ${treeData.requiredLevel}`;

    // Update tree buttons
    document.querySelectorAll('.tree-button').forEach(btn => {
        const treeKey = btn.dataset.tree;
        const reqLvl = TREES[treeKey].requiredLevel;
        btn.disabled = game.level < reqLvl;
        btn.classList.toggle('active', treeKey === game.currentTree);
    });

    saveGame();
}

/** Processes experience gain and checks for level up. */
function gainXP(amount) {
    game.currentXP += amount;
    let leveledUp = false;

    while (game.level < 99 && game.currentXP >= calculateXPForLevel(game.level)) {
        game.level++;
        leveledUp = true;
    }

    if (leveledUp) {
        const oldAxe = game.currentAxe.name;
        game.currentAxe = determineBestAxe(game.level);
        if (game.currentAxe.name !== oldAxe) {
            notify(`Axe unlocked! You are now using the ${game.currentAxe.name}! ⛏️`);
        }
        notify(`Congratulations! You reached Woodcutting Level ${game.level}! 🎉`);
    }

    updateDisplay();
}

/** Finds the best axe the player can currently use. */
function determineBestAxe(level) {
    let bestAxe = AXES[0];
    for (const axe of AXES) {
        if (level >= axe.requiredLevel) {
            bestAxe = axe;
        } else {
            // Axes are ordered by level, so we can stop once the level requirement is too high.
            break;
        }
    }
    return bestAxe;
}

/** Calculates the actual time to cut based on tree and axe. */
function getCalculatedCutTime() {
    const treeData = TREES[game.currentTree];
    // Time = Base Time * (1 - speedBoost)
    return treeData.baseTime * (1 - game.currentAxe.speedBoost);
}

/** Starts the woodcutting action. */
function startCutting() {
    if (game.isCutting || game.level < TREES[game.currentTree].requiredLevel) return;

    game.isCutting = true;
    game.totalCutTime = getCalculatedCutTime();
    let timeElapsed = 0;
    const interval = 50; // Update every 50ms

    D.cutButton.disabled = true;
    D.timerText.textContent = `Chopping ${TREES[game.currentTree].name}...`;

    game.cutTimer = setInterval(() => {
        timeElapsed += interval;
        const progress = (timeElapsed / game.totalCutTime) * 100;

        D.timerBar.style.width = `${Math.min(100, progress)}%`;

        if (timeElapsed >= game.totalCutTime) {
            clearInterval(game.cutTimer);
            finishCutting();
        }
    }, interval);
}

/** Finishes the woodcutting action. */
function finishCutting() {
    game.isCutting = false;
    const treeData = TREES[game.currentTree];

    game.logs++;
    gainXP(treeData.xp);

    D.timerBar.style.width = '0%';
    D.timerText.textContent = `Got a ${treeData.name} log! Ready to chop!`;
    D.cutButton.disabled = false;
    notify(`+1 ${treeData.name} Log, +${treeData.xp} XP`);

    // Self-restart logic for idle gameplay
    setTimeout(startCutting, 500); // 500ms delay before next chop
    updateDisplay();
}

/** Switches the currently selected tree. */
function selectTree(treeKey) {
    if (game.isCutting) return; // Cannot switch mid-cut

    const treeData = TREES[treeKey];
    if (game.level < treeData.requiredLevel) {
        notify(`You need Woodcutting Level ${treeData.requiredLevel} to chop ${treeData.name}.`);
        return;
    }

    game.currentTree = treeKey;
    updateDisplay();
}

/** Creates the tree selection buttons dynamically. */
function createTreeButtons() {
    D.treeSelectButtons.innerHTML = '';
    for (const key in TREES) {
        const tree = TREES[key];
        const button = document.createElement('button');
        button.className = 'tree-button';
        button.dataset.tree = key;
        button.textContent = `${tree.name} (Lvl ${tree.requiredLevel})`;
        button.addEventListener('click', () => selectTree(key));
        D.treeSelectButtons.appendChild(button);
    }
}

/** Displays a temporary notification message. */
function notify(message) {
    const msgElement = document.createElement('div');
    msgElement.className = 'notification-message';
    msgElement.textContent = message;
    D.notifications.appendChild(msgElement);

    // Remove the message after the animation finishes (3.1s)
    setTimeout(() => {
        msgElement.remove();
    }, 3100);
}

// --- Initialization ---

// Load game on start
loadGame();

// Event Listeners
D.cutButton.addEventListener('click', startCutting);

// Set up an automatic save every 10 seconds
setInterval(saveGame, 10000);