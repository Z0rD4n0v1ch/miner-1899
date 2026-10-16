#!/usr/bin/env bash
# Выпуск Miner 1899 v1.3.0: рюкзак и лавка.
# Запускать из папки репозитория miner-1899 (в Git Bash):
#   bash release-v1.3.0.sh
# Перед запуском положи в эту папку index.html и inventory.test.js из архива.

set -e
TAG="v1.3.0"

ask() {  # ask "вопрос" -> 0 если ответили y
    read -r -p "$1 (y/N): " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]]
}

echo "== 1. Проверка папки"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Это не git-репозиторий. Перейди в папку miner-1899 и запусти снова."; exit 1
fi
for f in index.html inventory.test.js; do
    [[ -f "$f" ]] || { echo "Нет файла $f. Скопируй его из архива в эту папку."; exit 1; }
done
if ! grep -q "GAME_VERSION = '1.3.0'" index.html; then
    echo "index.html не версии 1.3.0 — похоже, скопирован старый файл."; exit 1
fi
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Тег $TAG уже существует. Выпуск, видимо, уже сделан."; exit 1
fi

echo "== 2. Тесты"
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js не найден, тесты не запустить."
    ask "Выпустить без тестов?" || exit 1
else
    FAILED=""
    for t in inventory.test.js gen.test.js game.test.js; do
        [[ -f "$t" ]] || continue
        echo "-- $t"
        node "$t" || FAILED="$FAILED $t"
    done
    if [[ -n "$FAILED" ]]; then
        echo
        echo "Упали:$FAILED"
        echo "Для game.test.js это ожидаемо: он проверяет старые stats.gold/stats.gems и SAVE_VERSION 2."
        echo "Пришли game.test.js Claude, чтобы обновить проверки."
        ask "Всё равно выпустить?" || exit 1
    fi
fi

echo "== 3. Коммит"
git add index.html inventory.test.js
if git diff --cached --quiet; then
    echo "Изменений нет — нечего коммитить."; exit 1
fi
git commit -m "v1.3.0: рюкзак и лавка" \
    -m "- рюкзак на 20 единиц руды, при переполнении руда теряется
- лавка на поверхности: продажа при подходе (золото 10, алмаз 50, рубин 100 руб.)
- интерфейс: рюкзак с полоской заполнения и деньги вместо счётчиков золота/гемов
- SAVE_VERSION 3, миграция сохранений v2 -> v3
- inventory.test.js: 39 проверок"
git tag -a "$TAG" -m "Miner 1899 $TAG — рюкзак и лавка"

echo "== 4. Отправка на GitHub"
git push origin HEAD
git push origin "$TAG"

echo
echo "Готово: $TAG на GitHub."
