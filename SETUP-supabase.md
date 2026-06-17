# クラウド同期（ログイン）セットアップ手順

「どの端末でもログインして同じデータ」を使うための初期設定です（最初の1回だけ・約5分）。

## 1. Supabase でプロジェクトを作る
1. https://supabase.com にアクセス →「Start your project」→ GitHub か メールで無料登録
2. 「New project」をクリック
   - Name: 何でもOK（例: intern-checker）
   - Database Password: 自動生成のままでOK（メモ不要）
   - Region: Northeast Asia (Tokyo) がおすすめ
3. 作成完了まで1〜2分待つ

## 2. データの保存場所（テーブル）を作る
左メニュー「SQL Editor」→「New query」に下記を貼り付けて「Run」:

```sql
create table if not exists public.schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.schedules enable row level security;

create policy "own select" on public.schedules
  for select using (auth.uid() = user_id);
create policy "own insert" on public.schedules
  for insert with check (auth.uid() = user_id);
create policy "own update" on public.schedules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.schedules
  for delete using (auth.uid() = user_id);
```

これで「ログインした本人だけが自分のデータを読み書きできる」状態になります。

## 3.（推奨）メール確認を OFF にして登録を簡単にする
左メニュー「Authentication」→「Sign In / Providers」→「Email」を開き、
「Confirm email」を **OFF** にして保存。
（OFFにすると、新規登録した瞬間にそのままログインできます。ONのままだと確認メールのリンクを開く必要があります）

## 4. 接続情報をコピーする
左メニュー「Project Settings（歯車）」→「API」:
- **Project URL**（例: https://xxxx.supabase.co）
- **anon public** key（`eyJ...` で始まる長い文字列）

この2つは公開しても安全な値です。

## 5. アプリに貼り付ける
公開URL（下記）を開くと「初期設定」画面が出ます。
4でコピーした2つを貼り付けて「保存して続ける」→ メール/パスワードで新規登録 → 完了。

https://2422512b-kohei.github.io/kkm-lp/intern-checker.html

以後はどのスマホ・PCからでも、同じメール/パスワードでログインすれば同じデータが出ます。
