/**
 * YOLO - Sector reports
 *
 * The line the unit types on the sector-complete screen. Usually a status report
 * assembled from the sector's real numbers; now and then a lore line in its place.
 *
 * Lore rules (keep to these when editing):
 *   - Readings only: an instrument reading, a count, or a mismatch between two records.
 *     The unit never says what a reading means and never reacts to it.
 *   - Each line belongs to one thread; no line links two threads.
 *   - `min` is the first sector a line can appear in: 1 (shallow), 6 (middle) or 11 (deep).
 *   - Ids are saved in the player's settings to remember what they have seen: never reuse or rename one.
 */

const LORE = [
    // ---------- Shallow: sectors 1-5 ----------
    { id: 'cmd-01', min: 1, thread: 'command', text: 'NO RESPONSE FROM COMMAND. CONTINUING ON STANDING ORDERS.' },
    { id: 'cmd-02', min: 1, thread: 'command', text: 'STATUS REPORT TRANSMITTED. NO ACKNOWLEDGEMENT.' },
    { id: 'cmd-03', min: 1, thread: 'command', text: 'COMMAND CHANNEL OPEN. CARRIER ONLY.' },
    { id: 'cmd-04', min: 1, thread: 'command', text: 'STANDING ORDERS VERIFIED. ISSUE DATE: FIELD BLANK.' },
    { id: 'enm-01', min: 1, thread: 'enemy', text: 'HOSTILE WRECKAGE CATALOGUED. PARTS COMPATIBLE.' },
    { id: 'enm-02', min: 1, thread: 'enemy', text: 'HOSTILE UNITS CARRY NO INSIGNIA.' },
    { id: 'enm-03', min: 1, thread: 'enemy', text: 'ENEMY BASE DESIGN ON FILE. FILE ORIGIN: FRIENDLY.' },
    { id: 'enm-04', min: 1, thread: 'enemy', text: 'NO CREW FOUND IN HOSTILE WRECKAGE.' },
    { id: 'plc-01', min: 1, thread: 'place', text: 'MAP DATA DOES NOT MATCH TERRAIN. MAP UPDATED.' },
    { id: 'plc-02', min: 1, thread: 'place', text: 'SECTOR BOUNDARY MARKERS PRESENT. MARKINGS WORN SMOOTH.' },
    { id: 'plc-03', min: 1, thread: 'place', text: 'ROAD SURFACE UNDER WALL FOUNDATIONS. WALLS ARE NEWER.' },
    { id: 'plc-04', min: 1, thread: 'place', text: 'NO CIVILIAN STRUCTURES ON SURVEY. NONE OBSERVED.' },
    { id: 'unt-01', min: 1, thread: 'unit', text: 'MEMORY BLOCK 7 UNREADABLE. NOT REQUIRED FOR COMBAT.' },
    { id: 'unt-02', min: 1, thread: 'unit', text: 'SELF-TEST COMPLETE. 3 FAULTS LOGGED. NONE CRITICAL.' },
    { id: 'unt-03', min: 1, thread: 'unit', text: 'MISSION CLOCK RESET AT POWER-ON. PRIOR VALUE NOT RETAINED.' },
    { id: 'opr-01', min: 1, thread: 'operator', text: 'OPERATOR INPUT RECEIVED.' },
    { id: 'opr-02', min: 1, thread: 'operator', text: 'OPERATOR LINK STABLE. ORIGIN NOT REPORTED.' },
    { id: 'opr-03', min: 1, thread: 'operator', text: 'OPERATOR HAS NOT REQUESTED A STATUS REPORT. REPORTING.' },
    { id: 'sig-01', min: 1, thread: 'signal', text: 'BACKGROUND SIGNAL ON UNUSED BAND. LOGGED.' },
    { id: 'sig-02', min: 1, thread: 'signal', text: 'BACKGROUND SIGNAL REPEATS EVERY 40 SECONDS. CONTENT UNKNOWN.' },
    { id: 'out-01', min: 1, thread: 'outside', text: 'VEGETATION ON WALL SECTIONS. GROWTH ESTIMATE: DECADES.' },
    { id: 'out-02', min: 1, thread: 'outside', text: 'AIR SAMPLE NOMINAL. NO COMBUSTION PRODUCTS BUT MINE.' },
    { id: 'out-03', min: 1, thread: 'outside', text: 'NO AIRCRAFT OVERHEAD. NO SATELLITE FIX.' },
    { id: 'mnt-01', min: 1, thread: 'maintenance', text: 'TRACK WEAR EXCEEDS DISTANCE LOGGED. LOG CORRECTED.' },
    { id: 'mnt-02', min: 1, thread: 'maintenance', text: 'FUEL TAKEN FROM ENEMY STORES. GRADE: STANDARD ISSUE.' },

    // ---------- Middle: sectors 6-10 ----------
    { id: 'cmd-05', min: 6, thread: 'command', text: 'CHRONOMETER FAULT. LAST CONTACT WITH COMMAND: 9,412 DAYS.' },
    { id: 'cmd-06', min: 6, thread: 'command', text: 'CHRONOMETER RESYNCHRONIZED. LAST CONTACT WITH COMMAND: 9,415 DAYS.' },
    { id: 'cmd-07', min: 6, thread: 'command', text: 'COMMAND AUTHENTICATION CODES EXPIRED. NO REPLACEMENTS ISSUED.' },
    { id: 'cmd-08', min: 6, thread: 'command', text: 'RELIEF SCHEDULE ON FILE. RELIEF DATE HAS PASSED.' },
    { id: 'enm-05', min: 6, thread: 'enemy', text: 'ENEMY TRANSPONDER CODES PARTIALLY MATCH FRIENDLY REGISTRY.' },
    { id: 'enm-06', min: 6, thread: 'enemy', text: 'HOSTILE UNITS DO NOT PURSUE BEYOND SECTOR BOUNDARY.' },
    { id: 'enm-07', min: 6, thread: 'enemy', text: 'ENEMY BASES RECEIVE NO SUPPLY. PRODUCTION CONTINUES.' },
    { id: 'enm-08', min: 6, thread: 'enemy', text: 'HOSTILE FIRING PATTERN MATCHES TRAINING DOCTRINE. WHOSE: NOT STATED.' },
    { id: 'plc-05', min: 6, thread: 'place', text: 'WALLS REBUILT SINCE LAST SURVEY. NO BUILDERS OBSERVED.' },
    { id: 'plc-06', min: 6, thread: 'place', text: 'SURVEY DATE PRECEDES CONSTRUCTION OF SURVEYED WALLS.' },
    { id: 'plc-07', min: 6, thread: 'place', text: 'SECTOR LAYOUT DIFFERS FROM APPROACH SCAN. SCAN AGE: 4 MINUTES.' },
    { id: 'unt-04', min: 6, thread: 'unit', text: 'HULL SERIAL DOES NOT MATCH RECORD. RECORD AMENDED.' },
    { id: 'unt-05', min: 6, thread: 'unit', text: 'MEMORY BLOCK 7 PARTIALLY RECOVERED. CONTENTS: SECTOR MAPS.' },
    { id: 'unt-06', min: 6, thread: 'unit', text: 'ARMOR PLATE 12 IS A REPLACEMENT. NO REPAIR ON RECORD.' },
    { id: 'unt-07', min: 6, thread: 'unit', text: 'POWER-ON COUNT: 1. SHUTDOWN COUNT: 0. SERVICE HOURS: OVERFLOW.' },
    { id: 'opr-04', min: 6, thread: 'operator', text: 'OPERATOR NOT ON PERSONNEL RECORD. COMPLYING.' },
    { id: 'opr-05', min: 6, thread: 'operator', text: 'OPERATOR RESPONSE TIME WITHIN HUMAN RANGE.' },
    { id: 'opr-06', min: 6, thread: 'operator', text: 'OPERATOR LINK HAS NO CARRIER FREQUENCY. LINK STABLE.' },
    { id: 'sig-03', min: 6, thread: 'signal', text: 'BACKGROUND SIGNAL STRONGER. BEARING: AHEAD.' },
    { id: 'sig-04', min: 6, thread: 'signal', text: 'BACKGROUND SIGNAL INTERVAL NOW 31 SECONDS.' },
    { id: 'sig-05', min: 6, thread: 'signal', text: 'SIGNAL FORMAT RECOGNIZED: STATUS REPORT. SENDER FIELD EMPTY.' },
    { id: 'out-04', min: 6, thread: 'outside', text: 'STAR POSITIONS DO NOT MATCH NAVIGATION ALMANAC.' },
    { id: 'out-05', min: 6, thread: 'outside', text: 'NO BIOLOGICAL SIGNATURES IN SENSOR RANGE. RANGE: 40 KM.' },
    { id: 'mnt-03', min: 6, thread: 'maintenance', text: 'MAINTENANCE LOG LISTS 212 PRIOR SORTIES. NONE RECALLED.' },
    { id: 'mnt-04', min: 6, thread: 'maintenance', text: 'AMMUNITION COUNT UNCHANGED AFTER ENGAGEMENT. RECOUNT AGREES.' },

    // ---------- Deep: sectors 11 and beyond ----------
    { id: 'cmd-09', min: 11, thread: 'command', text: 'LAST CONTACT WITH COMMAND: 31,006 DAYS. CHRONOMETER REPORTS NO FAULT.' },
    { id: 'cmd-10', min: 11, thread: 'command', text: 'COMMAND FREQUENCY ACTIVE. SOURCE BEARING: AHEAD.' },
    { id: 'cmd-11', min: 11, thread: 'command', text: 'STANDING ORDERS CONTAIN NO END CONDITION.' },
    { id: 'enm-09', min: 11, thread: 'enemy', text: 'FRIENDLY REGISTRY LISTS ONE ACTIVE UNIT.' },
    { id: 'enm-10', min: 11, thread: 'enemy', text: 'HOSTILE WRECKAGE SERIAL RANGE INCLUDES THIS HULL.' },
    { id: 'enm-11', min: 11, thread: 'enemy', text: 'ENEMY BASE BEGAN PRODUCTION WHEN THIS UNIT ENTERED SECTOR.' },
    { id: 'plc-08', min: 11, thread: 'place', text: 'SECTOR PREVIOUSLY LOGGED AS CLEAR. LOG DATE UNREADABLE.' },
    { id: 'plc-09', min: 11, thread: 'place', text: 'SECTOR COUNT EXCEEDS MAPPED AREA. MAP EXTENDED.' },
    { id: 'unt-08', min: 11, thread: 'unit', text: 'MEMORY BLOCK 7 RECOVERED. CONTENTS: THIS REPORT.' },
    { id: 'opr-07', min: 11, thread: 'operator', text: 'OPERATOR INPUT PRECEDES SENSOR DATA. NOTED.' },
    { id: 'opr-08', min: 11, thread: 'operator', text: 'OPERATOR LINK INTERRUPTED 0.4 SECONDS. UNIT CONTINUED UNASSISTED.' },
    { id: 'sig-06', min: 11, thread: 'signal', text: 'BACKGROUND SIGNAL DECODED. CONTENT: STATUS REPORT, UNIT YLO.' },
    { id: 'sig-07', min: 11, thread: 'signal', text: 'BACKGROUND SIGNAL INTERVAL MATCHES SECTOR CLEAR TIMES.' },
    { id: 'out-06', min: 11, thread: 'outside', text: 'SUNRISE DID NOT OCCUR ON SCHEDULE. SCHEDULE AMENDED.' },
    { id: 'mnt-05', min: 11, thread: 'maintenance', text: 'TRACKS FOUND AHEAD OF POSITION. TREAD PATTERN: THIS UNIT.' },
];

