# YouPod

YouPodは、YouTubeチャンネルをポッドキャストに変換するツールです。

- 利用者の手元で動きます
- 指定のYouTubeチャンネルたちの動画をダウンロードして動画ファイルとして保存します
- 動画ファイルとRSSフィードをまとめて、ポッドキャストとしてパッケージします
- オブジェクトストレージにアップロードします

## 使用技術

- 言語: TypeScript
- オブジェクトストレージ: Cloudflare R2 または AWS S3

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

# フィードファイルをストレージ（R2/S3）にアップロード
npm run upload:feed

# すべてのファイル（ダウンロードした動画・音声ファイルとフィード）をストレージ（R2/S3）にアップロード
npm run upload

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
- `--upload`: すべてのファイルをストレージ（R2/S3）にアップロード
- `--upload-feed`: フィードファイルのみをストレージ（R2/S3）にアップロード

## 設定

`config.yml`ファイルでYouTubeチャンネルとストレージの設定を行います。

> **注意**: `config.yml`には秘匿情報が含まれるため、バージョン管理には含めないでください。代わりに`config.example.yml`をテンプレートとして使用してください。

初回セットアップ時には、以下のコマンドで設定ファイルを作成してください：

```bash
# 設定ファイルのテンプレートをコピー
cp config.example.yml config.yml

# 作成した設定ファイルを編集
nano config.yml  # または任意のエディタで編集
```

設定ファイルの例：

```yaml
channels:
  - label: "チャンネル名"
    slug: "channel-slug"
    feed_url: "https://www.youtube.com/feeds/videos.xml?channel_id=XXXXXXXXXXXX"
    format: "video" # または "audio"

# ストレージ設定（Cloudflare R2またはAWS S3）

# Cloudflare R2の場合
storage:
  type: "r2"
  bucket: "your-bucket-name"  # R2バケット名
  account_id: "your-account-id"    # CloudflareアカウントID
  access_key_id: "your-access-key-id" # R2アクセスキーID
  secret_access_key: "your-secret-access-key" # R2シークレットアクセスキー
  public_url: "https://your-public-url.r2.dev"    # 公開URL（カスタムドメインを使用する場合）

# AWS S3の場合
# storage:
#   type: "s3"
#   bucket: "your-bucket-name"  # S3バケット名
#   region: "ap-northeast-1"     # AWSリージョン（東京の例）
#   access_key_id: "your-access-key-id" # AWSアクセスキーID
#   secret_access_key: "your-secret-access-key" # AWSシークレットアクセスキー
#   public_url: "https://your-bucket-name.s3.amazonaws.com"    # 公開URL（カスタムドメインを使用する場合）
```

## 生成されるRSSフィード

以下のRSSフィードが生成されます：

1. 各チャンネルごとのフィード: `feeds/{channel-slug}.xml`
   - 各チャンネルの動画のみを含むフィード
   - チャンネルごとに別々のフィードとして生成

2. 統合フィード: `feeds/all-channels.xml`
   - すべてのチャンネルの動画を含む統合フィード
   - 日付順にソートされるため、最新の動画が上部に表示される

### フィードの特徴

- **チャンネルアイコン**: すべてのフィードで `icon.jpg` がチャンネルアイコンとして使用されます
- **アイテムアイコン**: 各アイテム（動画）にもチャンネルと同じアイコンが設定されます
- **タイトル**: 動画のオリジナルタイトルがそのまま使用されます（チャンネル名は含まれません）
- **リンク先**: 各アイテムのリンク先は元のYouTube動画URL（`https://www.youtube.com/watch?v={video_id}`）になります

## ストレージの設定

### Cloudflare R2の設定

Cloudflare R2にファイルをアップロードするには、以下の手順で設定を行います：

1. **Cloudflareアカウントの作成**
   - [Cloudflareのサインアップページ](https://dash.cloudflare.com/sign-up)でアカウントを作成

2. **R2バケットの作成**
   - Cloudflareダッシュボードの左側パネルからR2を選択
   - 「バケットを作成」をクリックし、名前と地域を設定

3. **APIトークンの作成**
   - R2メインページで「API」ボタンをクリック
   - 「APIトークンを作成」を選択
   - トークン名を設定し、「オブジェクトの読み取りと書き込み」権限を付与
   - 作成したバケットにのみ適用するよう設定

4. **パブリックアクセスの設定**
   - バケットを選択し、「設定」→「パブリックアクセス」
   - 「R2.devサブドメイン」で「アクセスを許可」を選択

5. **config.ymlの設定**
   - 上記で取得した情報を`config.yml`の`storage`セクションに設定

6. **アップロード**
   - `npm run upload:feed`でフィードファイルのみをアップロード
   - `npm run upload`ですべてのファイルをアップロード

### AWS S3の設定

AWS S3にファイルをアップロードするには、以下の手順で設定を行います：

1. **AWSアカウントの作成**
   - [AWSのサインアップページ](https://aws.amazon.com/jp/)でアカウントを作成

2. **S3バケットの作成**
   - AWSマネジメントコンソールでS3を開く
   - 「バケットを作成」をクリック
   - バケット名とリージョンを設定
   - 「パブリックアクセスをブロック」のチェックを外す（ポッドキャスト配信用）

3. **バケットポリシーの設定**
   - バケットを選択し、「アクセス許可」タブへ
   - 「バケットポリシー」で以下のポリシーを追加：
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::your-bucket-name/*"
       }
     ]
   }
   ```

4. **IAMユーザーの作成**
   - IAMで新しいユーザーを作成
   - アクセスキーを生成
   - S3のフルアクセス権限または特定バケットのみの権限を付与

5. **config.ymlの設定**
   - 上記で取得した情報を`config.yml`の`storage`セクションに設定
   - `type: "s3"`に変更し、`region`を追加

6. **アップロード**
   - R2と同じコマンドでアップロード可能

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
6. 生成したフィードとダウンロードしたファイルをストレージ（R2またはS3）にアップロードします
7. ポッドキャストアプリからアクセス可能なURLを提供します
