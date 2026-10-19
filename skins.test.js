// Проверки внешнего вида радио и видео: граммофон, простой вид, вынесенный телевизор.
// Запуск: node skins.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
function classList() {
    return { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } };
}
function makeEl(tag) {
    const listeners = {};
    return { tagName: (tag || 'div').toUpperCase(), _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', title: '', className: '', style: {}, children: [], dataset: {}, classList: classList(), offsetLeft: 100, offsetTop: 70,
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {}, querySelector() { return this._head || null; },
        addEventListener(t, f) { listeners[t] = f; }, fire(t, e) { listeners[t] && listeners[t](e); }, setPointerCapture() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); }, width: 800, height: 600 };
}
function boot(store = {}) {
    const els = {}, handlers = {};
    const head = makeEl();
    els.videoPanel = makeEl(); els.videoPanel._head = head;
    const radioBtns = ['plain', 'gramophone'].map(k => Object.assign(makeEl(), { dataset: { skin: k } }));
    const videoBtns = ['plain', 'tv'].map(k => Object.assign(makeEl(), { dataset: { skin: k } }));
    const body = Object.assign(makeEl(), { appendChild() {} });
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: t => makeEl(t), body,
            querySelectorAll: sel => sel.includes('radioSkin') ? radioBtns : sel.includes('videoSkin') ? videoBtns : [] },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: { addEventListener(t, f) { handlers[t] = f; } }, location: { search: '', protocol: 'https:' }, innerWidth: 1366, innerHeight: 800,
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL, encodeURIComponent, String
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), el: id => els[id] || (els[id] = makeEl()), body, head, radioBtns, videoBtns, store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('По умолчанию');
let g = boot();
check('радио и видео — простой вид', g.run('settings.radioSkin') === 'plain' && g.run('settings.videoSkin') === 'plain');
check('граммофона не видно, телевизор без корпуса', !g.body.classList.contains('radio-gramophone') && g.body.classList.contains('video-plain'));
check('кнопки «Простой» подсвечены', g.radioBtns[0].classList.contains('chosen') && g.videoBtns[0].classList.contains('chosen'));

console.log('Граммофон');
g.run('setRadioSkin("gramophone")');
check('включил — граммофон на панели радио', g.body.classList.contains('radio-gramophone') && /body\.radio-gramophone \.gramophone \{\s*display: block/.test(html));
check('кнопка «Граммофон» подсвечена', g.radioBtns[1].classList.contains('chosen') && !g.radioBtns[0].classList.contains('chosen'));
g.run('radioAddStation("Джаз", "https://jazz.example.com/s"); radio.on = true; radioSetStatus("live");');
check('пока играет — пластинка крутится', g.el('radioPanel').classList.contains('playing') && /#radioPanel\.playing \.gr-record \{\s*animation: gr-spin/.test(html));
g.run('radioStop();');
check('выключил — остановилась', !g.el('radioPanel').classList.contains('playing'));
g.run('radio.on = true; radioSetStatus("connecting");');
check('пока подключается — не крутится', !g.el('radioPanel').classList.contains('playing'));
check('при «уменьшить движение» в системе пластинка не крутится', /prefers-reduced-motion: reduce\)[^{]*\{\s*#radioPanel\.playing \.gr-record \{ animation: none; \}/.test(html));
check('неизвестный вид не принимается', g.run('setRadioSkin("патефон")') === false && g.run('settings.radioSkin') === 'gramophone');

console.log('Простой вид видео');
g.run('setVideoSkin("plain")');
g.run('setVideoSkin("tv")');
check('включил телевизор — корпус появился', !g.body.classList.contains('video-plain') && g.videoBtns[1].classList.contains('chosen'));
g.run('setVideoSkin("plain")');
check('простой вид — без корпуса телевизора', g.body.classList.contains('video-plain') && /body\.video-plain \.tv \{[^}]*background: none/.test(html));
check('кнопка «Простой» подсвечена', g.videoBtns[0].classList.contains('chosen'));
g.run('setVideoSkin("tv")');
check('обратно — телевизор', !g.body.classList.contains('video-plain'));

console.log('Хранение');
const store = {};
g = boot(store); g.run('setRadioSkin("gramophone"); setVideoSkin("plain");');
const g2 = boot(store);
check('после перезапуска виды те же', g2.run('settings.radioSkin') === 'gramophone' && g2.run('settings.videoSkin') === 'plain' &&
    g2.body.classList.contains('radio-gramophone') && g2.body.classList.contains('video-plain'));
check('битые значения — по умолчанию (простой)', (() => { const g3 = boot({ miner_settings: '{"radioSkin":"x","videoSkin":5}' }); return g3.run('settings.radioSkin') === 'plain' && g3.run('settings.videoSkin') === 'plain'; })());
check('старые настройки без вида — тоже простой', (() => { const g4 = boot({ miner_settings: '{"notify":"top-left"}' }); return g4.run('settings.videoSkin') === 'plain' && g4.run('settings.notify') === 'top-left'; })());

console.log('Вынести телевизор');
g = boot();
g.run('videoAdd("Ролик", "https://example.com/a.mp4"); videoPanelToggle(true); videoPlay();');
const player = g.el('videoScreen').children[0];
check('⛶ — телевизор вынесен поверх игры', g.run('videoDetachToggle()') === true && g.el('videoPanel').classList.contains('detached'));
check('крупнее, тянется за угол', /#videoPanel\.open\.detached \{[^}]*position: fixed[^}]*width: min\(640px, 92vw\)[^}]*resize: both/.test(html));
check('видео не прервалось — тот же плеер', g.el('videoScreen').children[0] === player && g.run('video.on') === true);
check('кнопка сменилась на «вернуть»', g.el('videoDetachBtn').textContent === '⤓');
g.head.fire('pointerdown', { clientX: 150, clientY: 80, pointerId: 1, target: { closest: () => null } });
g.head.fire('pointermove', { clientX: 400, clientY: 300 });
g.head.fire('pointerup', {});
check('перетаскивается за заголовок', g.el('videoPanel').style.left === '350px' && g.el('videoPanel').style.top === '290px');
g.head.fire('pointermove', { clientX: 900, clientY: 900 });
check('после отпускания не двигается', g.el('videoPanel').style.left === '350px');
check('⤓ — обратно на панель', g.run('videoDetachToggle()') === false && !g.el('videoPanel').classList.contains('detached') && g.el('videoPanel').style.left === '');
g.run('videoDetachToggle(false)');
g.head.fire('pointerdown', { clientX: 150, clientY: 80, pointerId: 2, target: { closest: () => null } });
g.head.fire('pointermove', { clientX: 400, clientY: 300 });
check('на панели заголовок не таскается', g.el('videoPanel').style.left === '');

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
