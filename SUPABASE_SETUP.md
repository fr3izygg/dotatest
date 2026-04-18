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

## 3) Вписать ключи в GitHub Secrets

В Supabase: **Project Settings → API**:
- **Project URL**
- **anon public key**

В GitHub репозитории: **Settings → Secrets and variables → Actions**:
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public key

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

