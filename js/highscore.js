/**
 * YOLO - High Score System
 * Two top-10 tables in localStorage:
 *   main - every run; runs made in true YOLO mode carry a tag
 *   yolo - YOLO runs only
 * A YOLO run is entered in both, so it can make either or both.
 */

const STORAGE_KEYS = { main: 'yolo_highscores', yolo: 'yolo_highscores_yolo' };
const MAX_SCORES = 10;
const MAX_NAME_LENGTH = 3;

/**
 * Load one table.
 * @param {'main'|'yolo'} table
 * @returns {Array} Array of { name, score, level, kills, bases, yolo } sorted descending by score
 */
function loadHighScores(table = 'main') {
    try {
        let data = localStorage.getItem(STORAGE_KEYS[table]);
        let yoloOnly = false;
        if (!data && table === 'yolo') {
            // No YOLO table saved yet: start it from the YOLO runs already on the main table
            data = localStorage.getItem(STORAGE_KEYS.main);
            yoloOnly = true;
        }
        if (!data) return [];
        const scores = JSON.parse(data);
        if (!Array.isArray(scores)) return [];
        // Validate and sort
        return scores
            .filter(s => typeof s.score === 'number' && (!yoloOnly || s.yolo))
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SCORES);
    } catch (e) {
        console.warn('Failed to load high scores:', e);
        return [];
    }
}

function persistHighScores(table, scores) {
    try {
        localStorage.setItem(STORAGE_KEYS[table], JSON.stringify(scores.slice(0, MAX_SCORES)));
    } catch (e) {
        console.warn('Failed to save high scores:', e);
    }
}

function qualifiesForTable(table, score) {
    if (score <= 0) return false; // nothing scored, nothing to record
    const scores = loadHighScores(table);
    if (scores.length < MAX_SCORES) return true;
    return score > scores[scores.length - 1].score;
}

/**
 * Check if a new score qualifies for a leaderboard.
 * @param {number} score
 * @param {boolean} yolo - the run was in true YOLO mode, so the YOLO table counts too
 * @returns {boolean}
 */
function qualifiesForHighScore(score, yolo = false) {
    return qualifiesForTable('main', score) || (yolo && qualifiesForTable('yolo', score));
}

/**
 * Add a new high score entry and persist.
 * @param {string} name - Player name/initials
 * @param {number} score
 * @param {number} level
 * @param {number} kills
 * @param {number} bases
 * @returns {{ main: number, yolo: number }} the entry's place in each table (0 = best), -1 where it did not make it
 */
function addHighScore(name, score, level, kills, bases, startLevel = 1, density = 3, yolo = false) {
    const entry = {
        name: name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_NAME_LENGTH),
        score,
        level,
        kills,
        bases,
        startLevel,   // settings the run was started with
        density,
        yolo,         // true YOLO mode: one tank, no spares
    };
    // Read both tables before writing either: a YOLO table that has never been
    // saved is read from the main one, and must not pick this entry up from there
    const current = { main: loadHighScores('main'), yolo: yolo ? loadHighScores('yolo') : [] };
    const place = (table) => {
        const scores = current[table];
        scores.push(entry);
        scores.sort((a, b) => b.score - a.score);
        persistHighScores(table, scores);
        const rank = scores.indexOf(entry);
        return rank < MAX_SCORES ? rank : -1;
    };
    return { main: place('main'), yolo: yolo ? place('yolo') : -1 };
}

/**
 * Get the minimum score needed to qualify for the main top 10.
 * @returns {number} 0 if leaderboard isn't full, otherwise the 10th place score + 1
 */
function getQualifyingScore() {
    const scores = loadHighScores();
    if (scores.length < MAX_SCORES) return 0;
    return scores[scores.length - 1].score + 1;
}

/**
 * Get the best (highest) score entry of a table, or null.
 * @param {'main'|'yolo'} table
 * @returns {object|null}
 */
function getBestScore(table = 'main') {
    const scores = loadHighScores(table);
    return scores.length > 0 ? scores[0] : null;
}

export { loadHighScores, addHighScore, qualifiesForHighScore, getQualifyingScore, getBestScore, MAX_SCORES, MAX_NAME_LENGTH };
