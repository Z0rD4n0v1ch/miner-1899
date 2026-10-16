#!/usr/bin/env bash
#
# sync.sh — синхронизация проекта Miner 1899 с GitHub
#
# Использование:
#   ./sync.sh doctor            проверить готовность (запусти первым)
#   ./sync.sh init              первая загрузка проекта на GitHub
#   ./sync.sh push [сообщение]  закоммитить правки и отправить
#   ./sync.sh release 1.2.0     выпустить версию: bump + тег + push
#   ./sync.sh pull              забрать изменения с GitHub
#   ./sync.sh status            что происходит: ветка, коммиты, теги
#   ./sync.sh help              эта справка
#
# Переменные окружения (все необязательные):
#   GITHUB_USER   ник на GitHub (по умолчанию Z0rD4n0v1ch)
#   REPO_NAME     имя репозитория (по умолчанию — имя папки проекта)
#   USE_HTTPS=1   использовать HTTPS вместо SSH
#   GAME_FILE     файл игры (по умолчанию miner-1899.html)
#

set -euo pipefail

GITHUB_USER="${GITHUB_USER:-Z0rD4n0v1ch}"
REPO_NAME="${REPO_NAME:-$(basename "$(pwd)")}"
BRANCH="${BRANCH:-main}"
GAME_FILE="${GAME_FILE:-miner-1899.html}"

if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'
    C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
    C_OK=''; C_ERR=''; C_WARN=''; C_DIM=''; C_BOLD=''; C_OFF=''
fi

ok()    { printf '%s✓%s %s\n' "$C_OK" "$C_OFF" "$1"; }
err()   { printf '%s✗%s %s\n' "$C_ERR" "$C_OFF" "$1" >&2; }
warn()  { printf '%s!%s %s\n' "$C_WARN" "$C_OFF" "$1"; }
info()  { printf '%s→%s %s\n' "$C_DIM" "$C_OFF" "$1"; }
head_() { printf '\n%s%s%s\n' "$C_BOLD" "$1" "$C_OFF"; }
die()   { err "$1"; exit 1; }

# ---------- вспомогательное ----------

require_git() {
    command -v git >/dev/null 2>&1 || die "Git не установлен. Поставь с https://git-scm.com/downloads и перезапусти терминал."
}

require_repo() {
    require_git
    git rev-parse --git-dir >/dev/null 2>&1 || die "Текущая папка — не git-репозиторий. Перейди в папку проекта: cd ~/Downloads/miner-1899"
}

remote_url() {
    if git remote get-url origin >/dev/null 2>&1; then
        git remote get-url origin
    elif [ "${USE_HTTPS:-0}" = "1" ]; then
        echo "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
    else
        echo "git@github.com:${GITHUB_USER}/${REPO_NAME}.git"
    fi
}

has_origin() { git remote get-url origin >/dev/null 2>&1; }

require_clean_or_commit() {
    if [ -n "$(git status --porcelain)" ]; then
        warn "Есть незакоммиченные изменения — они войдут в коммит."
    fi
}

current_branch() {
    local br
    br="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
    if [ -z "$br" ] || [ "$br" = "HEAD" ]; then
        echo "$BRANCH"
    else
        echo "$br"
    fi
}

# ---------- status ----------

cmd_status() {
    require_repo
    head_ "Состояние проекта"

    printf 'Папка:      %s\n' "$(pwd)"
    printf 'Ветка:      %s\n' "$(current_branch)"

    if has_origin; then
        printf 'Remote:     %s\n' "$(remote_url)"
    else
        printf 'Remote:     %sне привязан%s\n' "$C_WARN" "$C_OFF"
    fi

    local local_head remote_head
    local_head="$(git rev-parse --short HEAD 2>/dev/null || echo '—')"
    printf 'Последний:  %s %s\n' "$local_head" "$(git log -1 --pretty=%s 2>/dev/null || echo '')"

    head_ "Локальные теги"
    if [ -n "$(git tag)" ]; then
        git tag --sort=-v:refname | sed 's/^/  /'
    else
        info "тегов нет"
    fi

    if has_origin; then
        head_ "Незакоммиченные правки"
        if [ -z "$(git status --porcelain)" ]; then
            ok "рабочее дерево чистое"
        else
            git status --short | sed 's/^/  /'
        fi

        head_ "Расхождение с GitHub"
        if git fetch origin "$BRANCH" --quiet 2>/dev/null; then
            local ahead behind
            ahead="$(git rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null || echo 0)"
            behind="$(git rev-list --count "HEAD..origin/${BRANCH}" 2>/dev/null || echo 0)"
            printf '  Отправить (ahead):  %s\n' "$ahead"
            printf '  Забрать (behind):   %s\n' "$behind"
            if [ "$ahead" = "0" ] && [ "$behind" = "0" ]; then
                ok "локально и на GitHub всё совпадает"
            fi
        else
            warn "не удалось связаться с origin (нет сети, нет доступа или репозиторий не создан)"
        fi
    fi
}

