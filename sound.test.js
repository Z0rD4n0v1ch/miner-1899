// Проверки звука: Web Audio включается после первого нажатия, звуки событий, громкость,
// выключатель, фон шахты по пластам, частота повторов, настройки.
// Запуск: node sound.test.js — гоняет настоящий miner-1899.html в песочнице vm с поддельным AudioContext.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const log = [];
const param = v => ({ value: v, setValueAtTime(x) { this.value = x; }, exponentialRampToValueAtTime() {}, setTargetAtTime(x) { this.target = x; } });
class FakeAudio {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; FakeAudio.made++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: param(1), connect() {} }; }
    createBiquadFilter() { return { type: '', frequency: param(0), Q: param(0), connect() {} }; }
    createOscillator() { const o = { type: '', frequency: param(0), connect() {}, start() { log.push('tone:' + o.type); }, stop() {} }; return o; }
    createBufferSource() { return { buffer: null, loop: false, connect() {}, start() { log.push('noise'); }, stop() {} }; }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
}
FakeAudio.made = 0;
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', checked: false, style: {}, children: [], dataset: {},
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {},
        getContext: () => new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }), width: 800, height: 600 };
}
function boot({ audio = true, store = {} } = {}) {
    const els = {}, handlers = {};
    const win = { addEventListener(t, f) { handlers[t] = f; } };
    if (audio) win.AudioContext = FakeAudio;
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild() {}, classList: makeEl().classList }, querySelectorAll: () => [] },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: win, requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL, WeakMap, Promise, Float32Array
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), handlers, store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }
const tick = () => new Promise(r => setImmediate(r));

(async () => {
console.log('Включение');
let g = boot();
check('до нажатия звук не создаётся (правила браузеров)', FakeAudio.made === 0 && g.run("sfx('coins')") === false);
g.handlers.keydown({ code: 'KeyD', preventDefault() {} }); await tick();
check('первое нажатие — звук включён', FakeAudio.made === 1 && g.run('SFX.ctx.state') === 'running');
check('по умолчанию: звук вкл, фон вкл, громкость 60 %', g.run('settings.sound') && g.run('settings.ambience') && g.run('SFX.master.gain.value') === 0.6);
check('браузер без Web Audio — без ошибок', (() => { const b = boot({ audio: false }); b.handlers.keydown({ code: 'KeyD', preventDefault() {} }); return b.run("sfx('coins')") === false; })());

console.log('Звуки событий');
g.run("chooseMode(false); chooseGoal('free'); generateWorld(3);");
const names = ['hit', 'break', 'ore', 'coins', 'buy', 'step', 'climb', 'land', 'place', 'rope', 'crack', 'cavein', 'gas', 'boom', 'match', 'hurt', 'death', 'heal', 'rat', 'bat', 'spider', 'spit', 'squash', 'chirp', 'cage', 'achievement', 'fanfare'];
const silent = names.filter(n => { log.length = 0; g.run(`SFX.last = {}; SFX.ctx.currentTime += 5; sfx('${n}')`); return log.length === 0; });
check(`все ${names.length} звуков событий звучат`, silent.length === 0);
if (silent.length) console.log('    молчат:', silent);
check('неизвестный звук — тишина без ошибок', g.run("sfx('мяу')") === false);
log.length = 0; g.run("SFX.last = {}; sfx('step'); sfx('step');");
check('шаги не чаще ~4 в секунду', log.length === 1);

console.log('Звук в игре');
log.length = 0; g.run("SFX.last = {}; SFX.ctx.currentTime += 5; for (let i = 0; i < 5; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();");
check('продажа — звон монет', log.filter(x => x === 'tone:triangle').length >= 5);
log.length = 0; g.run("SFX.last = {}; SFX.ctx.currentTime += 5; stats.money = 100; buyLadders();");
check('покупка — звук', log.includes('tone:square'));
log.length = 0; g.run("SFX.last = {}; SFX.ctx.currentTime += 5; health = 100; damage(1, 'жар');");
check('жар по чуть-чуть — тихо', log.length === 0);
log.length = 0; g.run("damage(15, 'Паук');");
check('укус — звук урона', log.length > 0);
log.length = 0; g.run("SFX.last = {}; SFX.ctx.currentTime += 5; player.x = 50; player.y = DEPTH_ORIGIN + 100; player.direction = 1; world[player.y][51] = BLOCK_TYPES.STONE; world[player.y][50] = BLOCK_TYPES.AIR; keys = { Space: true }; updateDigging(0.05); keys = {};");
check('копание — стук кирки', log.length > 0);

console.log('Громкость и выключатель');
g.run("setSound('volume', 25)");
check('громкость 25 %', g.run('SFX.master.gain.value') === 0.25 && JSON.parse(g.store.miner_settings).volume === 0.25);
g.run("setSound('sound', false)");
check('выключил — тишина и громкость 0', g.run('SFX.master.gain.value') === 0 && g.run("SFX.last = {}; sfx('coins')") === false);
g.run("setSound('sound', true)");
check('включил — снова звучит', g.run("SFX.last = {}; SFX.ctx.currentTime += 5; sfx('coins')") === true);
check('запоминается', (() => { const b = boot({ store: g.store }); return b.run('settings.volume') === 0.25 && b.run('settings.sound') === true; })());
check('в настройках: звуки, фон, громкость', /id="optSound"[\s\S]*id="optAmbience"[\s\S]*id="optVolume"/.test(html));

console.log('Фон шахты');
g.run('player.y = SURFACE_Y - 1; gameState.paused = false; updateAmbience(0.1);');
check('на поверхности фона нет', g.run('SFX.amb.gain.target') === 0);
g.run('player.y = DEPTH_ORIGIN + 250; updateAmbience(0.1);');
check('в шахте — фон звучит', g.run('SFX.amb.gain.target') === 1 && g.run('SFX.ambNodes !== null'));
const f1 = g.run('SFX.ambNodes.f.frequency.target');
g.run('player.y = DEPTH_ORIGIN + 700; updateAmbience(0.1);');
check(`свой в каждом пласте: штольни ${f1} Гц, Огненное дно ${g.run('SFX.ambNodes.f.frequency.target')} Гц`, f1 !== g.run('SFX.ambNodes.f.frequency.target'));
log.length = 0; g.run('SFX.nextDrip = 0; updateAmbience(0.1);');
check('на Огненном дне — треск', log.filter(x => x === 'noise').length >= 3);
g.run("setSound('ambience', false); updateAmbience(0.1);");
check('фон выключен — тихо', g.run('SFX.amb.gain.target') === 0);
g.run("setSound('ambience', true); gameState.paused = true; updateAmbience(0.1);");
check('на паузе фон стихает', g.run('SFX.amb.gain.target') === 0);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
})();
