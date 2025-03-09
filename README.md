# YouPod

YouPodは、YouTubeチャンネルをポッドキャストに変換するツールです。

- 利用者の手元で動きます
- 指定のYouTubeチャンネルたちの動画をダウンロードして動画ファイルとして保存します
- 動画ファイルとRSSフィードをまとめて、ポッドキャストとしてパッケージします
- オブジェクトストレージにアップロードします

## 使用技術

- 言語: TypeScript
- オブジェクトストレージ: Cloudflare R2

## インストール

```bash
# 依存パッケージをインストール
npm install

# yt-dlpがインストールされていることを確認
# macOSの場合
brew install yt-dlp
```

## 使い方

### 基本的な使い方

```bash
# ビルド
npm run build

# 実行（デフォルトでは音声ファイル（mp3）としてダウンロード）
npm start
```

### コマンドラインオプション

```bash
# 音声ファイル（mp3）としてダウンロード
npm run mp3

# 動画ファイル（mp4）としてダウンロード
npm run mp4

# 各チャンネルから最新の1件のみをダウンロード（テスト用）
npm run test

# 各チャンネルから最新の1件のみを動画ファイル（mp4）としてダウンロード（テスト用）
npm run test:mp4

# 特定のチャンネル（やんちゃクラブ）から最新の1件のみをダウンロード
npm run test:yancya

# 特定のチャンネル（やんちゃクラブ）から最新の1件のみを動画ファイル（mp4）としてダウンロード
npm run test:yancya:mp4

# カスタムオプションを指定して実行
node dist/index.js --max 5 --format mp4 --channel "チャンネル名"
```

### オプション一覧

- `--max`, `-m`: ダウンロードする動画の最大数（デフォルト: 10）
- `--format`, `-f`: ダウンロードするファイル形式（`mp3`または`mp4`、デフォルト: `mp3`）
- `--output`, `-o`: 出力ディレクトリのパス（デフォルト: `./downloads`）
- `--channel`, `-c`: 処理する特定のチャンネル名

## 設定

`config.yml`ファイルでYouTubeチャンネルを設定します。

```yaml
channels:
  - label: "チャンネル名"
    feed_url: "https://www.youtube.com/feeds/videos.xml?channel_id=XXXXXXXXXXXX"
```

## 開発

```bash
# 開発モードで実行
npm run dev

# テスト（各チャンネルから最新の1件のみをダウンロード）
npm run test
```
