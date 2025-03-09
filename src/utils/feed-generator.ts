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
   * 相対パスを絶対パスに変換
   */
  private static toAbsolutePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.join(process.cwd(), relativePath);
  }

  /**
   * XMLを整形する（シンプルな実装）
   */
  private static prettyXml(xml: string): string {
    // XML宣言を取り出す
    const xmlDeclaration = xml.match(/^<\?xml[^>]*\?>/);
    const xmlWithoutDeclaration = xml.replace(/^<\?xml[^>]*\?>/, '');
    
    // 整形のためのシンプルな実装
    let formatted = '';
    let depth = 0;
    const tab = '  '; // 2スペースのインデント
    
    // タグごとに分割
    const tokens = xmlWithoutDeclaration.split(/(<\/?[^>]+>)/g);
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim();
      if (!token) continue;
      
      // 終了タグまたは自己終了タグの場合はインデントを減らす
      if (token.match(/^<\//)) {
        depth--;
      }
      
      // インデントを追加
      const indent = tab.repeat(Math.max(0, depth));
      
      // CDATAセクションの場合は特別処理
      if (token.includes('<![CDATA[')) {
        formatted += indent + token + '\n';
      } else if (token.match(/^<[^\/]/)) {
        // 開始タグの場合
        formatted += indent + token + '\n';
        
        // 自己終了タグでなければインデントを増やす
        if (!token.match(/\/>$/)) {
          depth++;
        }
      } else {
        // その他のタグやテキスト
        formatted += indent + token + '\n';
      }
    }
    
    // XML宣言を先頭に戻す
    if (xmlDeclaration && xmlDeclaration[0]) {
      return xmlDeclaration[0] + '\n' + formatted;
    }
    
    return formatted;
  }

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
      // ファイル名は動画IDだけを使用
      const fileExt = entry.format === 'mp3' ? 'mp3' : 'mp4';
      const fileUrl = `${entry.videoId}.${fileExt}`;
      
      // 相対パスを絶対パスに変換
      const absoluteFilePath = this.toAbsolutePath(entry.filePath);
      
      feed.addItem({
        title: entry.title,
        description: entry.title,
        url: `${feedOptions.siteUrl}/items/${entry.videoId}`,
        guid: entry.videoId,
        date: new Date(entry.publishedAt),
        enclosure: {
          url: fileUrl,
          file: absoluteFilePath,
          size: entry.fileSize,
          type: fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4'
        }
      });
    }
    
    // XMLを生成して整形
    const xml = feed.buildXml();
    const prettyXml = this.prettyXml(xml);
    
    // ファイルに保存（slugを使用）
    const outputPath = path.join(outputDir, `${channel.slug}.xml`);
    await fs.writeFile(outputPath, prettyXml);
    
    console.log(`RSSフィードを生成しました: ${outputPath}`);
    return outputPath;
  }
  
  /**
   * すべてのチャンネルの情報を含む統合フィードを生成する
   */
  public static async generateAllChannelsFeed(
    channels: Channel[],
    historyEntriesByChannel: Map<string, HistoryEntry[]>,
    outputDir: string,
    options: FeedOptions = {}
  ): Promise<string> {
    // 出力ディレクトリを確保
    await fs.ensureDir(outputDir);
    
    // デフォルトオプションをマージ
    const defaultOptions: FeedOptions = {
      title: 'すべてのチャンネル',
      description: 'すべてのYouTubeチャンネルのポッドキャスト',
      siteUrl: 'https://example.com',
      imageUrl: '',
      author: 'YouPod',
      copyright: `Copyright ${new Date().getFullYear()} YouPod`,
      language: 'ja',
      categories: ['Technology'],
      explicit: false,
      maxItems: 100
    };
    
    const feedOptions = { ...defaultOptions, ...options };
    
    // ポッドキャストフィードを作成
    const feed = new Podcast.Podcast({
      title: feedOptions.title!,
      description: feedOptions.description!,
      feedUrl: `${feedOptions.siteUrl}/all-channels.xml`,
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
    
    // すべてのエントリを収集
    const allEntries: HistoryEntry[] = [];
    for (const channel of channels) {
      const entries = historyEntriesByChannel.get(channel.label) || [];
      // チャンネル名をタイトルに追加
      const entriesWithChannelInfo = entries.map(entry => ({
        ...entry,
        title: `[${channel.label}] ${entry.title}`
      }));
      allEntries.push(...entriesWithChannelInfo);
    }
    
    // エントリを日付順にソート（新しい順）
    const sortedEntries = allEntries.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    
    // 最大アイテム数を制限
    const limitedEntries = sortedEntries.slice(0, feedOptions.maxItems);
    
    // 各エントリをフィードに追加
    for (const entry of limitedEntries) {
      // ファイル名は動画IDだけを使用
      const fileExt = entry.format === 'mp3' ? 'mp3' : 'mp4';
      const fileUrl = `${entry.videoId}.${fileExt}`;
      
      // 相対パスを絶対パスに変換
      const absoluteFilePath = this.toAbsolutePath(entry.filePath);
      
      feed.addItem({
        title: entry.title,
        description: entry.title,
        url: `${feedOptions.siteUrl}/items/${entry.videoId}`,
        guid: entry.videoId,
        date: new Date(entry.publishedAt),
        enclosure: {
          url: fileUrl,
          file: absoluteFilePath,
          size: entry.fileSize,
          type: fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4'
        }
      });
    }
    
    // XMLを生成して整形
    const xml = feed.buildXml();
    const prettyXml = this.prettyXml(xml);
    
    // ファイルに保存
    const outputPath = path.join(outputDir, 'all-channels.xml');
    await fs.writeFile(outputPath, prettyXml);
    
    console.log(`統合RSSフィードを生成しました: ${outputPath}`);
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
    
    // 各チャンネルのフィードを生成
    for (const channel of channels) {
      const entries = historyEntriesByChannel.get(channel.label) || [];
      if (entries.length === 0) {
        console.warn(`警告: チャンネル "${channel.label}" にはダウンロード済みの動画がありません`);
        continue;
      }
      
      const outputPath = await this.generateChannelFeed(channel, entries, outputDir, options);
      outputPaths.push(outputPath);
    }
    
    // すべてのチャンネルを含む統合フィードを生成
    const allChannelsPath = await this.generateAllChannelsFeed(channels, historyEntriesByChannel, outputDir, options);
    outputPaths.push(allChannelsPath);
    
    return outputPaths;
  }
} 
