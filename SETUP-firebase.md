# Googleログイン＋クラウド同期 セットアップ手順（Firebase）

「Googleでログインすれば、どの端末でも同じデータ」を使うための初期設定です（最初の1回だけ）。
むずかしく見えますが、ほぼ「ボタンを押すだけ」です。

## 1. Firebase プロジェクトを作る
1. https://console.firebase.google.com を開く（自分のGoogleアカウントでログイン）
2. 「プロジェクトを追加」→ 名前を入力（例: intern）→ 続行
3. Googleアナリティクスは「無効」でOK → 「プロジェクトを作成」→ 1分ほど待つ

## 2. Googleログインを有効にする（トグル1つ）
左メニュー「構築 > Authentication」→「始める」
→ 上の「Sign-in method」タブ →「Google」を選ぶ →「有効にする」をON
→ 「プロジェクトのサポートメール」に自分のメールを選択 →「保存」

## 3. データベース（Firestore）を作る
左メニュー「構築 > Firestore Database」→「データベースの作成」
→ ロケーションは「asia-northeast1（東京）」→「本番環境モードで開始」→「作成」

作成後、上の「ルール」タブを開き、中身を下記に置き換えて「公開」:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /schedules/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

（＝ログインした本人だけが自分のデータを読み書きできる設定）

## 4. ウェブアプリを登録して設定をコピー
「プロジェクトの設定（歯車アイコン）> 全般」→ 下の「マイアプリ」
→ 「</>」（ウェブ）アイコンをクリック → ニックネーム入力（何でも可）→ 「アプリを登録」
→ 表示される `const firebaseConfig = { ... };` の **{ ... } の部分をまるごとコピー**

## 5.【重要】GitHub Pages のドメインを許可する
左メニュー「Authentication > Settings（設定）> 承認済みドメイン」
→「ドメインを追加」→ `2422512b-kohei.github.io` を追加
（これがないと Google ログインがブロックされます）

## 6. アプリに貼り付ける
公開URLを開くと「初期設定」画面が出ます。4でコピーした firebaseConfig を貼って「保存して続ける」
→ 「Google でログイン」→ 完了！

https://2422512b-kohei.github.io/kkm-lp/intern-checker.html

以後はどの端末でも「Googleでログイン」するだけで同じデータが出ます。

---
※ firebaseConfig（apiKey など）は公開しても安全な値です。本当のセキュリティは、上のFirestoreルール（本人だけ）で守られます。
