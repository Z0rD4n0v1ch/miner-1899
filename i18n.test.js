// Проверки английской версии (часть 1): выбор языка, перевод строк и шаблонов,
// все статичные надписи страницы переведены, язык запоминается.
// Запуск: node i18n.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', style: {}, children: [], dataset: {},
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {},
        getContext: () => new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }), width: 800, height: 600 };
}
function boot({ langs, store = {} } = {}) {
    const els = {};
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild() {}, classList: makeEl().classList }, querySelectorAll: () => [] },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL, WeakMap
    };
    if (langs) sb.navigator = { languages: langs, language: langs[0] };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('Выбор языка');
check('русский браузер — русский', boot({ langs: ['ru-RU'] }).run('LANG') === 'ru');
check('украинский, белорусский, казахский — тоже русский', ['uk-UA', 'be', 'kk-KZ'].every(l => boot({ langs: [l] }).run('LANG') === 'ru'));
check('английский, немецкий — английский', boot({ langs: ['en-US'] }).run('LANG') === 'en' && boot({ langs: ['de-DE'] }).run('LANG') === 'en');
check('языка браузера не видно — русский', boot().run('LANG') === 'ru');
let g = boot({ langs: ['en-US'] });
g.run("setLang('ru')");
check('выбрал в настройках — запоминается и важнее браузера', g.run('LANG') === 'ru' && boot({ langs: ['en-US'], store: g.store }).run('LANG') === 'ru');
check('неизвестный язык — нет', g.run("setLang('fr')") === false);
check('в настройках кнопки «Русский» и «English»', /data-lang="ru"[^>]*>Русский<[\s\S]*data-lang="en"[^>]*>English</.test(html));

console.log('Перевод');
g = boot({ langs: ['en-US'] });
check('строка: «Сохранить» → Save', g.run("L('Сохранить')") === 'Save');
check('нет перевода — остаётся как есть', g.run("L('Неведомая строка')") === 'Неведомая строка');
check('шаблон без перевода подставляет значения', g.run('(() => { const n = 5; return L`Нечто ${n} шт.`; })()') === 'Нечто 5 шт.');
g.run("EN_TEXT['Продано: {0} шт. за {1}'] = 'Sold: {0} pcs for {1}';");
check('шаблон с переводом: значения на своих местах', g.run('(() => { const a = 3, b = 24; return L`Продано: ${a} шт. за ${b}`; })()') === 'Sold: 3 pcs for 24');
g.run("setLang('ru')");
check('по-русски шаблон — исходный текст', g.run('(() => { const a = 3, b = 24; return L`Продано: ${a} шт. за ${b}`; })()') === 'Продано: 3 шт. за 24');

console.log('Все надписи страницы переведены');
const body = html.slice(0, html.indexOf('<script>')).replace(/<style>[\s\S]*?<\/style>/, '').replace(/<!--[\s\S]*?-->/g, '');
const texts = [...body.matchAll(/>([^<]+)</g)].map(m => m[1].replace(/\s+/g, ' ').trim()).filter(t => /[А-Яа-яЁё]/.test(t));
const attrs = [...body.matchAll(/(?:placeholder|title|aria-label|alt)="([^"]*[А-Яа-яЁё][^"]*)"/g)].map(m => m[1]);
const skip = new Set(['У', 'Й', 'К', 'Д', 'Е', 'С', 'Р', 'Ь', 'М', 'З', 'Ё', 'Язык · Language', 'Русский']);
const missing = [...new Set([...texts, ...attrs])].filter(t => !skip.has(t) && g.run(`EN_TEXT[${JSON.stringify(t)}] === undefined`));
check(`статичных надписей ${new Set([...texts, ...attrs]).size}, без перевода: ${missing.length}`, missing.length === 0);
if (missing.length) console.log('    нет перевода:', missing.slice(0, 10));
g.run("setLang('en')");
check('название по-английски — Miner 1899', g.run("L('⛏️ Шахтёр 1899')") === '⛏️ Miner 1899');

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
