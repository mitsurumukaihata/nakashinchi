# 中新地 — 麻ノ葉

広島・中新地エリアの飲食店紹介サイト。第一弾は **麻ノ葉（まのは）**。

## 構成

```
nakashinchi/
├── asanoha-poem.html        # 縦書き和歌 + 赤字が泳ぐ演出（単体プロトタイプ）
├── asanoha-hero-bg/         # 壁画を背景にしたヒーロー（HP トップ用）
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── public/images/       # hero-japanese.jpg を配置
│   └── 席配置図/             # 麻の葉　配置図.jpg（参考資料）
└── asanoha-seats/            # 席管理 UI（店員向け）
    ├── index.html
    ├── style.css
    └── script.js
```

## ローカル確認

各 `index.html` をブラウザで直接開けば動作します（ビルド不要）。

## 公開（GitHub Pages）

`main` ブランチを Pages として配信。
ルート直下に `index.html` を置く場合はそのまま、サブパス配信なら各フォルダのURLでアクセス。

## メモ

- 店名「麻ノ葉」の読みは **まのは（Manoha）**（「あさのは」ではない）
- 席は BOX 5 + カウンター 6 = 計 11 席
- 席管理 UI の状態は `localStorage` に保存（マルチ端末同期は Phase 2 で Cloudflare D1）

## ライセンス

私有・社内利用。
