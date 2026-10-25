// Проверки настроек: положение уведомлений, панели местами, хранение, окно настроек.
// Запуск: node settings.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
function classList() {
    return { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } };
}
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', checked: false, style: {}, children: [], dataset: {}, classList: classList(), offsetHeight: 40,
        appendChild(c) { this.children.push(c); }, remove() { this.removed = true; }, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); }, width: 800, height: 600 };
}
function boot(store = {}, search = '') {
    const els = {}, notes = [], handlers = {};
    const optionBtns = ['top-right', 'top-left', 'top-center', 'bottom-right', 'bottom-left', 'bottom-center'].map(p => Object.assign(makeEl(), { dataset: { notify: p } }));
    const body = Object.assign(makeEl(), { appendChild(n) { notes.push(n); } });
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body,
            querySelectorAll: sel => sel.includes('notifyOptions') ? optionBtns : [] },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: { addEventListener(t, f) { handlers[t] = f; } }, location: { search },
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), els, notes, handlers, body, optionBtns, store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('Кнопка и окно');
check('кнопка «Настройки» на панели сохранений', /<div id="savePanel">[\s\S]*?openSettings\(\)[\s\S]*?<\/div>/.test(html));
let g = boot();
g.run('openSettings()');
check('окно открывается, игра на паузе', g.els.settingsModal.classList.contains('active') && g.run('gameState.paused') === true);
g.handlers.keydown({ code: 'Escape', preventDefault() {} });
check('ESC закрывает', !g.els.settingsModal.classList.contains('active') && g.run('gameState.paused') === false);
g.run('openSettings(); closeSettings();');
check('«Готово» закрывает', !g.els.settingsModal.classList.contains('active') && g.run('gameState.paused') === false);

console.log('Положение уведомлений');
g = boot();
check('по умолчанию — справа сверху', g.run('settings.notify') === 'top-right');
g.run('showNotification("раз"); showNotification("два");');
let [a, b] = g.notes.slice(-2);
check('справа сверху: top 20 и ниже, right 20', a.style.top === '20px' && parseInt(b.style.top) > 20 && a.style.right === '20px' && a.style.bottom === 'auto');
g.run('setNotifyPosition("bottom-left")');
check('слева снизу: уже показанные переставились', a.style.bottom === '20px' && a.style.top === 'auto' && a.style.left === '20px' && a.style.right === 'auto');
check('новые встают выше старых', parseInt(b.style.bottom) > 20);
g.run('setNotifyPosition("top-center")');
check('сверху по центру: left 50% и сдвиг на половину ширины', a.style.left === '50%' && a.style.transform === 'translateX(-50%)');
check('выбранная кнопка подсвечена', g.optionBtns.find(x => x.dataset.notify === 'top-center').classList.contains('chosen') &&
    !g.optionBtns.find(x => x.dataset.notify === 'top-right').classList.contains('chosen'));
check('неизвестное положение не принимается', g.run('setNotifyPosition("где-то")') === false && g.run('settings.notify') === 'top-center');

console.log('Панели местами');
g = boot();
check('по умолчанию не поменяны', !g.body.classList.contains('swap-panels'));
g.run('setSwapPanels(true)');
check('включил — на странице класс swap-panels', g.body.classList.contains('swap-panels'));
check('в CSS сохранения уходят направо, статистика налево', /body\.swap-panels #leftPanel \{ order: 2; \}/.test(html) && /body\.swap-panels #sidebar \{ order: 0; \}/.test(html));
g.run('setSwapPanels(false)');
check('выключил — обратно', !g.body.classList.contains('swap-panels'));

console.log('Хранение');
const store = {};
g = boot(store);
g.run('setNotifyPosition("bottom-right"); setSwapPanels(true);');
const g2 = boot(store);
check('после перезапуска настройки те же', g2.run('settings.notify') === 'bottom-right' && g2.run('settings.swap') === true && g2.body.classList.contains('swap-panels'));
check('галочка в окне отмечена', g2.els.swapPanels.checked === true);
check('битые настройки — по умолчанию', (() => { const g3 = boot({ miner_settings: '{"notify":"куда-то","swap":"да"}' }); return g3.run('settings.notify') === 'top-right' && g3.run('settings.swap') === false; })());
check('совсем битые — без ошибок', boot({ miner_settings: 'не json' }).run('settings.notify') === 'top-right');
check('настройки не попадают в сохранение игры', !('settings' in JSON.parse(g2.run('JSON.stringify(createSaveData("t"))'))));

console.log('Кнопка «Управление»');
g = boot();
check('по умолчанию подсказки по управлению скрыты', !g.body.classList.contains('show-controls') && /#controls \{\s*display: none;/.test(html) && /body\.show-controls #controls \{\s*display: block;/.test(html));
check('кнопка «Управление» — под статистикой, рядом с «Персонажем»', /<div id="sideButtons">[\s\S]*?openCharacter\(\)[\s\S]*?toggleControls\(\)">🎮 Управление<\/button>/.test(html));
g.run('toggleControls()');
check('нажал — показаны, кнопка подсвечена', g.body.classList.contains('show-controls') && g.els.controlsToggle.classList.contains('on'));
check('запоминается', boot(g.store).body.classList.contains('show-controls'));
g.run('toggleControls()');
check('ещё раз — скрыты', !g.body.classList.contains('show-controls') && !g.els.controlsToggle.classList.contains('on'));

console.log('Кнопки на телефоне');
g = boot();
check('по умолчанию: средние, полупрозрачные, крестовина слева', g.run('settings.tpSize') === 'medium' && g.run('settings.tpOpacity') === 'half' && g.run('settings.tpSwap') === false &&
    !g.body.classList.contains('tp-small') && !g.body.classList.contains('tp-faint') && !g.body.classList.contains('tp-swap'));
g.run("setTouchPad('size', 'small'); setTouchPad('opacity', 'faint'); setTouchPad('swap', true);");
check('мелкие, почти прозрачные, для левой руки — классы на странице', g.body.classList.contains('tp-small') && g.body.classList.contains('tp-faint') && g.body.classList.contains('tp-swap'));
check('в CSS: левша — крестовина справа, кирка слева', /body\.tp-swap #touchLeft \{ left: auto; right:/.test(html) && /body\.tp-swap #touchRight \{ right: auto; left:/.test(html));
check('крупные ограничены шириной экрана — панели не наезжают', /tp-large \{ --tb: clamp\(40px, calc\(\(100vw - 96px\) \/ 6\)/.test(html));
check('кнопки отодвинуты от краёв — зоны системных жестов', /--edge: 28px;/.test(html) && /#touchLeft \{\s*left: calc\(var\(--edge/.test(html) && /#touchRight \{\s*right: calc\(var\(--edge/.test(html));
check('запоминается', (() => { const g2 = boot(g.store); return g2.body.classList.contains('tp-small') && g2.body.classList.contains('tp-swap'); })());
check('чужие значения — нет', g.run("setTouchPad('size', 'huge')") === false && g.run("setTouchPad('color', 'red')") === false && g.run('settings.tpSize') === 'small');
check('в настройках — только на сенсорном экране', /<div class="setting touch-only">\s*<div class="setting-label">Кнопки на телефоне/.test(html) && /body\.touch \.touch-only \{ display: block; \}/.test(html));

console.log('Телефон');
g = boot({ miner_settings: '{"notify":"bottom-left"}' }, '?touch=1');
g.run('showNotification("x")');
const n = g.notes[g.notes.length - 1];
check('на телефоне «снизу» становится «сверху» (внизу кнопки), ниже сводки', n.style.top === '44px' && n.style.bottom === 'auto' && n.style.left === '20px');

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
