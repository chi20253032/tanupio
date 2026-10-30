# TANUPIO: NEON ARENA 1.1.0

**正式アップデート** — PC・タブレット・スマートフォン対応のネオンアクションゲーム。

[今すぐプレイ](https://chi20253032.github.io/tanupio/)

## ゲームモード

- **SURVIVAL** — 敵のウェーブを生き残る無限モード
- **STORY** — 全5ステージ、ボス戦あり
- **AI DEMO** — AIパイロットの自律プレイを観戦。人間の操作入力は無効化され、レベルアップ報酬もAIが自動選択
- **HALLOWEEN RAID** — 2026年10月31日（日本時間）限定。パンプキン軍団を突破し、パンプキンキングを討伐して限定報酬を獲得
- **ONLINE DUEL** — 招待ルーム、公開ルーム、クイックマッチによる2人対戦

## HALLOWEEN RAID — 2026.10.31

10月31日限定の期間イベント。パンプキン敵を12体倒すとパンプキンキングが出現します。キングを撃破するとイベントクリア、限定報酬「パンプキンクラウン」とボーナススコアを獲得できます。イベントの開催判定は日本時間（Asia/Tokyo）です。

## AI DEMO

AIが敵の脅威度・距離・ボス優先度を評価し、回避・間合い調整・攻撃・スキル使用を自律判断します。AIプレイ中はキーボード、マウス、タッチ操作を受け付けません。レベルアップ時はHPや装備状況に応じてAIが報酬を選択し、観戦を止めません。

## 操作

PCはWASD / 矢印キー・マウス・Space・Q、タッチ端末は左右の仮想スティックとスキルボタンで操作できます。オートエイムはタイトル画面から切り替え可能です。

## オンライン対戦

オンラインの全モードは同じWebSocket中継方式です。ルーム作成、公開ルーム、招待コード、クイックマッチに対応します。

マッチングサーバーはRender Blueprintの `render.yaml` からデプロイ。ヘルスチェックは `/health`、クライアント接続先は `wss://tanupio-matchmaking.onrender.com` です。Render無料プランではアイドル時にスリープする場合があります。

## 開発・テスト

Node.js 20以降が必要です。

```sh
npm install
npx playwright install --with-deps chromium
npm test
```

自動テストはサーバーのルーム・中継、PCブラウザ2画面での招待対戦・クイックマッチ、PC操作、スマホタッチ操作、SURVIVAL / STORY / AI DEMO、AI操作ロック・自動報酬選択、ハロウィンボスと報酬を検証します。

## リリース

- Version: **1.1.0**
- Channel: Stable
- Browser game: GitHub Pages
- Matchmaking service: Render