# ---------- doctor ----------

cmd_doctor() {
    head_ "Проверка готовности"
    local problems=0

    # 1. git
    if command -v git >/dev/null 2>&1; then
        ok "git установлен: $(git --version | awk '{print $3}')"
    else
        err "git не найден — установи с https://git-scm.com/downloads"
        problems=$((problems+1))
    fi

    # 2. в репозитории ли мы
    if git rev-parse --git-dir >/dev/null 2>&1; then
        ok "внутри git-репозитория: $(git rev-parse --show-toplevel)"
    else
        err "текущая папка не git-репозиторий"
        problems=$((problems+1))
    fi

    # 3. имя и почта
    local uname_ uemail_
    uname_="$(git config user.name || true)"
    uemail_="$(git config user.email || true)"
    if [ -n "$uname_" ]; then
        ok "user.name: $uname_"
    else
        err "user.name не задан → git config --global user.name \"Твой Ник\""
        problems=$((problems+1))
    fi
    if [ -n "$uemail_" ]; then
        ok "user.email: $uemail_"
    else
        err "user.email не задан → git config --global user.email \"твоя@почта\""
        problems=$((problems+1))
    fi

    # 4. remote
    if has_origin; then
        ok "origin: $(remote_url)"
    else
        warn "origin не привязан — это нормально до первого ./sync.sh init"
    fi

    # 5. доступ к GitHub
    local url; url="$(remote_url)"
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
        ok "GitHub CLI авторизован: $(gh api user --jq .login 2>/dev/null || echo 'аккаунт активен')"
    elif [[ "$url" == git@* ]]; then
        info "проверяю SSH-доступ к github.com..."
        if ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
            ok "SSH-доступ работает"
        else
            err "SSH не отвечает приветствием. Проверь ключ: ssh -T git@github.com"
            problems=$((problems+1))
        fi
    elif [[ "$url" == https://* ]]; then
        info "используется HTTPS — при push потребуется Personal Access Token со scope repo"
    fi

    # 6. рабочее дерево
    if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
        ok "рабочее дерево чистое"
    else
        warn "есть незакоммиченные изменения ($(git status --porcelain | wc -l | tr -d ' ') шт.)"
    fi

    # 7. лишние файлы
    local junk
    junk="$(git status --porcelain --ignored 2>/dev/null | grep -c '^!!' || true)"
    if [ "${junk:-0}" -gt 0 ]; then
        info "игнорируется файлов: $junk (норма — сохранения и мусор ОС)"
    fi

    head_ "Итог"
    if [ "$problems" -eq 0 ]; then
        ok "всё готово. Дальше: ./sync.sh init (первый раз) или ./sync.sh push"
    else
        err "проблем: $problems — исправь их и запусти doctor снова"
        exit 1
    fi
}

# ---------- init ----------

cmd_init() {
    require_repo
    head_ "Первая загрузка на GitHub"

    if has_origin; then
        local cur; cur="$(git remote get-url origin)"
        if [ "$cur" = "$(remote_url)" ]; then
            ok "origin уже указывает куда нужно: $cur"
        elif [[ "$cur" == *github.com* ]] || [ "${FORCE_REMOTE:-0}" = "1" ]; then
            info "меняю адрес origin: $cur → $(remote_url)"
            git remote set-url origin "$(remote_url)"
        else
            warn "origin указывает на $cur — оставляю как есть"
            info "перезаписать принудительно: FORCE_REMOTE=1 ./sync.sh init"
        fi
    else
        git remote add origin "$(remote_url)"
        ok "origin привязан: $(remote_url)"
    fi

    # ветка main
    local br; br="$(current_branch)"
    if [ "$br" != "$BRANCH" ]; then
        info "переименовываю ветку $br → $BRANCH"
        git branch -M "$BRANCH"
    fi

    # есть ли коммиты вообще
    if ! git rev-parse HEAD >/dev/null 2>&1; then
        info "коммитов нет — создаю первый"
        git add -A
        git commit -q -m "feat: первая версия проекта"
    else
        require_clean_or_commit
    fi

    head_ "Отправка"
    info "git push -u origin $BRANCH --tags"
    if git push -u origin "$BRANCH" --tags; then
        ok "проект загружен: https://github.com/${GITHUB_USER}/${REPO_NAME}"
    else
        err "push не удался. Частые причины:"
        printf '   • репозиторий не создан на GitHub → https://github.com/new (без README)\n'
        printf '   • нет прав на запись → проверь токен (scope repo) или SSH-ключ\n'
        printf '   • на GitHub уже есть коммиты → ./sync.sh pull, затем повтори\n'
        exit 1
    fi

    # тегов на GitHub может не быть, если их нет локально
    local remote_tags; remote_tags="$(git ls-remote --tags origin 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$remote_tags" = "0" ]; then
        warn "на GitHub нет ни одного тега — выпусти первый релиз: ./sync.sh release 1.0.0"
    else
        ok "тегов на GitHub: $remote_tags"
    fi
}

# ---------- push ----------

cmd_push() {
    require_repo
    local message="${1:-}"

    if [ -z "$(git status --porcelain)" ]; then
        info "изменений нет, коммитить нечего"
    else
        if [ -z "$message" ]; then
            head_ "Что изменилось"
            git status --short | sed 's/^/  /'
            printf '\n'
            read -r -p "Сообщение коммита (например «fix: физика прыжка»): " message
            [ -n "$message" ] || die "Пустое сообщение — отменяю."
        fi
        git add -A
        git commit -q -m "$message"
        ok "коммит создан: $message"
    fi

    if ! has_origin; then
        die "origin не привязан. Сначала выполни: ./sync.sh init"
    fi

    info "отправляю в origin/$BRANCH..."
    git push origin "$BRANCH"
    ok "отправлено"
}

# ---------- pull ----------

cmd_pull() {
    require_repo
    has_origin || die "origin не привязан. Сначала: ./sync.sh init"

    if [ -n "$(git status --porcelain)" ]; then
        die "Есть незакоммиченные правки — сначала ./sync.sh push, иначе pull перетрёт их."
    fi

    head_ "Получение изменений"
    git fetch origin --prune
    git pull --rebase origin "$BRANCH"
    ok "локальная копия обновлена"
}

# ---------- release ----------

cmd_release() {
    require_repo
    local version="${1:-}"
    if [ -z "$version" ]; then
        die "Укажи версию: ./sync.sh release 1.2.0  (SemVer: MAJOR.MINOR.PATCH)"
    fi
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        die "Версия «$version» не похожа на SemVer. Нужен формат 1.2.0"
    fi

    local tag="v${version}"
    if git rev-parse "$tag" >/dev/null 2>&1; then
        die "Тег $tag уже существует. Выбери другую версию."
    fi

    head_ "Выпуск версии $version"

    # 1. версия игры в $GAME_FILE
    # Без файла игры выпуск останавливается: иначе тег встал бы на код со старой версией
    [ -f "$GAME_FILE" ] || die "Не найден файл игры $GAME_FILE. Запускай из папки проекта или укажи GAME_FILE=..."
    local old_version
    old_version="$(grep -oP "GAME_VERSION\s*=\s*'\K[^']+" "$GAME_FILE" | head -1 || true)"
    if [ -n "$old_version" ]; then
        if [ "$old_version" = "$version" ]; then
            info "GAME_VERSION уже $version"
        else
            sed -i.bak "s/const GAME_VERSION = '[^']*'/const GAME_VERSION = '${version}'/" "$GAME_FILE"
            rm -f "$GAME_FILE.bak"
            sed -i.bak "s/\(font-weight:normal\">v\)[0-9.]*/\1${version}/" "$GAME_FILE"
            rm -f "$GAME_FILE.bak"
            ok "GAME_VERSION: $old_version → $version"
        fi
    else
        warn "GAME_VERSION в $GAME_FILE не найден — пропускаю"
    fi

    # 2. запись в CHANGELOG
    if [ -f CHANGELOG.md ]; then
        if grep -q "^## \[${version}\]" CHANGELOG.md; then
            ok "запись для $version в CHANGELOG есть"
        else
            warn "в CHANGELOG.md нет раздела ## [${version}]"
            printf '  Добавь перед коммитом, например:\n'
            printf '    ## [%s] — %s\n    ### Добавлено\n    - ...\n\n' "$version" "$(date +%F)"
            read -r -p "  Продолжить без записи в CHANGELOG? [y/N] " answer
            [[ "$answer" =~ ^[Yy]$ ]] || die "Отменено. Допиши CHANGELOG и запусти заново."
        fi
    fi

    # 3. коммит правок
    if [ -n "$(git status --porcelain)" ]; then
        git add -A
        git commit -q -m "chore: версия ${version}"
        ok "коммит версии создан"
    else
        info "незакоммиченных правок нет"
    fi

    # 4. тег
    git tag -a "$tag" -m "Release ${version}"
    ok "тег $tag создан"

    # 5. push
    if has_origin; then
        info "отправляю ветку и теги..."
        git push origin "$BRANCH"
        git push origin "$tag"
        ok "версия $version на GitHub: https://github.com/${GITHUB_USER}/${REPO_NAME}/releases/tag/${tag}"
        printf '\n%sДальше:%s Releases → Draft a new release → выбрать тег %s и вставить описание из CHANGELOG\n' "$C_DIM" "$C_OFF" "$tag"
    else
        warn "origin не привязан — тег создан локально. Выполни ./sync.sh init"
    fi

    if command -v gh >/dev/null 2>&1; then
        printf '%sИли одной командой:%s gh release create %s --title "Miner 1899 %s" --notes-from-tag\n' "$C_DIM" "$C_OFF" "$tag" "$version"
    fi
}

