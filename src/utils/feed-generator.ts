import fs from 'fs-extra';
import path from 'path';
import * as Podcast from 'podcast';
import { Channel } from './config';
import { HistoryEntry } from './history';

export interface FeedOptions {
  title?: string;
  description?: string;
  siteUrl?: string;
  imageUrl?: string;
  author?: string;
  copyright?: string;
  language?: string;
  categories?: string[];
  explicit?: boolean;
  maxItems?: number;
}

export class FeedGenerator {
  /**
   * チャンネルのRSSフィードを生成する
   */
  public static async generateChannelFeed(
    channel: Channel,
    entries: HistoryEntry[],
    outputDir: string,
    options: FeedOptions = {}
  ): Promise<string> {
    // 出力ディレクトリを確保
    await fs.ensureDir(outputDir);
    
    // デフォルトオプションをマージ
    const defaultOptions: FeedOptions = {
      title: channel.label,
      description: `${channel.label} のポッドキャスト`,
      siteUrl: `https://www.youtube.com/channel/${channel.feed_url.split('channel_id=')[1]}`,
      imageUrl: '',
      author: channel.label,
      copyright: `Copyright ${new Date().getFullYear()} ${channel.label}`,
      language: 'ja',
      categories: ['Technology'],
      explicit: false,
      maxItems: 50
    };
    
    const feedOptions = { ...defaultOptions, ...options };
    
    // ポッドキャストフィードを作成
    const feed = new Podcast.Podcast({
      title: feedOptions.title!,
      description: feedOptions.description!,
      feedUrl: `${feedOptions.siteUrl}/feed.xml`,
      siteUrl: feedOptions.siteUrl!,
      imageUrl: feedOptions.imageUrl!,
      author: feedOptions.author!,
      copyright: feedOptions.copyright!,
      language: feedOptions.language!,
      categories: feedOptions.categories!,
      itunesAuthor: feedOptions.author!,
      itunesSubtitle: feedOptions.description!,
      itunesSummary: feedOptions.description!,
      itunesExplicit: feedOptions.explicit!,
      itunesOwner: {
        name: feedOptions.author!,
        email: 'noreply@example.com'
      }
    });
    
    // エントリを日付順にソート（新しい順）
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    
    // 最大アイテム数を制限
    const limitedEntries = sortedEntries.slice(0, feedOptions.maxItems);
    
    // 各エントリをフィードに追加
    for (const entry of limitedEntries) {
      const fileUrl = path.basename(entry.filePath);
      const fileExt = path.extname(entry.filePath).substring(1); // 先頭の.を除去
      
      feed.addItem({
        title: entry.title,
        description: entry.title,
        url: `${feedOptions.siteUrl}/items/${entry.videoId}`,
        guid: entry.videoId,
        date: new Date(entry.publishedAt),
        enclosure: {
          url: fileUrl,
          file: entry.filePath,
          size: entry.fileSize,
          type: fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4'
        }
      });
    }
    
    // XMLを生成
    const xml = feed.buildXml();
    
    // ファイルに保存
    const outputPath = path.join(outputDir, `${channel.label}.xml`);
    await fs.writeFile(outputPath, xml);
    
    console.log(`RSSフィードを生成しました: ${outputPath}`);
    return outputPath;
  }
  
  /**
   * すべてのチャンネルのRSSフィードを生成する
   */
  public static async generateAllFeeds(
    channels: Channel[],
    historyEntriesByChannel: Map<string, HistoryEntry[]>,
    outputDir: string,
    options: FeedOptions = {}
  ): Promise<string[]> {
    const outputPaths: string[] = [];
    
    for (const channel of channels) {
      const entries = historyEntriesByChannel.get(channel.label) || [];
      if (entries.length === 0) {
        console.warn(`警告: チャンネル "${channel.label}" にはダウンロード済みの動画がありません`);
        continue;
      }
      
      const outputPath = await this.generateChannelFeed(channel, entries, outputDir, options);
      outputPaths.push(outputPath);
    }
    
    return outputPaths;
  }
} 
