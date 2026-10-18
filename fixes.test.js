// Проверки исправлений v1.6.1: залипание клавиш, повреждённые сохранения, стопка уведомлений,
// экранирование названий, автоповтор, время на паузе, резервная копия, сохранение при уходе,
// недоступное хранилище, значок радио и подсказка лавки на телефоне.
// Запуск: node fixes.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function classList() {
    return { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } };
}
function boot(opts = {}) {
    const texts = [], fills = [];
    const ctxStub = new Proxy({}, {
        get: (t, k) => k === 'fillText' ? (s, x, y) => texts.push([s, x, y]) : k === 'fillRect' ? (x, y) => fills.push([t.fillStyle, x, y]) :
            k === 'measureText' ? s => ({ width: s.length * 7 }) : (k in t ? t[k] : () => {}),
        set: (t, k, v) => (t[k] = v, true)
    });
    const notes = [], els = {}, handlers = {}, docHandlers = {}, timers = [];
    const mk = () => ({ textContent: '', innerHTML: '', value: '', style: {}, children: [], classList: classList(), offsetHeight: 50,
        appendChild(c) { this.children.push(c); }, remove() { this.removed = true; }, focus() {}, click() {},
        getContext: () => ctxStub, width: 800, height: 600, clientWidth: 400 });
    const store = opts.store || {};
    const body = mk();
    body.appendChild = n => { notes.push(n); };
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = mk()), createElement: () => mk(), body,
            querySelectorAll: () => [], addEventListener: (t, f) => { docHandlers[t] = f; }, visibilityState: 'visible' },
        localStorage: opts.brokenStorage
            ? { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem() {} }
            : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        window: { addEventListener: (t, f) => { handlers[t] = f; } }, location: { search: opts.search || '' },
        Audio: class { addEventListener() {} play() { return Promise.resolve(); } pause() {} removeAttribute() {} load() {} },
        requestAnimationFrame() {}, setInterval() {}, setTimeout: (f, ms) => timers.push(f), clearTimeout() {},
        confirm: () => (opts.confirm === undefined ? false : opts.confirm),
        console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, Object, Proxy, Number, Set, Map, Promise, String, Array, URL
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), notes, els, handlers, docHandlers, timers, store, texts, fills, sb };
}
let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const msgs = g => g.notes.map(n => n.textContent);

console.log('1. Залипание клавиш');
let g = boot();
g.handlers.keydown({ code: 'KeyD', preventDefault() {} });
g.handlers.blur();
check('ушёл в другое окно, держа D, — клавиша отпущена', g.run("keys['KeyD']") === false);
g.handlers.keydown({ code: 'KeyS', preventDefault() {} }); g.handlers.keydown({ code: 'Space', preventDefault() {} });
g.sb.document.visibilityState = 'hidden'; g.docHandlers.visibilitychange();
check('свернул браузер — S и пробел отпущены', g.run("keys['KeyS'] || keys['Space']") === false);

console.log('2. Повреждённые сохранения не портят игру');
g = boot();
g.run('generateWorld(3); player.x = 60; player.y = 7; stats.money = 77;');
const good = JSON.parse(g.run('JSON.stringify(createSaveData("t"))'));
const before = g.run('JSON.stringify(world)');
const cases = {
    'мир обрезан': d => { d.world.data = d.world.data.slice(0, 6); },
    'мир — строка': d => { d.world.data = 'abc'; },
    'неизвестный блок': d => { d.world.data[0] = 999; },
    'нет игрока': d => { delete d.player; },
    'координаты — мусор': d => { d.player.x = 'x'; },
    'игрок за краем мира': d => { d.player.y = 5000; },
    'нет денег и очков': d => { delete d.stats; },
    'не объект': () => 'просто строка'
};
for (const [name, mut] of Object.entries(cases)) {
    const bad = JSON.parse(JSON.stringify(good)); const r = mut(bad); const data = r === undefined ? bad : r;
    const res = g.run(`loadSaveData(${JSON.stringify(data)})`);
    check(`${name}: отклонено, мир и деньги прежние`, res === false && g.run('JSON.stringify(world)') === before && g.run('stats.money') === 77);
}
check('сообщение «файл повреждён — текущая игра не тронута»', msgs(g).some(m => m.includes('повреждён') && m.includes('не тронута')));
check('целое сохранение по-прежнему загружается', g.run(`loadSaveData(${JSON.stringify(good)})`) === true);
const v2 = JSON.parse(JSON.stringify(good)); v2.version = 2; v2.stats = { gold: 1, gems: 1, score: 5 }; delete v2.backpack;
check('и старые форматы (v2) тоже', g.run(`loadSaveData(${JSON.stringify(v2)})`) === true);

console.log('3. Несовместимое автосохранение');
g = boot({ store: { miner_autosave: JSON.stringify({ version: 1, seed: 1, world: { data: [] }, player: { x: 1, y: 1 }, stats: {} }) }, confirm: true });
check('согласился продолжить старое — игра всё равно с миром', g.run('world.length') === 800);
let threw = false; try { g.run('gameFrame(16); render();'); } catch (e) { threw = true; }
check('и кадры идут без ошибок', !threw);
g = boot({ store: { miner_autosave: '{испорчено' }, confirm: true });
check('нечитаемое автосохранение — новая игра', g.run('world.length') === 800);

