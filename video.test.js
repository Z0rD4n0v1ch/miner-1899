// Проверки маленького телевизора: разбор ссылок YouTube / RuTube / VK / .mp4, список видео,
// плеер только по «Вкл», клавиша V, хранение, телефон.
// Запуск: node video.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
    return { tagName: (tag || 'div').toUpperCase(), _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', className: '', style: {}, children: [], classList: classList(),
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); }, width: 800, height: 600 };
}
function boot(store = {}, protocol = 'https:') {
    const els = {}, notes = [], handlers = {};
    const body = Object.assign(makeEl(), { appendChild(n) { notes.push(n.textContent); } });
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: t => makeEl(t), body },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: { addEventListener(t, f) { handlers[t] = f; } }, location: { search: '', protocol },
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL, encodeURIComponent, String
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    const el = id => els[id] || (els[id] = makeEl());
    return { run: c => vm.runInContext(c, sb), el, notes, handlers, body, store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('Разбор ссылок');
let g = boot();
const P = url => g.run(`parseVideoUrl(${JSON.stringify(url)})`);
const embed = url => (P(url) || {}).embed;
check('youtube.com/watch?v=', embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1');
check('youtu.be/…', embed('https://youtu.be/dQw4w9WgXcQ?si=abc') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1');
check('m.youtube.com и shorts', embed('https://m.youtube.com/shorts/dQw4w9WgXcQ').includes('/embed/dQw4w9WgXcQ'));
check('youtube /live/', embed('https://www.youtube.com/live/dQw4w9WgXcQ').includes('/embed/dQw4w9WgXcQ'));
check('YouTube — без cookie (youtube-nocookie.com)', embed('https://youtu.be/dQw4w9WgXcQ').startsWith('https://www.youtube-nocookie.com/'));
check('RuTube /video/', embed('https://rutube.ru/video/0123456789abcdef0123456789abcdef/') === 'https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef');
check('RuTube приватное с ключом ?p=', embed('https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=XyZ') === 'https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef?p=XyZ');
check('VK vk.com/video-…_…', embed('https://vk.com/video-22822305_456242119') === 'https://vk.com/video_ext.php?oid=-22822305&id=456242119&hd=2&autoplay=1');
check('VK vkvideo.ru', embed('https://vkvideo.ru/video-1_2') === 'https://vk.com/video_ext.php?oid=-1&id=2&hd=2&autoplay=1');
check('VK ссылка из ленты (?z=video…)', embed('https://vk.com/feed?z=video123_456%2Fabc') === 'https://vk.com/video_ext.php?oid=123&id=456&hd=2&autoplay=1');
check('прямой .mp4', (P('https://example.com/films/mine.mp4') || {}).kind === 'file');
check('.webm тоже', (P('https://example.com/a.webm') || {}).kind === 'file');
check('обычная страница — не видео', P('https://example.com/page') === null);
check('youtube без id — нет', P('https://www.youtube.com/') === null && P('https://www.youtube.com/watch?v=коротко') === null);
check('javascript: — нет', P('javascript:alert(1)') === null);
check('мусор — нет', P('просто текст') === null);

console.log('Список видео');
g = boot();
check('сначала пусто, «Видео нет»', g.run('video.items.length') === 0 && g.el('videoTitleNow').textContent === 'Видео нет');
check('нераспознанная ссылка — понятная ошибка', g.run('videoAdd("x", "https://example.com/page")').includes('YouTube, RuTube, VK'));
check('добавлено с названием', g.run('videoAdd("Про шахтёров", "https://youtu.be/dQw4w9WgXcQ")') === null && g.el('videoTitleNow').textContent === 'Про шахтёров');
check('без названия — по площадке', g.run('videoAdd("", "https://rutube.ru/video/0123456789abcdef0123456789abcdef/")') === null && g.run('video.items[1].title') === 'RuTube 2');
check('повтор — ошибка', g.run('videoAdd("2", "https://youtu.be/dQw4w9WgXcQ")') === 'это видео уже есть');
g.run('videoAdd("<b>жирно</b>", "https://vk.com/video-1_2")');
check('название со знаками разметки — как текст', g.el('videoList').children[2].innerHTML.includes('&lt;b&gt;') && !g.el('videoList').children[2].innerHTML.includes('<b>жирно'));
g.run('for (let i = 0; i < 40; i++) videoAdd("v" + i, "https://example.com/" + i + ".mp4")');
check('не больше 30', g.run('video.items.length') === 30);

console.log('Плеер только по «Вкл»');
g = boot();
g.run('videoAdd("Ролик", "https://youtu.be/dQw4w9WgXcQ"); videoAdd("Файл", "https://example.com/a.mp4");');
check('добавил — плеера ещё нет (в сеть ни шагу)', g.el('videoScreen').children.length === 0 && g.run('video.on') === false);
g.run('videoToggle()');
const ifr = g.el('videoScreen').children[0];
check('«Вкл» — в кинескопе iframe с адресом встраивания', ifr && ifr.tagName === 'IFRAME' && ifr.src.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
check('полноэкранный режим разрешён, адрес страницы отдаётся (нужно YouTube)', ifr.allowFullscreen === true && ifr.referrerPolicy === 'strict-origin-when-cross-origin');
check('кнопка «■ Выкл»', g.el('videoToggle').textContent === '■ Выкл');
g.run('videoSwitch(1)');
const vid = g.el('videoScreen').children[0];
check('▶ — следующее: файл играет в <video> с кнопками', vid.tagName === 'VIDEO' && vid.src === 'https://example.com/a.mp4' && vid.controls === true);
check('в кинескопе всегда один плеер', g.el('videoScreen').children.length === 1);
g.run('videoToggle()');
check('«Выкл» — плеер удалён (видео остановлено)', g.el('videoScreen').children.length === 0 && g.run('video.on') === false);
g.run('videoRemove(0); videoRemove(0);');
check('удалил всё — «Видео нет»', g.el('videoTitleNow').textContent === 'Видео нет');
check('«Вкл» без видео — подсказка', g.run('videoPlay()') === false && g.notes.some(n => n.includes('добавь видео')));

console.log('Клавиша V и панель');
g = boot();
check('сначала телевизор скрыт', !g.el('videoPanel').classList.contains('open'));
g.handlers.keydown({ code: 'KeyV', preventDefault() {} });
check('V — показать', g.el('videoPanel').classList.contains('open'));
g.run('videoAdd("Ролик", "https://youtu.be/dQw4w9WgXcQ"); videoToggle();');
g.handlers.keydown({ code: 'KeyV', preventDefault() {} });
check('V — скрыть; скрытый телевизор выключается', !g.el('videoPanel').classList.contains('open') && g.run('video.on') === false && g.el('videoScreen').children.length === 0);
g.handlers.keydown({ code: 'KeyV', preventDefault() {}, target: { tagName: 'INPUT' } });
check('буква М в поле ввода телевизор не трогает', !g.el('videoPanel').classList.contains('open'));
check('кнопка «Видео (V)» на панели под «Радио»', /radioPanelToggle\(\)">📻 Радио \(M\)<\/button>\s*<button class="btn btn-secondary" onclick="openVideoFromMenu\(\)">📺 Видео \(V\)<\/button>/.test(html));
check('телевизор в левой панели, под кнопками', html.indexOf('id="savePanel"') < html.indexOf('id="videoPanel"') && html.indexOf('id="videoPanel"') < html.indexOf('</aside>'));
check('на телефоне — поверх игры, как радио', /body\.touch #videoPanel\.open \{[^}]*position: fixed/.test(html));

console.log('Из файла на компьютере');
g = boot({}, 'file:');
g.run('videoAdd("Ролик", "https://youtu.be/dQw4w9WgXcQ")');
check('для YouTube предупреждение, что из файла может не показать', g.el('videoNote').textContent.includes('из файла'));
g.run('videoAdd("Ру", "https://rutube.ru/video/0123456789abcdef0123456789abcdef/"); videoSelect(1);');
check('для RuTube предупреждения нет', g.el('videoNote').textContent === 'RuTube');

console.log('Хранение');
const store = {};
g = boot(store);
g.run('videoAdd("Один", "https://youtu.be/dQw4w9WgXcQ"); videoAdd("Два", "https://vk.com/video-1_2"); videoSelect(1);');
const g2 = boot(store);
check('список и выбор запоминаются', g2.run('video.items.length') === 2 && g2.run('video.index') === 1);
check('после перезапуска телевизор выключен', g2.run('video.on') === false && g2.el('videoScreen').children.length === 0);
const g3 = boot({ miner_video: JSON.stringify({ items: [{ title: 'ок', url: 'https://youtu.be/dQw4w9WgXcQ' }, { title: 'плохо', url: 'javascript:1' }, 7], index: 5 }) });
check('испорченные записи отбрасываются', g3.run('video.items.length') === 1 && g3.run('video.index') === 0);
check('битые настройки — без ошибок', boot({ miner_video: 'не json' }).run('video.items.length') === 0);
check('видео не попадают в сохранение игры', !('video' in JSON.parse(g3.run('JSON.stringify(createSaveData("t"))'))));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
