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
  uploadOnly?: boolean;
}

async function main() {
  try {
    // 設定ファイルを読み込む
    const config = await loadConfig();
    console.log(`${config.channels.length}個のチャンネルが設定されています`);
    
    // コマンドライン引数を解析
    const options = parseCommandLineArgs();
    
    // アップロードのみの場合は、ダウンロードとフィード生成をスキップ
    if (options.uploadOnly) {
      options.skipDownload = true;
      options.skipFeedGeneration = true;
      options.upload = true;
    }
    
    // チャンネルアイコンを取得
    await fetchChannelIcons(config.channels);
    
    // ヒストリーマネージャーを初期化
    const historyManager = new HistoryManager();
    
    // ダウンロードをスキップしない場合
    if (!options.skipDownload && !options.uploadFeedOnly && !options.uploadOnly) {
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
    if (!options.skipFeedGeneration && !options.uploadOnly) {
      console.log('\n===== RSSフィードを生成 =====');
      
      // フィードディレクトリを作成
      const feedDir = path.join(process.cwd(), 'feeds');
      await fs.ensureDir(feedDir);
      
      // 各チャンネルの履歴エントリを取得
      const historyEntriesByChannel = new Map<string, HistoryEntry[]>();
      
      for (const channel of config.channels) {
        const entries = await historyManager.loadHistory(channel.slug);
        
        if (entries.length > 0) {
          // SimpleHistoryEntryをHistoryEntryに変換
          const historyEntries = entries.map(entry => {
            return {
              channelLabel: entry.channelLabel || channel.label,
              videoId: entry.videoId,
              title: entry.title,
              filePath: entry.filePath,
              fileSize: fs.existsSync(entry.filePath) ? fs.statSync(entry.filePath).size : 0,
              format: path.extname(entry.filePath).replace('.', ''),
              publishedAt: entry.publishDate,
              downloadedAt: typeof entry.downloadDate === 'string' ? entry.downloadDate : entry.downloadDate.toISOString()
            };
          });
          
          historyEntriesByChannel.set(channel.slug, historyEntries);
        } else {
          console.warn(`警告: チャンネル "${channel.label}" にはダウンロード済みの動画がありません`);
        }
      }
      
      // baseUrlを設定
      let baseUrl = '';
      if (config.storage && config.storage.public_url) {
        baseUrl = config.storage.public_url;
      } else if (config.storage && config.storage.bucket) {
        baseUrl = `https://${config.storage.bucket}.r2.dev`;
      }
      
      // フィードオプションを設定
      const feedOptions = {
        ...(options.feedOptions || {}),
        baseUrl
      };
      
      // フィードを生成
      const feedFiles = await FeedGenerator.generateAllFeeds(
        config.channels,
        historyEntriesByChannel,
        feedDir,
        feedOptions
      );
      
      console.log(`${feedFiles.length}個のRSSフィードを生成しました`);
    }
    
    // アップロード処理
    if (options.upload || options.uploadFeedOnly || options.uploadOnly) {
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
  if (!config.storage || config.storage.type !== 'r2') {
    console.error('R2ストレージの設定が見つかりません。アップロードをスキップします。');
    return;
  }
  
  try {
    console.log('\n===== Cloudflare R2にアップロード =====');
    
    // R2アップローダーを初期化
    const uploader = new R2Uploader({
      accountId: config.storage.account_id,
      accessKeyId: config.storage.access_key_id,
      secretAccessKey: config.storage.secret_access_key,
      bucketName: config.storage.bucket
    });
    
    // バケットの存在を確認
    const bucketExists = await uploader.checkBucket();
    if (!bucketExists) {
      console.error(`バケット "${config.storage.bucket}" が存在しません。`);
      return;
    }
    
    // フィードのみをアップロードする場合
    if (options.uploadFeedOnly) {
      console.log('フィードファイルをアップロード中...');
      
      // 各チャンネルのフィードをアップロード
      for (const channel of config.channels) {
        // チャンネルフィードをアップロード
        const channelFeedPath = path.join(process.cwd(), 'feeds', `${channel.slug}.xml`);
        if (await fs.pathExists(channelFeedPath)) {
          await uploader.uploadFile(
            channelFeedPath, 
            `podcasts/channels/${channel.slug}/feed.xml`, 
            'application/xml'
          );
          console.log(`チャンネル "${channel.label}" のフィードをアップロードしました`);
        }
        
        // チャンネルアイコンをアップロード
        const channelIconPath = path.join(process.cwd(), 'feeds', 'icons', `${channel.slug}.jpg`);
        if (await fs.pathExists(channelIconPath)) {
          await uploader.uploadFile(
            channelIconPath, 
            `podcasts/channels/${channel.slug}/icon.jpg`, 
            'image/jpeg'
          );
          console.log(`チャンネル "${channel.label}" のアイコンをアップロードしました`);
        }
      }
      
      // 統合フィードをアップロード
      const allChannelsFeedPath = path.join(process.cwd(), 'feeds', 'all-channels.xml');
      if (await fs.pathExists(allChannelsFeedPath)) {
        await uploader.uploadFile(
          allChannelsFeedPath, 
          'podcasts/all-channels/feed.xml', 
          'application/xml'
        );
        console.log('統合フィードをアップロードしました');
      }
      
      // 統合アイコンをアップロード
      const mainIconPath = path.join(process.cwd(), 'feeds', 'icon.jpg');
      if (await fs.pathExists(mainIconPath)) {
        await uploader.uploadFile(
          mainIconPath, 
          'podcasts/all-channels/icon.jpg', 
          'image/jpeg'
        );
        console.log('統合アイコンをアップロードしました');
      }
      
      // 公開URLを表示
      const baseUrl = config.storage.public_url || `https://${config.storage.bucket}.r2.dev`;
      console.log('\n===== ポッドキャストフィードURL =====');
      
      for (const channel of config.channels) {
        console.log(`${channel.label}: ${baseUrl}/podcasts/channels/${channel.slug}/feed.xml`);
      }
      
      console.log(`統合フィード: ${baseUrl}/podcasts/all-channels/feed.xml`);
      
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
        
        const uploadedUrls = await uploader.uploadDirectory(channelDir, `podcasts/${channel.slug}/media`);
        totalUploaded += uploadedUrls.length;
      }
    }
    
    console.log(`${totalUploaded}個のメディアファイルをアップロードしました`);
    
    // フィードもアップロード
    console.log('フィードファイルをアップロード中...');
    
    // 各チャンネルのフィードをアップロード
    for (const channel of config.channels) {
      // チャンネルフィードをアップロード
      const channelFeedPath = path.join(process.cwd(), 'feeds', `${channel.slug}.xml`);
      if (await fs.pathExists(channelFeedPath)) {
        await uploader.uploadFile(
          channelFeedPath, 
          `podcasts/${channel.slug}/feed.xml`, 
          'application/xml'
        );
        console.log(`チャンネル "${channel.label}" のフィードをアップロードしました`);
      }
      
      // チャンネルアイコンをアップロード
      const channelIconPath = path.join(process.cwd(), 'feeds', 'icons', `${channel.slug}.jpg`);
      if (await fs.pathExists(channelIconPath)) {
        await uploader.uploadFile(
          channelIconPath, 
          `podcasts/${channel.slug}/icon.jpg`, 
          'image/jpeg'
        );
        console.log(`チャンネル "${channel.label}" のアイコンをアップロードしました`);
      }
    }
    
    // 統合フィードをアップロード
    const allChannelsFeedPath = path.join(process.cwd(), 'feeds', 'all-channels.xml');
    if (await fs.pathExists(allChannelsFeedPath)) {
      await uploader.uploadFile(
        allChannelsFeedPath, 
        'podcasts/all/feed.xml', 
        'application/xml'
      );
      console.log('統合フィードをアップロードしました');
    }
    
    // 統合アイコンをアップロード
    const mainIconPath = path.join(process.cwd(), 'feeds', 'icon.jpg');
    if (await fs.pathExists(mainIconPath)) {
      await uploader.uploadFile(
        mainIconPath, 
        'podcasts/all/icon.jpg', 
        'image/jpeg'
      );
      console.log('統合アイコンをアップロードしました');
    }
    
    // 公開URLを表示
    const baseUrl = config.storage.public_url || `https://${config.storage.bucket}.r2.dev`;
    console.log('\n===== ポッドキャストフィードURL =====');
    
    for (const channel of config.channels) {
      console.log(`${channel.label}: ${baseUrl}/podcasts/${channel.slug}/feed.xml`);
    }
    
    console.log(`統合フィード: ${baseUrl}/podcasts/all/feed.xml`);
    
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
    outputDir: path.join(process.cwd(), 'downloads'),
    skipDownload: false,
    skipFeedGeneration: false,
    upload: false,
    uploadFeedOnly: false,
    uploadOnly: false
  };
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg === '--max' || arg === '-m') {
      options.maxVideos = parseInt(process.argv[++i], 10);
    } else if (arg === '--format' || arg === '-f') {
      const format = process.argv[++i];
      options.format = (format === 'mp3' || format === 'mp4') ? format : 'mp4';
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
    } else if (arg === '--upload-only') {
      options.uploadOnly = true;
    }
  }
  
  return options;
}

// アプリケーションを実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
