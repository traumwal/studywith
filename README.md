# study room（仮）

友達と「同じ部屋」で勉強できる時間記録アプリ。仕様は [SPEC.md](./SPEC.md) を参照。

![部屋の画面](docs/room.png)

アプリを開くと、友達の勉強状態が 2D の部屋でゆるく分かり、自分の勉強時間は分野ごとに記録されます。

## できること（MVP）

- **ログインと部屋への参加**：Google ログイン / ゲスト。招待コード・招待リンク（`?join=コード`）で友達だけの部屋に参加
- **固定の 2D 勉強部屋**：人数分の机が並ぶ部屋（最大 8 人、4 列 × 2 行。スマホ幅では 2 列）
- **アバター**：髪型 4 種・髪色・服の色・肌の色を選ぶだけ。状態で表示が変わる
  - 勉強中 → 机に向かってペンを動かす（デスクライト点灯）
  - 休憩中 → 伸びをする / 飲み物を飲む
  - 離席中（開いているが勉強していない）→ 空席
  - オフライン（閉じている・5 分以上更新なし）→ 机で寝ている
  - 頭の上に「分野名＋経過時間」（例：`TOEIC 45分`）
- **手動のスタート / 休憩 / ストップ**：分野を選んでスタート。休憩時間は記録に含めない。リロードしてもタイマーは続く。1 分未満は保存しない
- **時間記録と集計**：週ごとの合計・前週比・日別（分野で色分け）・分野別。記録の削除、つけ忘れの手動追加
- 分野の追加・削除（初期値：学校課題 / CG / 英語 / TOEIC / 基本情報 / paiza / アプリ開発 / 映画 / イラスト）
- おまけ：窓の外と壁の時計が、見ている人の現地時刻に合わせて昼・夕方・夜に変わる

## 動かし方

```bash
npm install
npm run dev
```

Firebase を設定していない場合は **ローカルモード** で起動します。データはそのブラウザの localStorage だけに保存されます。
ログインはタブごとなので、別のタブで別の名前を入力して入ると、1 台で「友達のいる部屋」を試せます。

```bash
npm test             # 集計・時間計算などのテスト
npm run test:rules   # Firestore セキュリティルールのテスト（エミュレーターを自動で起動。Java が必要）
npm run build        # 型チェック + 本番ビルド（dist/）
```

### Firebase エミュレーターで動かす（本番のデータを汚さずに試す）

```bash
npm run emulators      # ターミナル1：Auth と Firestore のエミュレーターを起動
npm run dev:emulator   # ターミナル2：エミュレーターにつないでアプリを起動
```

## Firebase で友達と共有する

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成し、Web アプリを追加
2. Authentication で **Google** と **匿名** のログインを有効にする
3. Firestore Database を作成する
4. `.env.example` を `.env.local` にコピーし、Web アプリの設定値を入れる
5. セキュリティルールとホスティングをデプロイ

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # 作ったプロジェクトを選ぶ
npm run build
firebase deploy               # firestore.rules と dist/ をデプロイ
```

デプロイした URL を友達に送れば、インストールなしで使えます（Vercel などでも可。その場合も `firestore.rules` は `firebase deploy --only firestore` で反映してください）。

## データ構成（Firestore）

Firestore はコレクションとドキュメントが交互になるため、仕様書の `presence/{roomId}/{userId}` は部屋の下に置いています。

```
rooms/{roomId}                      name, createdAt, memberIds[]      ※ roomId = 招待コード
rooms/{roomId}/presence/{userId}    status, category, startedAt, accumulatedSec, updatedAt,
                                    displayName, avatar               ※ 部屋の描画に必要な分だけ複製
users/{userId}                      displayName, avatar{hair, hairColor, outfitColor, skin}, categories[]
users/{userId}/sessions/{id}        category, startedAt, endedAt, durationSec, source: "manual" | "camera"
```

- 時刻はすべてミリ秒の数値
- `accumulatedSec`：休憩をはさんだときの、それまでの勉強秒数（相手側で経過時間を計算するため）
- ルール（`firestore.rules`）：部屋と在席情報はメンバーだけが読める。参加は「自分を追加」、退出は「自分を削除」だけ許可。勉強記録は本人だけが読み書きできる

## 軽さのための工夫（仕様 7.）

- 部屋のアニメーションは 12fps。タブが見えていないときは描画しない
- 状態（presence）は変わったときだけ送信。加えて「開いている」ことを伝えるため 1 分に 1 回だけ送り直し、5 分途絶えたらオフライン扱い
- Firebase SDK は設定があるときだけ読み込む（ローカルモードでは読み込まない）

## ファイル構成

```
src/
  App.tsx                   画面の切り替え（ログイン → アバター → 部屋 / 記録 / 設定）
  backend/                  保存先の窓口（firebase.ts / local.ts を同じインターフェースで）
  room/draw.ts              部屋とアバターのドット絵描画（素材なし・fillRect で描画）
  room/RoomCanvas.tsx       描画ループ（12fps・非表示時停止・整数倍拡大）
  hooks/useStudyTimer.ts    タイマー（localStorage に保持）
  hooks/usePresencePublisher.ts  自分の状態を参加中の部屋へ送信
  components/               画面部品（TimerBar, Stats, Settings, RoomView など）
  lib/                      時間・集計・色・招待コードの小さな関数
```

自作の絵に差し替えるときは `src/room/draw.ts` の `drawSeat` / `drawRoom` を書き換えれば、他は変えずに済みます。

## 次のバージョンでやること

- カメラによる在席判定（MediaPipe Face Detector、1〜3 秒に 1 回、320×240、映像は送信・保存しない）
- ポモドーロタイマー
- 窓の外を「各メンバーの」現地時刻に合わせる（今は見ている人の時刻）

## 決めたこと（仕様書の「未決定」のうち仮に決めたもの）

| 項目 | 仮の値 | 変更する場所 |
|---|---|---|
| 1 部屋の最大人数 | 8 人 | `src/constants.ts` の `MAX_ROOM_MEMBERS` と `firestore.rules` |
| 絵柄・視点 | ドット絵・正面から | `src/room/draw.ts` |
| オフライン判定 | 5 分更新なし | `PRESENCE_STALE_MS` |
| 記録の見せ方 | 週単位の日別棒グラフ＋分野別横棒 | `src/components/Stats.tsx` |
