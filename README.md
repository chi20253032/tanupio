# TANUPIO: NEON ARENA 1.0.0

**正式リリース** — PC・タブレット・スマートフォン対応のネオンアクションゲーム。

[今すぐプレイ](https://chi20253032.github.io/tanupio/)

## ゲームモード

- **SURVIVAL** — 敵のウェーブを生き残るエンドレスモード
- **STORY** — 全5ステージ、ボス戦あり
- **AI DEMO** — AIパイロットのプレイを観戦
- **ONLINE DUEL** — 招待ルーム、公開ルーム、クイックマッチによる2人対戦

PCはWASD / 矢印キー・マウス・Space、タッチ端末は左右の仮想スティックとスキルボタンで操作できます。オートエイムはタイトル画面から切り替え可能です。

## オンライン対戦

オンラインの全モードは **同じWebSocket通信方式** を使用します。ルーム対戦とクイックマッチで通信方式が分かれることはありません。

- ルーム作成：6文字の招待コードを発行
- ルーム参加：公開ルーム一覧または招待コードで参加
- クイックマッチ：待機中の2人を自動ペアリング
- ゲーム通信：マッチングサーバーが両プレイヤー間のゲームデータを中継
- 切断処理：相手への切断通知と待機キューの後片付け

### マッチングサーバーのデプロイ

Render Blueprintを使って `render.yaml` から `tanupio-matchmaking` をデプロイします。ヘルスチェックURLは `/health` です。クライアントは `wss://tanupio-matchmaking.onrender.com` に接続します。

Renderの無料プランではアイドル時にサービスがスリープする場合があり、休止後の初回接続には時間がかかることがあります。

## 開発・テスト

Node.js 20以降が必要です。

```sh
npm install
npx playwright install --with-deps chromium
npm test
```

テストには以下を含みます。

- マッチングサーバーのヘルスチェック、キュー、2人のペアリング
- クイックマッチの双方向ゲームデータ中継
- ルーム作成、公開一覧、招待コード参加、双方向中継
- PCブラウザ2画面での招待ルーム対戦とクイックマッチ対戦
- PC操作、スマホタッチ操作、SURVIVAL / STORY / AI DEMO

## リリース

- Version: **1.0.0**
- Release channel: Stable
- Browser game: GitHub Pages
- Matchmaking service: Render
