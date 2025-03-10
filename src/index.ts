import fs from 'fs-extra';
import path from 'path';
import { loadConfig, Channel } from './utils/config';
import { fetchYouTubeFeed, VideoEntry, fetchChannelIcon } from './utils/feed';
import { HistoryManager, HistoryEntry } from './utils/history';
import { FeedGenerator, FeedOptions } from './utils/feed-generator';
import { downloadVideo, DownloadOptions } from './utils/downloader';
import { R2Uploader } from './utils/r2-uploader';

interface AppOptions {
  maxVideos?: number;
  format?: 'mp3' | 'mp4';
  outputDir?: string;
  channelLabel?: string;
  downloadOnly?: boolean;
  feedOnly?: boolean;
  uploadOnly?: boolean;
  all?: boolean;
  feedOptions?: FeedOptions;
  qualityPreset?: 'low' | 'medium' | 'high';
}

async function main() {
  try {
    // 設定ファイルを読み込む
    const config = await loadConfig();
    console.log(`${config.channels.length}個のチャンネルが設定されています`);
    
    // コマンドライン引数を解析
    const options = parseCommandLineArgs();
    
    // チャンネルアイコンを取得
    await fetchChannelIcons(config.channels);
    
    // ヒストリーマネージャーを初期化
    const historyManager = new HistoryManager();
    
    // ダウンロード処理
    const shouldDownload = options.downloadOnly || options.all || (!options.feedOnly && !options.uploadOnly);
    if (shouldDownload) {
      // 出力ディレクトリを作成
      const outputBaseDir = options.outputDir || path.join(process.cwd(), 'downloads');
      await fs.ensureDir(outputBaseDir);
      
      // 処理対象のチャンネルを決定
      let channelsToProcess = config.channels;
      if (options.channelLabel) {
        channelsToProcess = config.channels.filter(channel => 
          channel.label.toLowerCase() === options.channelLabel!.toLowerCase());
        
        if (channelsToProcess.length === 0) {
          console.error(`チャンネル "${options.channelLabel}" が見つかりません。`);
          return;
        }
      }
      
      // 各チャンネルを処理
      for (const channel of channelsToProcess) {
        console.log(`\n===== チャンネル: ${channel.label} =====`);
        
        // チャンネルの出力ディレクトリを作成
        const channelDir = path.join(outputBaseDir, channel.slug);
        await fs.ensureDir(channelDir);
        
        // YouTubeフィードを取得
        const videos = await fetchYouTubeFeed(channel.feed_url);
        console.log(`${videos.length}個の動画が見つかりました`);
        
        // 履歴を読み込み
        const history = await historyManager.loadHistory(channel.slug);
        console.log(`チャンネル ${channel.slug} の履歴を ${history.length} 件読み込みました`);
        
        // 新しい動画を特定
        const existingVideoIds = new Set(history.map(entry => entry.videoId));
        const newVideos = videos.filter(video => !existingVideoIds.has(video.videoId));
        
        // 最大ダウンロード数を制限
        const videosToDownload = newVideos.slice(0, options.maxVideos);
        console.log(`うち${videosToDownload.length}個が新しい動画です\n`);
        
        // 各動画をダウンロード
        for (const video of videosToDownload) {
          console.log(`\n動画をダウンロード中: ${video.title}`);

          const downloadOptions: DownloadOptions = {
            format: channel.format === 'audio' || options.format === 'mp3' ? 'mp3' : 'mp4',
            outputDir: channelDir,
            videoId: video.videoId,
            title: video.title,
            channelSlug: channel.slug,
            qualityPreset: options.qualityPreset || 'medium'  // コマンドラインから指定された品質プリセットを使用
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
              channelLabel: channel.label,
              description: video.mediaGroup?.description // YouTubeの説明文を保存
            });

            console.log(`ダウンロード完了: ${path.basename(downloadedFile)}`);
          } catch (error) {
            console.error(`ダウンロード失敗: ${error}`);
          }
        }
      }
    }
    
    // フィード生成処理
    const shouldGenerateFeed = options.feedOnly || options.all || (!options.downloadOnly && !options.uploadOnly);
    if (shouldGenerateFeed) {
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
              downloadedAt: typeof entry.downloadDate === 'string' ? entry.downloadDate : entry.downloadDate.toISOString(),
              description: entry.description
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
    const shouldUpload = options.uploadOnly || options.all;
    if (shouldUpload) {
      await uploadToR2(config, options);
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

/**
 * ファイルをR2にアップロードする
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
      bucketName: config.storage.bucket,
      skipBucketCheck: true, // バケットの存在確認をスキップ
      skipExistingFiles: true // 既存ファイルのアップロードをスキップ
    });
    
    // バケットの存在を確認
    // const bucketExists = await uploader.checkBucket();
    if (false) {
      console.error(`バケット "${config.storage.bucket}" が存在しません。`);
      return;
    }
    
    // フィードのみをアップロードする場合
    if (options.feedOnly) {
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
        
        try {
          const uploadedUrls = await uploader.uploadDirectory(channelDir, `podcasts/${channel.slug}/media`);
          totalUploaded += uploadedUrls.length;
        } catch (error) {
          console.error(`チャンネル "${channel.label}" のメディアファイルのアップロードに失敗しました:`, error);
        }
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
        try {
          await uploader.uploadFile(
            channelFeedPath, 
            `podcasts/${channel.slug}/feed.xml`, 
            'application/xml'
          );
          console.log(`チャンネル "${channel.label}" のフィードをアップロードしました`);
        } catch (error) {
          console.error(`チャンネル "${channel.label}" のフィードのアップロードに失敗しました:`, error);
        }
      }
      
      // チャンネルアイコンをアップロード
      const channelIconPath = path.join(process.cwd(), 'feeds', 'icons', `${channel.slug}.jpg`);
      if (await fs.pathExists(channelIconPath)) {
        try {
          await uploader.uploadFile(
            channelIconPath, 
            `podcasts/${channel.slug}/icon.jpg`, 
            'image/jpeg'
          );
          console.log(`チャンネル "${channel.label}" のアイコンをアップロードしました`);
        } catch (error) {
          console.error(`チャンネル "${channel.label}" のアイコンのアップロードに失敗しました:`, error);
        }
      }
    }
    
    // 統合フィードをアップロード
    const allChannelsFeedPath = path.join(process.cwd(), 'feeds', 'all-channels.xml');
    if (await fs.pathExists(allChannelsFeedPath)) {
      try {
        await uploader.uploadFile(
          allChannelsFeedPath, 
          'podcasts/all/feed.xml', 
          'application/xml'
        );
        console.log('統合フィードをアップロードしました');
      } catch (error) {
        console.error('統合フィードのアップロードに失敗しました:', error);
      }
    }
    
    // 統合アイコンをアップロード
    const mainIconPath = path.join(process.cwd(), 'feeds', 'icon.jpg');
    if (await fs.pathExists(mainIconPath)) {
      try {
        await uploader.uploadFile(
          mainIconPath, 
          'podcasts/all/icon.jpg', 
          'image/jpeg'
        );
        console.log('統合アイコンをアップロードしました');
      } catch (error) {
        console.error('統合アイコンのアップロードに失敗しました:', error);
      }
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
 * チャンネルアイコンを取得する
 */
async function fetchChannelIcons(channels: Channel[]) {
  console.log('チャンネルアイコンを取得しています...');
  
  // アイコン保存ディレクトリを作成
  const iconDir = path.join(process.cwd(), 'feeds', 'icons');
  await fs.ensureDir(iconDir);
  
  for (const channel of channels) {
    try {
      // チャンネルIDを取得
      const channelId = channel.feed_url.split('channel_id=')[1];
      if (!channelId) continue;
      
      // アイコンのパス
      const iconPath = path.join(iconDir, `${channel.slug}.jpg`);
      
      // アイコンが既に存在する場合はスキップ
      if (await fs.pathExists(iconPath)) {
        continue;
      }
      
      // アイコンを取得
      const iconInfo = await fetchChannelIcon(channelId);
      if (iconInfo) {
        // 中サイズのアイコンを使用
        const iconUrl = iconInfo.medium.url;
        // アイコンを保存
        await downloadChannelIcon(iconUrl, iconPath);
        console.log(`チャンネル "${channel.label}" のアイコンを取得しました: ${iconUrl}`);
        console.log(`チャンネルアイコンを保存しました: ${iconPath}`);
      }
    } catch (error) {
      console.error(`チャンネル "${channel.label}" のアイコン取得に失敗しました:`, error);
    }
  }
}

/**
 * チャンネルアイコンをダウンロードする
 */
async function downloadChannelIcon(iconUrl: string, outputPath: string): Promise<void> {
  const axios = require('axios');
  const response = await axios.get(iconUrl, { responseType: 'arraybuffer' });
  await fs.writeFile(outputPath, response.data);
}

/**
 * コマンドライン引数を解析する
 */
function parseCommandLineArgs(): AppOptions {
  const options: AppOptions = {
    maxVideos: 10,
    format: 'mp4',
    outputDir: path.join(process.cwd(), 'downloads'),
    downloadOnly: false,
    feedOnly: false,
    uploadOnly: false,
    all: false
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
    } else if (arg === '--download-only') {
      options.downloadOnly = true;
    } else if (arg === '--feed-only') {
      options.feedOnly = true;
    } else if (arg === '--upload-only') {
      options.uploadOnly = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--quality' || arg === '-q') {
      const quality = process.argv[++i];
      options.qualityPreset = (quality === 'low' || quality === 'medium' || quality === 'high') ? 
        quality as 'low' | 'medium' | 'high' : 'medium';
    }
  }
  
  return options;
}

// メイン処理を実行
main().catch(error => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
}); 
