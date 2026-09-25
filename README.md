# CRM-Time — фазы 1–14 (MVP ship)

Мини-CRM «швейцарский нож»: **канал → AI-процесс (модель на слоте) → действие**, плюс входящие, контакт и очередь лидов. Русский UI, палитра `#F2F2F2` / `#99CCFF` / `#C5E2FF` / `#DAF2D0`, шрифт Calibri (Carlito).

Приёмка: критерии в ТЗ MVP (`docs/tz-mvp.md` в Agent Store) + решения владельца 9–25. Холст линейный, чат/Telegram/почта, явная модель vs дефолт = «срочно» человеку, Compose, `DEPLOY_MODE`.

**Вне MVP (не делаем):** WhatsApp, неофициальный MAX API, VK, n8n-граф, Bitrix/Amo sync, биллинг, телефония, Диадoc, 18 модулей ТЗ 9.0.

## Быстрый старт (разработка)

```bash
cp .env.example .env
# APP_SECRET — длинная случайная строка (обязательно)
# DATABASE_URL — см. таблицу ниже

docker compose up db -d          # только PostgreSQL (или свой Postgres 16)
npm install
npx prisma migrate deploy
npm run dev                      # http://localhost:3000
```

Регистрация владельца → онбординг → холст `/flow`.

### Приёмка (API, фазы 1–14)

Сервер должен слушать `:3000`:

```bash
npm run test:phase1    # e2e-phase1.mjs + e2e-phase2.mjs (маркеры phase3…phase14)
npm run test:ship      # алиас на test:phase1
npm run test:phase2    # только фаза 2–14 (e2e-phase2.mjs)
```

## Docker Compose (web + Postgres)

```bash
cp .env.example .env
docker compose config          # валидность: postgres:16, порт 3000
docker compose up --build      # web + PostgreSQL, если сборка образа проходит
```

Откройте http://localhost:3000.

На **overlayfs** (часть облачных VM) `docker compose build` / `up --build` часто падает с `invalid argument`. **Это не «зелёная» сборка образа — её нельзя подменить успехом API-тестов.** Обход:

```bash
docker compose up db -d
# DATABASE_URL=postgresql://crm:crm@localhost:5432/crm в .env
npm install && npx prisma migrate deploy && npm run dev
```

## Переменные окружения

| Переменная | Смысл |
|---|---|
| `DEPLOY_MODE=saas` | много воркспейсов, публичная регистрация |
| `DEPLOY_MODE=box` | после первого владельца регистрация закрыта, **один воркспейс**, в настройках «данные на этой машине» |
| `APP_URL` | базовый URL приложения (сниппеты, ссылки) |
| `PUBLIC_URL` | HTTPS для Telegram webhook; кнопка «Перерегистрировать webhook» на слоте. Если пусто — опрос `getUpdates` |
| `APP_SECRET` | JWT и шифрование секретов каналов (**обязательно**) |
| `DATABASE_URL` | Postgres; в Compose для `web` — `postgresql://crm:crm@db:5432/crm`; локально — `@localhost:5432` |
| `JEV_API_KEY` / `QWEN_API_KEY` / `OPENAI_API_KEY` | провайдеры LLM; без ключей слот серый, для тестов есть `mock:ok` |
| `JEV_BASE_URL`, `JEV_MODELS`, … | опционально, см. `.env.example` |
| `CBR_XML_URL` | курс ЦБ; пусто — XML с cbr.ru, кэш сутки |
| `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`, … | опционально: опрос входящей почты; иначе только HTTP ingest |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | **опционально**: исходящая почта из CRM и письмо менеджеру при назначении лида; без SMTP — тред во входящих |

## Как собрать цепочку

1. Палитра на холсте: **Чат на сайте**, **Telegram**, **Форма**, **Почта** → **Разобрать** → **Черновик** / **Пинг** → **Создать лид**. Несколько именованных линейных цепочек — чипы над холстом. Короткая форма — имя, телефон, «написать в чат», не анкета ТН ВЭД.
2. На AI-слоте — **явная** модель. Пусто / дефолт воркспейса → сразу **срочно** менеджеру; лид с формы создаётся всё равно, чат — когда карточка полная. Вкладка «Процесс → модель»: промт МАКС, проверка модели (сырой ответ).
3. Канал: сниппет embed, тест, Telegram token + webhook или опрос, почта ingest + mailto. Очередь и карточки — CSV/PDF/печать. 152-ФЗ на форме и чате (текст в настройках). Allowlist доменов для embed.
4. **Приём заявки — диалог** (виджет `/c/{key}`, Telegram). После «Итоговые данные» — лид «Новый», коммерческий черновик только по **Отправить**. Пинг после SLA — кнопка; авто только при явной модели на слоте пинга.
5. **Настройки:** SLA, пинг, пул/круг, webhook на лид «Новый» (журнал + retry), API-ключи read-only `/api/v1/leads|contacts`, лимит ingest, экспорт/импорт JSON, рабочие часы, чеклист на холсте до первого лида.

`deep_analysis` без env-ключа серый — цепочку не ломает.

## Ветка и документация

- Код MVP: ветка `cursor/mvp-phase1-25eb`
- Чеклист поставки: Agent Store `docs/ship-checklist.md`
- Репозиторий: https://github.com/sdvirk-tech/CRM-Time