# ---------- help ----------

cmd_help() {
    printf '%sMiner 1899 — синхронизация с GitHub%s\n\n' "$C_BOLD" "$C_OFF"
    printf 'Запускать из папки проекта.\n\n'
    printf '  %s./sync.sh doctor%s            проверить готовность (git, ключи, доступ)\n' "$C_BOLD" "$C_OFF"
    printf '  %s./sync.sh init%s              первая загрузка на GitHub\n' "$C_BOLD" "$C_OFF"
    printf '  %s./sync.sh push%s "сообщение"  закоммитить и отправить\n' "$C_BOLD" "$C_OFF"
    printf '  %s./sync.sh release%s 1.2.0     выпустить версию: bump + тег + push\n' "$C_BOLD" "$C_OFF"
    printf '  %s./sync.sh pull%s              забрать изменения с GitHub\n' "$C_BOLD" "$C_OFF"
    printf '  %s./sync.sh status%s            ветка, коммиты, теги, расхождение\n' "$C_BOLD" "$C_OFF"
    printf '\nНастройка (переменные окружения):\n'
    printf '  GITHUB_USER=%s   REPO_NAME=%s   USE_HTTPS=1\n\n' "$GITHUB_USER" "$REPO_NAME"
    printf 'Обычный день:\n'
    printf '  ./sync.sh push "feat: улучшаемые кирки"\n'
}

# ---------- точка входа ----------

case "${1:-help}" in
    doctor)  cmd_doctor ;;
    init)    shift; cmd_init "$@" ;;
    push)    shift; cmd_push "$@" ;;
    release) shift; cmd_release "$@" ;;
    pull)    shift; cmd_pull "$@" ;;
    status)  cmd_status ;;
    help|-h|--help) cmd_help ;;
    *)
        err "Неизвестная команда: $1"
        printf '\n'
        cmd_help
        exit 1
        ;;
esac