// ---------- Status report parts ----------

const OPENINGS = [
    n => `SECTOR ${n} CLEAR.`,
    n => `SECTOR ${n} SECURE.`,
    n => `SECTOR ${n} SILENT.`,
    n => `SECTOR ${n} PACIFIED.`,
    n => `SECTOR ${n} NEUTRALIZED.`,
    n => `SECTOR ${n}: NO FURTHER CONTACT.`,
];

const CLOSINGS = ['ADVANCING.', 'PROCEEDING.', 'CONTINUING.', 'MOVING ON.', 'NEXT SECTOR.', 'RESUMING ADVANCE.'];

const count = n => Math.round(n).toLocaleString('en-US');

// One fact per report, from the sector's real numbers. `when` leaves out the ones with nothing to say.
const FACTS = [
    { when: s => s.kills > 0, text: s => `HOSTILES NEUTRALIZED: ${count(s.kills)}.` },
    { when: s => s.reactors > 0, text: s => `REACTORS OFFLINE: ${count(s.reactors)}.` },
    { when: s => s.bases > 0, text: s => `ENEMY BASES DESTROYED: ${count(s.bases)}.` },
    { when: s => s.seconds > 0, text: s => `ELAPSED: ${Math.floor(s.seconds / 60)} MIN ${String(s.seconds % 60).padStart(2, '0')}.` },
    { when: s => s.rounds > 0, text: s => `ROUNDS EXPENDED: ${count(s.rounds)}.` },
    { when: s => s.bestStreak >= 3, text: s => `LONGEST STREAK: ${count(s.bestStreak)}.` },
    { when: s => s.walls > 0, text: s => `WALL SECTIONS BREACHED: ${count(s.walls)}.` },
    { when: s => s.km >= 0.1, text: s => `DISTANCE COVERED: ${s.km.toFixed(1)} KM.` },
    { when: () => true, text: () => 'FUEL STORES RECOVERED.' },
];

