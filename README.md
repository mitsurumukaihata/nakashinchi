# 中新地 飲食店ガイド

広島・中新地エリアの飲食店紹介サイト。

第一弾は **麻ノ葉（まのは）**。今後、賛同いただける店舗を順次追加していく予定です。

## 構成

```
nakashinchi/
├── asanoha-poem.html         # 【麻ノ葉】縦書き和歌 + 赤字が泳ぐ演出（プロト）
├── asanoha-hero-bg/          # 【麻ノ葉】壁画背景のヒーローセクション
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── public/images/
│   └── 席配置図/
└── asanoha-seats/             # 【麻ノ葉】席管理 UI（店員向け）
    ├── index.html
    ├── style.css
    └── script.js
```

将来、別の店舗が加わる際は `(店名)-hero-bg/` `(店名)-seats/` のように店ごとに分けて追加していく方針。

## ローカル確認

各フォルダの `index.html` をブラウザで直接開けば動作します（ビルド不要）。

## 公開（GitHub Pages）

`main` ブランチ root を Pages として配信予定。
共通のディレクトリページ（店一覧）は今後作成。

## メモ

- **対象エリア**: 広島市中新地
- **席管理 UI** の状態は `localStorage` に保存（マルチ端末同期は将来 Cloudflare D1 で対応予定）
- **店名表記ルール**:
  - 麻ノ葉 → 読みは **まのは（Manoha）**

## ライセンス

私有・社内利用。
