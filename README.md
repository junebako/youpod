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

# 実行（デフォルトでは動画ファイル（mp4）としてダウンロード）
npm start
```

### コマンドラインオプション

```bash
# 動画ファイル（mp4）としてダウンロード（デフォルト）
npm start
# または
npm run mp4

# 音声ファイル（mp3）としてダウンロード
npm run mp3

# 各チャンネルから最新の1件のみをダウンロード（テスト用）
npm run test

# 各チャンネルから最新の1件のみを音声ファイル（mp3）としてダウンロード（テスト用）
npm run test:mp3

# 特定のチャンネル（やんちゃクラブ）から最新の1件のみをダウンロード
npm run test:yancya

# 特定のチャンネル（やんちゃクラブ）から最新の1件のみを音声ファイル（mp3）としてダウンロード
npm run test:yancya:mp3

# RSSフィードのみを生成（ダウンロードはスキップ）
npm run feed

# 特定のチャンネル（やんちゃクラブ）のRSSフィードのみを生成
npm run feed:yancya

# カスタムオプションを指定して実行
node dist/index.js --max 5 --format mp3 --channel "チャンネル名"
```

### オプション一覧

- `--max`, `-m`: ダウンロードする動画の最大数（デフォルト: 10）
- `--format`, `-f`: ダウンロードするファイル形式（`mp3`または`mp4`、デフォルト: `mp4`）
- `--output`, `-o`: 出力ディレクトリのパス（デフォルト: `./downloads`）
- `--channel`, `-c`: 処理する特定のチャンネル名
- `--skip-download`: 動画のダウンロードをスキップ
- `--skip-feed`: RSSフィードの生成をスキップ
- `--feed-only`: 動画のダウンロードをスキップしてRSSフィードのみを生成

## 設定

`config.yml`ファイルでYouTubeチャンネルを設定します。

```yaml
channels:
  - label: "チャンネル名"
    slug: "channel-slug"
    feed_url: "https://www.youtube.com/feeds/videos.xml?channel_id=XXXXXXXXXXXX"
    format: "video" # または "audio"
```

## 生成されるRSSフィード

以下のRSSフィードが生成されます：

1. 各チャンネルごとのフィード: `feeds/{channel-slug}.xml`
   - 各チャンネルの動画のみを含むフィード
   - チャンネルごとに別々のフィードとして生成

2. 統合フィード: `feeds/all-channels.xml`
   - すべてのチャンネルの動画を含む統合フィード
   - タイトルに `[チャンネル名]` が付加されるため、どのチャンネルの動画かが分かる
   - 日付順にソートされるため、最新の動画が上部に表示される

## 開発

```bash
# 開発モードで実行
npm run dev

# テスト（各チャンネルから最新の1件のみをダウンロード）
npm run test
```

## 仕組み

1. 設定ファイル（config.yml）からYouTubeチャンネルの情報を読み込みます
2. 各チャンネルのフィードを取得して、新しい動画を特定します
3. 新しい動画をダウンロードして、指定の形式（mp4またはmp3）で保存します
4. ダウンロード履歴をTSVファイルで管理し、差分更新を実現します
5. ダウンロードした動画の情報を元にRSSフィードを生成します
   - 各チャンネルごとのフィード
   - すべてのチャンネルを含む統合フィード
