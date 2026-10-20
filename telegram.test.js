// Проверки запуска в Telegram: скрипт Telegram подключается только внутри Telegram,
// игра разворачивается, свайп-закрытие отключается, на телефоне — во весь экран.
// Запуск: node telegram.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
    return { textContent: '', innerHTML: '', value: '', style: {}, children: [], classList: classList(),
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); }, width: 800, height: 600 };
}
function boot(hash) {
    const els = {}, head = makeEl(), body = makeEl();
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body, head },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { addEventListener() {} }, location: { search: '', hash, protocol: 'https:' },
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
    };
    sb.window = Object.assign(sb.window, {});
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), head, body, sb };
}
function fakeTg(version, platform) {
    const calls = [];
    const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); };
    const tg = { platform, calls, isVersionAtLeast: v => cmp(version, v) >= 0 };
    for (const m of ['ready', 'expand', 'disableVerticalSwipes', 'setHeaderColor', 'setBackgroundColor', 'requestFullscreen', 'enableClosingConfirmation', 'onEvent'])
        tg[m] = (...a) => calls.push(m);
    return tg;
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('Вне Telegram');
let g = boot('');
check('скрипт Telegram не подключается — игра никуда не обращается', g.head.children.length === 0 && g.run('inTelegram()') === false);
g = boot('#save=1');
check('посторонний # в адресе — тоже нет', g.head.children.length === 0);

console.log('В Telegram');
g = boot('#tgWebAppData=query_id%3DAA&tgWebAppVersion=8.0&tgWebAppPlatform=android');
check('Telegram передал параметры — подключается telegram-web-app.js', g.head.children.length === 1 && g.head.children[0].src === 'https://telegram.org/js/telegram-web-app.js');
let tg = fakeTg('8.0', 'android');
g.run('setupTelegram')(tg);
check('сообщает Telegram, что готова, и разворачивается', tg.calls.includes('ready') && tg.calls.includes('expand'));
check('свайп вниз не закрывает игру (мешал бы копать вниз)', tg.calls.includes('disableVerticalSwipes'));
check('на телефоне — во весь экран', tg.calls.includes('requestFullscreen'));
check('переспрашивает перед закрытием', tg.calls.includes('enableClosingConfirmation'));
check('цвета шапки под игру', tg.calls.includes('setHeaderColor'));
check('на странице класс telegram — отступ от кнопок Telegram', g.body.classList.contains('telegram') && /body\.telegram \{[^}]*--tg-content-safe-area-inset-top/.test(html));
tg = fakeTg('8.0', 'tdesktop'); g.run('setupTelegram')(tg);
check('на компьютере во весь экран не переключает', !tg.calls.includes('requestFullscreen') && tg.calls.includes('expand'));
tg = fakeTg('6.0', 'android'); g.run('setupTelegram')(tg);
check('старый Telegram: только ready и expand, без ошибок', tg.calls.includes('ready') && !tg.calls.includes('disableVerticalSwipes') && !tg.calls.includes('requestFullscreen'));
check('нет объекта Telegram — без ошибок', g.run('setupTelegram(undefined)') === false);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
