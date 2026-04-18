# Общая «БД» для всех устройств (Supabase)

GitHub Pages не умеет хранить общее состояние игры между разными телефонами/ПК. Для общей игры нужен бэкенд. Самый простой вариант без своего сервера — **Supabase** (Postgres + Realtime).

## 1) Создать проект Supabase

1. Открой `https://supabase.com/` → зарегистрируйся → **New project**.
2. Дождись, пока база поднимется.

## 2) Создать таблицу rooms

В Supabase открой **SQL Editor** и выполни:

```sql
create table if not exists public.rooms (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Включаем Realtime для таблицы (через публикацию supabase_realtime)
alter publication supabase_realtime add table public.rooms;

-- Разрешаем чтение/запись без авторизации (для игры по ссылке)
alter table public.rooms enable row level security;

create policy "rooms read"
on public.rooms for select
to anon
using (true);

create policy "rooms write"
on public.rooms for insert
to anon
with check (true);

create policy "rooms update"
on public.rooms for update
to anon
using (true)
with check (true);
```

### 2a) Таблица для пресетов вопросов

Для сохранения наборов вопросов (пресетов) выполни:

```sql
create table if not exists public.question_presets (
  id text primary key,
  name text not null,
  questions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Включаем Realtime для таблицы
alter publication supabase_realtime add table public.question_presets;

-- Разрешаем чтение/запись без авторизации
alter table public.question_presets enable row level security;

create policy "presets read"
on public.question_presets for select
to anon
using (true);

create policy "presets write"
on public.question_presets for insert
to anon
with check (true);

create policy "presets update"
on public.question_presets for update
to anon
using (true)
with check (true);
```

### 2b) Функция «не затирать сброс» (обязательно после первого деплоя с сетью)

Иначе старая вкладка/телефон может снова записать **прошлое** состояние в `rooms` после нажатия **«Сброс»** у админа.

В **SQL Editor** выполни:

```sql
create or replace function public.upsert_room_state(p_id text, p_state jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.rooms (id, state, updated_at)
  values (p_id, p_state, now())
  on conflict (id) do update set
    state = case
      when coalesce((public.rooms.state->>'gameEpoch')::bigint, 0)
           <= coalesce((excluded.state->>'gameEpoch')::bigint, 0)
      then excluded.state
      else public.rooms.state
    end,
    updated_at = case
      when coalesce((public.rooms.state->>'gameEpoch')::bigint, 0)
           <= coalesce((excluded.state->>'gameEpoch')::bigint, 0)
      then now()
      else public.rooms.updated_at
    end;
end;
$$;

grant execute on function public.upsert_room_state(text, jsonb) to anon;
grant execute on function public.upsert_room_state(text, jsonb) to authenticated;
```

## 3) Вписать ключи в GitHub Secrets

В Supabase: **Project Settings → API**:
- **Project URL**
- публичный клиентский ключ:
  - либо **Publishable key** (`sb_publishable_...`)
  - либо (если вдруг будут странные ошибки в браузере) **Legacy anon key** — длинный JWT, обычно начинается с `eyJ...` (вкладка **Legacy API keys**)

В GitHub репозитории: **Settings → Secrets and variables → Actions**:
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = publishable **или** legacy `anon` (оба подходят для клиента)

После добавления/изменения секретов обязательно **пересобери сайт** (ещё один push или **Actions → Run workflow**), иначе на GitHub Pages останется старая сборка **без** ключей.

## 4) Локально (для dev)

Создай файл `.env.local` в корне проекта:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Запуск:

```bash
npm install
npm run dev
```

## 5) Как пользоваться

На экране входа появился **«Код комнаты»**. Чтобы все видели одну игру:
- у всех должен быть **одинаковый** код (например `main`).

## 6) Быстрая диагностика «не синхронится телефон/ПК»

1. **Одинаковый код комнаты** на телефоне и ПК (без пробелов).
2. В Supabase открой **Table Editor → rooms** и сделай любое действие в игре на ПК (например зайди в лобби как игрок):
   - должна появиться/обновиться строка с `id = твой_код_комнаты`.
   - если строки нет — запросы из браузера не доходят (ключи/политики/не та сборка на Pages).
3. На телефоне в Chrome: **⋮ → Дополнительные инструменты → Консоль разработчика** (или подключи remote debugging) и посмотри ошибки вида:
   - `rooms select error` / `upsert error` / `401` / `JWT` — почти всегда проблема с **ключом** или **URL**.
4. Убедись, что SQL из шага 2 выполнился **без ошибок** (особенно `alter publication ... add table public.rooms`).

