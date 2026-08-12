# MindSpace 云同步 — Supabase 配置指南

只需一个 **免费** Supabase 项目，约 2 分钟。完成后在 App 的「同步」面板里填一次地址与 key，
电脑和手机登录同一账号即可自动同步。

> 同步范围：仅「生活记录」与「FIRE 规划」两类个人数据。股市行情每端各自的实时接口拉取，不互传。

---

## 1. 新建项目
1. 打开 https://supabase.com ，用 GitHub 登录，New project。
2. 填名称（如 `mindspace`），设置数据库密码，地区选离你近的，**Create project**。

## 2. 建数据表（复制下面 SQL 执行）
进入项目左侧 **SQL Editor → New query**，粘贴并运行：

```sql
create table if not exists mindspace_sync (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz default now()
);

alter table mindspace_sync enable row level security;

create policy "own row read"   on mindspace_sync for select using (auth.uid() = user_id);
create policy "own row write"  on mindspace_sync for insert with check (auth.uid() = user_id);
create policy "own row update" on mindspace_sync for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

> RLS（行级安全）保证每个用户只能读写自己的那一行。anon key 是**公开键**，
> 配合 RLS 是标准安全做法，可放心放在客户端。

## 3. 开启邮箱登录
左侧 **Authentication → Providers → Email**，确认 **Email** 已开启（默认开）。
（如需免邮箱，可在 Authentication → Providers 开启 **Anonymous**，
并把 App 登录逻辑改为 `signInAnonymously()`，可按需自行改造。）

## 4. 复制凭据
左侧 **Project Settings → API**：
- `Project URL` → 即 App 里的 **Supabase URL**
- `anon public` key → 即 App 里的 **Anon Key**

## 5. 在 App 里连接
1. 打开 MindSpace（任意已部署地址或本地），点右上角 **☁ 同步**。
2. 粘贴 URL 与 Anon Key → 保存并连接。
3. 用同一邮箱注册/登录（两台设备用**同一个**邮箱）。
4. 首次登录会自动「拉取云端」；若云端为空则推送本机。之后开启「自动同步」即双向实时同步。

---

## 数据冲突说明
采用「后写覆盖」（last-write-wins）：本地改动防抖 1.2 秒后推送，覆盖云端同字段；
拉取时覆盖本机。适合个人单用户、基本在线的使用场景。
如需更严格的合并，可后续在 `sync.js` 中改为按字段时间戳合并。
