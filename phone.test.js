// Проверки для телефона: сводка сверху, шторка радио и видео, вибрация, «не гасить экран», скорость.
// Запуск: node phone.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
function classList() {
    return { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } };
}
const texts = [];
const ctxStub = new Proxy({}, { get: (t, k) => k === 'fillText' ? s => texts.push(String(s)) : k === 'measureText' ? s => ({ width: String(s).length * 8 }) : (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) });
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', checked: false, style: {}, children: [], dataset: {}, classList: classList(), clientWidth: 400,
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {}, getContext: () => ctxStub, width: 480, height: 780 };
}
function boot({ touch = true, nav = {}, tg, store = {} } = {}) {
    const els = {}, raf = [];
    const body = Object.assign(makeEl(), { appendChild() {} });
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body, querySelectorAll: () => [], visibilityState: 'visible' },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: { addEventListener() {}, Telegram: tg ? { WebApp: tg } : undefined }, location: { search: touch ? '?touch=1' : '', hash: '', protocol: 'https:' },
        navigator: nav, requestAnimationFrame: f => raf.push(f), setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL, WeakMap, Promise
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), el: id => els[id] || (els[id] = makeEl()), body, raf, store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

(async () => {
console.log('Сводка сверху');
let g = boot();
g.run("chooseMode(false); chooseGoal('free'); generateWorld(3); player.y = DEPTH_ORIGIN + 120; health = 25; stats.money = 340; updateCamera();");
texts.length = 0; g.run('renderTouchHud()');
check('четыре плашки: ❤ здоровье, ⛏ глубина, 🎒 рюкзак, монеты', ['❤', '⛏', '🎒'].every(t => texts.includes(t)) && texts.includes('25') && texts.includes('120 м') && texts.includes('340'));
g.run("setTouchPad('hud', 'large')");
check('крупная сводка — в настройках, запоминается', g.run('settings.hudSize') === 'large' && JSON.parse(g.store.miner_settings).hudSize === 'large');

console.log('Радио и видео — шторка снизу');
g = boot();
g.run('radioPanelToggle(true)');
check('радио открыто — кнопки управления спрятаны', g.body.classList.contains('sheet-open'));
g.run('videoPanelToggle(true)');
check('открыл видео — радио закрылось, одна шторка за раз', g.el('videoPanel').classList.contains('open') && !g.el('radioPanel').classList.contains('open') && g.body.classList.contains('sheet-open'));
g.run('videoPanelToggle(false)');
check('закрыл — кнопки вернулись', !g.body.classList.contains('sheet-open'));
check('в CSS: шторка во всю ширину снизу, кнопки скрыты', /body\.touch #radioPanel\.open \{[^}]*bottom: 0;[^}]*max-height: 62vh/.test(html) && /body\.touch\.sheet-open #touchControls \{\s*display: none;/.test(html));
const desk = boot({ touch: false });
desk.run('radioPanelToggle(true)');
check('на компьютере — без шторки, как раньше', !desk.body.classList.contains('sheet-open'));

console.log('Вибрация');
const vib = [];
g = boot({ nav: { vibrate: p => vib.push(p) } });
g.run("chooseMode(false); chooseGoal('free'); health = 100;");
g.run('damage(1, "жар")');
check('мелкий урон (жар, газ по чуть-чуть) — без вибрации', vib.length === 0);
g.run('damage(15, "Паук")');
check('укус — короткая вибрация', vib.length === 1 && vib[0] === 35);
g.run('lastBuzz = 0; damage(40, "Взрыв")');
check('взрыв — сильная', JSON.stringify(vib[1]) === '[60,40,90]');
g.run('damage(15, "x"); damage(15, "x");');
check('не чаще раза в четверть секунды', vib.length === 2);
g.run("lastBuzz = 0; setTouchPad('vibrate', false); damage(15, 'x');");
check('выключил в настройках — без вибрации', vib.length === 2);
const haptic = [];
g = boot({ nav: { vibrate: p => vib.push(p) }, tg: { isVersionAtLeast: () => true, HapticFeedback: { impactOccurred: s => haptic.push(s), notificationOccurred: s => haptic.push('n:' + s) } } });
g.run("chooseMode(false); chooseGoal('free'); lastBuzz = 0; damage(25, 'x'); lastBuzz = 0; buzz('warn');");
check('в Telegram — его отклик (работает и на iPhone)', haptic.join() === 'heavy,n:warning');
const dv = []; const d2 = boot({ touch: false, nav: { vibrate: p => dv.push(p) } });
d2.run("chooseMode(false); chooseGoal('free'); damage(30, 'x');");
check('на компьютере не вибрирует', dv.length === 0);

console.log('Не гасить экран');
let requests = 0, released = 0;
const fakeLock = { addEventListener() {}, release() { released++; } };
g = boot({ nav: { wakeLock: { request: async () => { requests++; return fakeLock; } } } });
await g.run('keepAwake()');
check('экран держится включённым (Wake Lock)', requests === 1);
await g.run('keepAwake()');
check('повторно не просит', requests === 1);
g.run("setTouchPad('keepAwake', false)");
check('выключил в настройках — отпускает', released === 1 && g.run('wakeLock') === null);
check('браузер без Wake Lock — без ошибок', await boot({ nav: {} }).run('keepAwake()') === false);

console.log('Скорость');
g = boot({ nav: { deviceMemory: 8, hardwareConcurrency: 8 } });
check('обычный телефон: «Авто» — красиво', g.run('fastMode()') === false);
g = boot({ nav: { deviceMemory: 2 } });
check('слабый телефон (2 ГБ памяти): «Авто» — быстро', g.run('fastMode()') === true);
g = boot({ nav: { devicePixelRatio: 3 } });
g.run("setTouchPad('perf', 'fast')");
check('«Быстро» — обычная чёткость (холст без увеличения)', g.run('RENDER_SCALE') === 1);
g.run("chooseMode(false); chooseGoal('free');");
let frames = 0; g.run('const _gf = gameFrame; gameFrame = t => { globalThis.__f = (globalThis.__f || 0) + 1; };');
for (const t of [1000, 1010, 1020, 1033, 1040, 1066]) g.run(`gameLoop(${t})`);
check('«Быстро» — не чаще 30 кадров в секунду', g.run('globalThis.__f') === 3);
g.run("setTouchPad('perf', 'quality'); globalThis.__f = 0;"); for (const t of [2000, 2010, 2020]) g.run(`gameLoop(${t})`);
check('«Красиво» — каждый кадр', g.run('globalThis.__f') === 3);
check('в настройках: Авто / Быстро / Красиво', /data-perf="auto"[\s\S]*data-perf="fast"[\s\S]*data-perf="quality"/.test(html));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
})();
