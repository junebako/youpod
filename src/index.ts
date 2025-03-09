import path from 'path';
import fs from 'fs-extra';
import { loadConfig, Channel } from './utils/config';
import { fetchYouTubeFeed, VideoEntry, fetchChannelIcon } from './utils/feed';
import { downloadVideo, DownloadOptions } from './utils/downloader';
import { HistoryManager, HistoryEntry } from './utils/history';
import { FeedGenerator, FeedOptions } from './utils/feed-generator';
import { R2Uploader, R2Config } from './utils/r2-uploader';
import axios from 'axios';

interface AppOptions {
  maxVideos?: number;
  format?: 'mp3' | 'mp4';
  outputDir?: string;
  channelLabel?: string;
  skipDownload?: boolean;
  skipFeedGeneration?: boolean;
  feedOptions?: FeedOptions;
  upload?: boolean;
  uploadFeedOnly?: boolean;
}

async function main() {
  try {
    // コマンドライン引数を解析
    const options = parseCommandLineArgs();

    // 履歴マネージャーを初期化
    const historyManager = new HistoryManager();

    // 設定ファイルを読み込む
    const config = await loadConfig();
    console.log(`${config.channels.length}個のチャンネルが設定されています`);

    // チャンネルアイコンを取得
    await fetchChannelIcons(config.channels);

    // 出力ディレクトリを作成
    const outputBaseDir = options.outputDir || path.join(process.cwd(), 'downloads');
    await fs.ensureDir(outputBaseDir);

    // 処理するチャンネルをフィルタリング
    const channelsToProcess = options.channelLabel 
      ? config.channels.filter(channel => channel.label === options.channelLabel)
      : config.channels;

    if (options.channelLabel && channelsToProcess.length === 0) {
      console.warn(`警告: 指定されたチャンネル "${options.channelLabel}" が見つかりませんでした`);
      return;
    }

    // ダウンロード処理をスキップしない場合
    if (!options.skipDownload) {
      // 各チャンネルを処理
      for (const channel of channelsToProcess) {
        console.log(`\n===== チャンネル: ${channel.label} =====`);

        // チャンネル用のディレクトリを作成（slugを使用）
        const channelDir = path.join(outputBaseDir, channel.slug);
        await fs.ensureDir(channelDir);

        // フィードを取得
        const videos = await fetchYouTubeFeed(channel.feed_url);
        console.log(`${videos.length}個の動画が見つかりました`);

        if (videos.length === 0) {
          continue;
        }

        // 履歴を読み込み
        const history = await historyManager.loadHistory(channel.slug);

        // 新しい動画をフィルタリング
        const newVideos = videos.filter(video => !history.some(h => h.videoId === video.videoId));
        console.log(`うち${newVideos.length}個が新しい動画です`);

        // 最大数を制限
        const videosToDownload = newVideos.slice(0, options.maxVideos || 10);

        // 各動画をダウンロード
        for (const video of videosToDownload) {
          console.log(`\n動画をダウンロード中: ${video.title}`);

          const downloadOptions: DownloadOptions = {
            format: channel.format === 'audio' || options.format === 'mp3' ? 'mp3' : 'mp4',
            outputDir: channelDir,
            videoId: video.videoId,
            title: video.title,
            channelSlug: channel.slug
          };

          try {
            const downloadedFile = await downloadVideo(video.videoUrl, downloadOptions);

            // 履歴に追加
            await historyManager.addToHistory(channel.slug, {
              videoId: video.videoId,
              title: video.title,
              url: video.videoUrl,
              publishDate: video.publishDate,
              downloadDate: new Date(),
              filePath: downloadedFile,
              channelLabel: channel.label
            });

            console.log(`ダウンロード完了: ${path.basename(downloadedFile)}`);
          } catch (error) {
            console.error(`ダウンロード失敗: ${error}`);
          }
        }
      }
    }

    // フィード生成をスキップしない場合
    if (!options.skipFeedGeneration) {
      console.log('\n===== RSSフィードを生成 =====');

      // フィード出力ディレクトリを作成
      const feedDir = path.join(process.cwd(), 'feeds');
      await fs.ensureDir(feedDir);

      // 各チャンネルの履歴エントリを読み込む
      const historyEntriesByChannel = new Map<string, HistoryEntry[]>();
      
      for (const channel of config.channels) {
        const history = await historyManager.loadHistory(channel.slug);
        if (history.length > 0) {
          // SimpleHistoryEntryからHistoryEntryに変換
          const historyEntries: HistoryEntry[] = history.map(entry => {
            // ファイルサイズを取得
            let fileSize = 0;
            try {
              const stats = fs.statSync(entry.filePath);
              fileSize = stats.size;
            } catch (error) {
              console.warn(`警告: ファイルサイズの取得に失敗しました: ${entry.filePath}`);
            }
            
            // ファイル形式を取得
            const format = path.extname(entry.filePath).replace('.', '');
            
            return {
              channelLabel: channel.label,
              videoId: entry.videoId,
              title: entry.title,
              filePath: entry.filePath,
              fileSize: fileSize,
              format: format,
              publishedAt: entry.publishDate,
              downloadedAt: typeof entry.downloadDate === 'string' ? entry.downloadDate : entry.downloadDate.toISOString()
            };
          });
          
          historyEntriesByChannel.set(channel.slug, historyEntries);
        } else {
          console.warn(`警告: チャンネル "${channel.label}" にはダウンロード済みの動画がありません`);
        }
      }
      
      // フィードを生成
      const feedFiles = await FeedGenerator.generateAllFeeds(
        config.channels,
        historyEntriesByChannel,
        feedDir,
        options.feedOptions
      );
      
      console.log(`${feedFiles.length}個のRSSフィードを生成しました`);
    }
    
    // アップロード処理
    if (options.upload || options.uploadFeedOnly) {
      await uploadToR2(config, options);
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
}

/**
 * Cloudflare R2にファイルをアップロードする
 */
async function uploadToR2(config: any, options: AppOptions) {
  // R2の設定が存在するか確認
  if (!config.storage || config.storage.type !== 'r2' || 
      !config.storage.account_id || !config.storage.access_key_id || 
      !config.storage.secret_access_key || !config.storage.bucket) {
    console.error('R2の設定が不完全です。config.ymlを確認してください。');
    return;
  }
  
  try {
    console.log('\n===== Cloudflare R2にアップロード =====');
    
    // R2アップローダーを初期化
    const r2Config: R2Config = {
      accountId: config.storage.account_id,
      accessKeyId: config.storage.access_key_id,
      secretAccessKey: config.storage.secret_access_key,
      bucketName: config.storage.bucket,
      skipBucketCheck: true  // バケットの存在確認をスキップ
    };
    
    const uploader = new R2Uploader(r2Config);
    
    // バケットの存在を確認
    const bucketExists = await uploader.checkBucket();
    if (!bucketExists) {
      console.error(`バケット "${config.storage.bucket}" が存在しません。`);
      return;
    }
    
    // フィードのみをアップロードする場合
    if (options.uploadFeedOnly) {
      console.log('フィードファイルをアップロード中...');
      const feedDir = path.join(process.cwd(), 'feeds');
      const feedUrls = await uploader.uploadDirectory(feedDir, 'feeds');
      console.log(`${feedUrls.length}個のフィードファイルをアップロードしました`);
      
      // アイコンファイルもアップロード
      const iconPath = path.join(feedDir, 'icon.jpg');
      if (await fs.pathExists(iconPath)) {
        await uploader.uploadFile(iconPath, 'feeds/icon.jpg', 'image/jpeg');
        console.log('アイコンファイルをアップロードしました');
      }
      
      // 公開URLを表示
      const baseUrl = config.storage.public_url || `https://${config.storage.bucket}.r2.dev`;
      console.log('\n===== ポッドキャストフィードURL =====');
      
      for (const channel of config.channels) {
        console.log(`${channel.label}: ${baseUrl}/feeds/${channel.slug}.xml`);
      }
      
      console.log(`統合フィード: ${baseUrl}/feeds/all-channels.xml`);
      return;
    }
    
    // すべてのファイルをアップロード
    console.log('ダウンロードしたファイルをアップロード中...');
    
    // 各チャンネルのディレクトリをアップロード
    const outputBaseDir = options.outputDir || path.join(process.cwd(), 'downloads');
    let totalUploaded = 0;
    
    for (const channel of config.channels) {
      const channelDir = path.join(outputBaseDir, channel.slug);
      if (await fs.pathExists(channelDir)) {
        const files = await fs.readdir(channelDir);
        console.log(`チャンネル "${channel.label}" の${files.length}個のファイルをアップロード中...`);
        
        const uploadedUrls = await uploader.uploadDirectory(channelDir, `downloads/${channel.slug}`);
        totalUploaded += uploadedUrls.length;
      }
    }
    
    console.log(`${totalUploaded}個のメディアファイルをアップロードしました`);
    
    // フィードもアップロード
    console.log('フィードファイルをアップロード中...');
    const feedDir = path.join(process.cwd(), 'feeds');
    const feedUrls = await uploader.uploadDirectory(feedDir, 'feeds');
    console.log(`${feedUrls.length}個のフィードファイルをアップロードしました`);
    
    // アイコンファイルもアップロード
    const iconPath = path.join(feedDir, 'icon.jpg');
    if (await fs.pathExists(iconPath)) {
      await uploader.uploadFile(iconPath, 'feeds/icon.jpg', 'image/jpeg');
      console.log('アイコンファイルをアップロードしました');
    }
    
    // 公開URLを表示
    const baseUrl = config.storage.public_url || `https://${config.storage.bucket}.r2.dev`;
    console.log('\n===== ポッドキャストフィードURL =====');
    
    for (const channel of config.channels) {
      console.log(`${channel.label}: ${baseUrl}/feeds/${channel.slug}.xml`);
    }
    
    console.log(`統合フィード: ${baseUrl}/feeds/all-channels.xml`);
    
  } catch (error) {
    console.error('アップロード中にエラーが発生しました:', error);
  }
}

/**
 * 各チャンネルのアイコン画像を取得する
 */
async function fetchChannelIcons(channels: Channel[]) {
  console.log('チャンネルアイコンを取得しています...');
  
  for (const channel of channels) {
    try {
      // チャンネルIDを取得
      const channelId = channel.feed_url.split('channel_id=')[1];
      if (!channelId) {
        console.warn(`警告: チャンネル "${channel.label}" のIDを取得できませんでした`);
        continue;
      }
      
      // アイコンを取得
      const iconInfo = await fetchChannelIcon(channelId);
      if (iconInfo) {
        // アイコンURLを保存
        channel.iconUrl = iconInfo.medium.url;
        console.log(`チャンネル "${channel.label}" のアイコンを取得しました: ${channel.iconUrl}`);
        
        // アイコン画像をダウンロード
        const iconDir = path.join(process.cwd(), 'feeds', 'icons');
        await fs.ensureDir(iconDir);
        
        const iconPath = path.join(iconDir, `${channel.slug}.jpg`);
        const response = await axios.get(iconInfo.medium.url, { responseType: 'arraybuffer' });
        await fs.writeFile(iconPath, response.data);
        console.log(`チャンネルアイコンを保存しました: ${iconPath}`);
      } else {
        console.warn(`警告: チャンネル "${channel.label}" のアイコンを取得できませんでした`);
      }
    } catch (error) {
      console.error(`チャンネル "${channel.label}" のアイコン取得中にエラーが発生しました:`, error);
    }
  }
}

function parseCommandLineArgs(): AppOptions {
  const options: AppOptions = {
    maxVideos: 10,
    format: 'mp4',
    skipDownload: false,
    skipFeedGeneration: false,
    upload: false,
    uploadFeedOnly: false
  };
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg === '--max' || arg === '-m') {
      const value = parseInt(process.argv[++i], 10);
      if (!isNaN(value)) {
        options.maxVideos = value;
      }
    } else if (arg === '--format' || arg === '-f') {
      const value = process.argv[++i];
      if (value === 'mp3' || value === 'mp4') {
        options.format = value;
      }
    } else if (arg === '--output' || arg === '-o') {
      options.outputDir = process.argv[++i];
    } else if (arg === '--channel' || arg === '-c') {
      options.channelLabel = process.argv[++i];
    } else if (arg === '--skip-download') {
      options.skipDownload = true;
    } else if (arg === '--skip-feed') {
      options.skipFeedGeneration = true;
    } else if (arg === '--feed-only') {
      options.skipDownload = true;
      options.skipFeedGeneration = false;
    } else if (arg === '--upload') {
      options.upload = true;
    } else if (arg === '--upload-feed') {
      options.uploadFeedOnly = true;
      options.skipDownload = true;
    }
  }
  
  return options;
}

// アプリケーションを実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
