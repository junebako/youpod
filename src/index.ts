import path from 'path';
import fs from 'fs-extra';
import { loadConfig } from './utils/config';
import { fetchYouTubeFeed, VideoEntry } from './utils/feed';
import { downloadVideo, DownloadOptions } from './utils/downloader';
import { HistoryManager } from './utils/history';
import { FeedGenerator, FeedOptions } from './utils/feed-generator';

interface AppOptions {
  maxVideos?: number;
  format?: 'mp3' | 'mp4';
  outputDir?: string;
  channelLabel?: string;
  skipDownload?: boolean;
  skipFeedGeneration?: boolean;
  feedOptions?: FeedOptions;
}

async function main() {
  try {
    // コマンドライン引数を解析
    const options = parseCommandLineArgs();
    
    // 設定ファイルを読み込む
    const config = await loadConfig();
    console.log(`${config.channels.length}個のチャンネルが設定されています`);
    
    // 出力ディレクトリを作成
    const outputBaseDir = options.outputDir || path.join(process.cwd(), 'downloads');
    await fs.ensureDir(outputBaseDir);
    
    // 履歴マネージャーを初期化
    const historyManager = new HistoryManager();
    
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
        
        // チャンネル用のディレクトリを作成
        const channelDir = path.join(outputBaseDir, channel.label);
        await fs.ensureDir(channelDir);
        
        // フィードを取得
        const videos = await fetchYouTubeFeed(channel.feed_url);
        console.log(`${videos.length}個の動画が見つかりました`);
        
        if (videos.length === 0) {
          continue;
        }
        
        // 処理する動画数を制限
        const maxVideos = options.maxVideos || 10;
        
        // 未ダウンロードの動画をフィルタリング
        const newVideos = videos.filter(video => !historyManager.isDownloaded(video.id));
        console.log(`${newVideos.length}個の新しい動画が見つかりました`);
        
        // 最新の動画から指定数だけ処理
        const videosToDownload = newVideos.slice(0, maxVideos);
        console.log(`${videosToDownload.length}件をダウンロードします`);
        
        // 各動画をダウンロード
        const downloadOptions: DownloadOptions = {
          outputDir: channelDir,
          format: options.format || 'mp4',
          quality: 'best'
        };
        
        for (const video of videosToDownload) {
          try {
            const result = await downloadVideo(video, downloadOptions);
            // 履歴に追加
            await historyManager.addEntry(channel.label, video, result);
          } catch (error) {
            console.error(`動画のダウンロードに失敗しました: ${video.title}`, error);
          }
        }
      }
      
      console.log('\n全てのダウンロードが完了しました');
    }
    
    // RSSフィード生成をスキップしない場合
    if (!options.skipFeedGeneration) {
      console.log('\nRSSフィードを生成します...');
      
      // 各チャンネルの履歴エントリを取得
      const historyEntriesByChannel = new Map();
      for (const channel of channelsToProcess) {
        const entries = historyManager.getChannelEntries(channel.label);
        historyEntriesByChannel.set(channel.label, entries);
      }
      
      // RSSフィードの出力ディレクトリ
      const feedOutputDir = path.join(process.cwd(), 'feeds');
      
      // RSSフィードを生成
      const feedPaths = await FeedGenerator.generateAllFeeds(
        channelsToProcess,
        historyEntriesByChannel,
        feedOutputDir,
        options.feedOptions
      );
      
      console.log(`${feedPaths.length}個のRSSフィードを生成しました`);
    }
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

/**
 * コマンドライン引数を解析する
 */
function parseCommandLineArgs(): AppOptions {
  const options: AppOptions = {};
  
  // コマンドライン引数を処理
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg === '--max' || arg === '-m') {
      const value = process.argv[++i];
      if (value && !isNaN(Number(value))) {
        options.maxVideos = Number(value);
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
    }
  }
  
  return options;
}

// アプリケーションを実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