console.log('4. Уведомления стопкой');
g = boot();
g.run('showNotification("раз"); showNotification("два"); showNotification("три");');
const tops = g.notes.slice(-3).map(n => parseInt(n.style.top));
check(`три уведомления одно под другим (${tops.join(', ')} px)`, tops[0] < tops[1] && tops[1] < tops[2]);
g.run('showNotification("4"); showNotification("5");');
check('больше четырёх сразу не бывает — старое убрано', g.notes.filter(n => !n.removed).length <= 4 + 0 || g.notes[0].removed);
g.timers.shift()();
check('когда старое исчезает, остальные поднимаются', parseInt(g.notes[2].style.top) === 20 || parseInt(g.notes.find(n => !n.removed).style.top) === 20);

console.log('5. Названия сохранений');
g = boot();
g.run('saveToSlot(1, "<b>шахта</b> & \\"друзья\\"")');
g.run('updateSaveSlotsList ? updateSaveSlotsList() : 0');
g.run('updateLoadSlotsList()');
const listHtml = g.els.loadSlotsList.children.map(c => c.innerHTML).join('');
check('теги в названии не становятся разметкой', listHtml.includes('&lt;b&gt;шахта&lt;/b&gt; &amp; &quot;друзья&quot;') && !listHtml.includes('<b>шахта'));

console.log('6. Автоповтор клавиш');
g = boot();
g.run('health = 40; bandages = 5; hazardClock = 100; lastHealAt = -Infinity;');
g.handlers.keydown({ code: 'KeyH', preventDefault() {} });
g.run('hazardClock += 2;');
g.handlers.keydown({ code: 'KeyH', repeat: true, preventDefault() {} });
g.handlers.keydown({ code: 'KeyH', repeat: true, preventDefault() {} });
check('удержание H — потрачен один бинт', g.run('bandages') === 4);
g.handlers.keyup({ code: 'KeyH' }); g.handlers.keydown({ code: 'KeyH', preventDefault() {} });
check('новое нажатие — лечит снова', g.run('bandages') === 3);
g.handlers.keydown({ code: 'KeyD', repeat: true, preventDefault() {} });
check('движение с автоповтором работает как раньше', g.run("keys['KeyD']") === true);

console.log('7. Время игры');
g = boot();
g.run('stats.playtime = 0; gameState.paused = false; lastTime = 0; for (let i = 1; i <= 60; i++) gameFrame(i * 1000 / 60);');
const played = g.run('stats.playtime');
g.run('gameState.paused = true; for (let i = 61; i <= 240; i++) gameFrame(i * 1000 / 60);');
check(`секунда игры — ${played.toFixed(2)} с`, Math.abs(played - 1) < 0.05);
check('три секунды на паузе время не добавили', Math.abs(g.run('stats.playtime') - played) < 1e-9);

console.log('8. Отказ от автосохранения');
const store = { miner_autosave: JSON.stringify(good) };
g = boot({ store, confirm: false });
check('отказался — прошлая игра сохранена резервной копией', store.miner_save_backup === JSON.stringify(good));
g.timers.forEach(f => f());
check('и об этом есть сообщение', msgs(g).some(m => m.includes('резервная копия')));
g.run('updateLoadSlotsList()');
check('в «Загрузить» первая строка — резервная копия', g.els.loadSlotsList.children[0].innerHTML.includes('Резервная копия'));
g.run('stats.money = 0;'); g.els.loadSlotsList.children[0].onclick();
check('и она загружается', g.run('stats.money') === 77);

console.log('9. Сохранение при уходе');
const st2 = {};
g = boot({ store: st2 });
g.run('stats.money = 4321;');
g.handlers.pagehide();
check('закрыл вкладку — автосохранение сделано', st2.miner_autosave && JSON.parse(st2.miner_autosave).stats.money === 4321);
g.run('stats.money = 99;'); g.sb.document.visibilityState = 'hidden'; g.docHandlers.visibilitychange();
check('свернул браузер (телефон) — тоже', JSON.parse(st2.miner_autosave).stats.money === 99);

console.log('10. Хранилище недоступно');
g = boot({ brokenStorage: true });
check('сохранение в слот сообщает, что не получилось', g.run('saveToSlot(1, "x")') === false && msgs(g).some(m => m.includes('не даёт сохранять')));
g.notes.length = 0;
g.run('autoSave(); autoSave(); autoSave();');
check('автосохранение не падает и не засыпает сообщениями', g.notes.length <= 1);

console.log('11–13. Телефон');
g = boot({ search: '?touch=1' });
g.run('radioAddStation("Тест", "https://example.com/stream"); radio.on = true; radioSetStatus("live"); updateCamera(); render();');
const badge = g.texts.find(t => String(t[0]).startsWith('♪'));
check('значок радио на телефоне — слева сверху, не под кнопками', badge && badge[1] === 10 && badge[2] < 100);
g.run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; updateCamera(); render();');
check('у лавки подсказка про кнопку «Лавка»', g.texts.some(t => t[0] === '«Лавка» — инструменты'));
const desk = boot();
desk.run('radioAddStation("Тест", "https://example.com/stream"); radio.on = true; radioSetStatus("live"); player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; updateCamera(); render();');
check('на компьютере — по-прежнему «E — инструменты» и значок справа внизу',
    desk.texts.some(t => t[0] === 'E — инструменты') && desk.texts.find(t => String(t[0]).startsWith('♪'))[1] > 400);
check('на телефоне уведомления ниже сводки', (() => { g.run('document.body.classList.add("touch"); showNotification("x")'); return parseInt(g.notes[g.notes.length - 1].style.top) === 44; })());
check('стиль уведомлений для телефона есть', /body\.touch \.notification \{[^}]*max-width: 70vw/.test(html));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
