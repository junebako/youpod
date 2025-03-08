import path from 'path';
import fs from 'fs-extra';
import { loadConfig } from './utils/config';
import { fetchYouTubeFeed, VideoEntry } from './utils/feed';
import { downloadVideo, DownloadOptions } from './utils/downloader';

async function main() {
  try {
    // 設定ファイルを読み込む
    const config = await loadConfig();
    console.log(`${config.channels.length}個のチャンネルが設定されています`);
    
    // 出力ディレクトリを作成
    const outputBaseDir = path.join(process.cwd(), 'downloads');
    await fs.ensureDir(outputBaseDir);
    
    // 各チャンネルを処理
    for (const channel of config.channels) {
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
      
      // 最新の10件のみ処理
      const recentVideos = videos.slice(0, 10);
      console.log(`最新の${recentVideos.length}件をダウンロードします`);
      
      // 各動画をダウンロード
      const downloadOptions: DownloadOptions = {
        outputDir: channelDir,
        format: 'mp3',
        quality: 'highestaudio'
      };
      
      for (const video of recentVideos) {
        try {
          await downloadVideo(video, downloadOptions);
        } catch (error) {
          console.error(`動画のダウンロードに失敗しました: ${video.title}`, error);
        }
      }
    }
    
    console.log('\n全てのダウンロードが完了しました');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// アプリケーションを実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