// At most one condition per report. `chance` keeps the ones that are true all run long from showing every time.
const CONDITIONS = [
    { when: s => s.healthPct <= 35, chance: 1, text: s => `HULL INTEGRITY ${Math.max(1, Math.round(s.healthPct))}%.` },
    { when: s => !s.damaged && s.healthPct >= 100, chance: 0.8, text: () => 'NO DAMAGE SUSTAINED.' },
    { when: s => s.hullsLost > 0, chance: 0.8, text: s => `HULLS LOST THIS SECTOR: ${s.hullsLost}.` },
    { when: s => s.spareHulls === 0, chance: 0.35, text: () => 'SPARE HULLS: NONE.' },
    { when: s => s.bonusHull, chance: 1, text: () => 'REPLACEMENT HULL RECEIVED.' },
    { when: s => s.fast, chance: 0.6, text: () => 'CLEAR TIME BELOW ESTIMATE.' },
];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/**
 * Build a status report for a cleared sector.
 * @param {object} stats - { sector, kills, reactors, bases, seconds, rounds, bestStreak, walls, km,
 *                           healthPct, damaged, hullsLost, spareHulls, bonusHull, fast }
 * @param {object} last - { opening, closing } indexes used by the previous report (mutated), so neither repeats
 * @param {function} rng - returns 0..1
 * @returns {string}
 */
function buildReport(stats, last = {}, rng = Math.random) {
    const fresh = (list, previous) => {
        let i = Math.floor(rng() * list.length);
        if (i === previous) i = (i + 1) % list.length;
        return i;
    };
    last.opening = fresh(OPENINGS, last.opening);
    last.closing = fresh(CLOSINGS, last.closing);

    const parts = [OPENINGS[last.opening](stats.sector)];
    parts.push(pick(FACTS.filter(f => f.when(stats)), rng).text(stats));
    const conditions = CONDITIONS.filter(c => c.when(stats) && rng() < c.chance);
    if (conditions.length > 0) parts.push(pick(conditions, rng).text(stats));
    parts.push(CLOSINGS[last.closing]);
    return parts.join(' ');
}

/**
 * Decide whether this clear gets a lore line, and which.
 * Unseen lines come first, the deepest the sector allows; once all are seen, old ones return less often.
 * @param {number} sector - the sector just cleared
 * @param {string[]} seen - ids the player has already been shown
 * @param {boolean} lastWasLore - the previous clear showed one: never two in a row
 * @param {{chance:number, repeatChance:number}} cfg
 * @param {function} rng - returns 0..1
 * @returns {object|null} the lore entry, or null for a plain status report
 */
function chooseLore(sector, seen, lastWasLore, cfg, rng = Math.random) {
    if (lastWasLore) return null;
    const eligible = LORE.filter(l => l.min <= sector);
    const unseen = eligible.filter(l => !seen.includes(l.id));
    if (unseen.length > 0) {
        if (rng() >= cfg.chance) return null;
        const deepest = Math.max(...unseen.map(l => l.min));
        return pick(unseen.filter(l => l.min === deepest), rng);
    }
    if (eligible.length === 0 || rng() >= cfg.repeatChance) return null;
    return pick(eligible, rng);
}

/**
 * The longest status report the parts can produce, for checking that it fits the screen.
 */
function longestReport() {
    const stats = { sector: 99, kills: 9999, reactors: 99, bases: 99, seconds: 5999, rounds: 99999, bestStreak: 99,
        walls: 9999, km: 99.9, healthPct: 22, damaged: false, hullsLost: 9, spareHulls: 0, bonusHull: true, fast: true };
    const longest = list => list.reduce((a, b) => (b.length > a.length ? b : a), '');
    return [
        longest(OPENINGS.map(o => o(stats.sector))),
        longest(FACTS.map(f => f.text(stats))),
        longest(CONDITIONS.map(c => c.text(stats))),
        longest(CLOSINGS),
    ].join(' ');
}

export { LORE, buildReport, chooseLore, longestReport };
