import fs from 'fs-extra';
import path from 'path';
import { create } from 'xmlbuilder2';
import { Channel } from './config';
import { HistoryEntry } from './history';
import { Logger } from './logger';

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
  baseUrl?: string;
}

export class FeedGenerator {
  /**
   * 相対パスを絶対パスに変換する
   */
  private static toAbsolutePath(relativePath: string): string {
    if (!relativePath) return '';
    if (path.isAbsolute(relativePath)) return relativePath;
    return path.resolve(process.cwd(), relativePath);
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

    // チャンネルIDを取得
    const channelId = channel.feed_url.split('channel_id=')[1];

    // チャンネルアイコンのパスを設定
    const iconPath = path.join('icons', `${channel.slug}.jpg`);
    const hasCustomIcon = channel.iconUrl && await fs.pathExists(path.join(outputDir, iconPath));

    // デフォルトオプションをマージ
    const defaultOptions: FeedOptions = {
      title: channel.label,
      description: `${channel.label} のポッドキャスト`,
      siteUrl: `https://www.youtube.com/channel/${channelId}`,
      imageUrl: hasCustomIcon ? iconPath : 'icon.jpg', // チャンネル固有のアイコンがあれば使用
      author: channel.label,
      copyright: `Copyright ${new Date().getFullYear()} ${channel.label}`,
      language: 'ja',
      categories: ['Technology'],
      explicit: false,
      maxItems: 50,
      baseUrl: ''
    };

    const feedOptions = { ...defaultOptions, ...options };

    // 絶対パスのイメージURLを生成
    const absoluteImageUrl = feedOptions.baseUrl
      ? `${feedOptions.baseUrl}/podcasts/${channel.slug}/icon.jpg`
      : feedOptions.imageUrl;

    // フィードURLを生成
    const feedUrl = feedOptions.baseUrl
      ? `${feedOptions.baseUrl}/podcasts/${channel.slug}/feed.xml`
      : `${feedOptions.siteUrl}/feed.xml`;

    // エントリを日付順にソート（新しい順）
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // 最大アイテム数を制限
    const limitedEntries = sortedEntries.slice(0, feedOptions.maxItems);

    // XMLドキュメントを作成
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('rss', {
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        'xmlns:atom': 'http://www.w3.org/2005/Atom',
        'version': '2.0',
        'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
        'xmlns:podcast': 'https://podcastindex.org/namespace/1.0'
      })
      .ele('channel')
        .ele('title').dat(feedOptions.title!).up()
        .ele('description').dat(feedOptions.description!).up()
        .ele('link').txt(feedOptions.siteUrl!).up()
        .ele('generator').txt('YouPod Generator').up()
        .ele('lastBuildDate').txt(new Date().toUTCString()).up()
        .ele('atom:link', {
          'href': feedUrl,
          'rel': 'self',
          'type': 'application/rss+xml'
        }).up()
        .ele('author').txt(`${feedOptions.author!} <noreply@example.com>`).up()
        .ele('copyright').dat(feedOptions.copyright!).up()
        .ele('language').dat(feedOptions.language!).up();

    // カテゴリを追加
    for (const category of feedOptions.categories!) {
      doc.ele('category').dat(category).up();
    }

    // iTunes固有の情報を追加
    doc.ele('itunes:author').txt(feedOptions.author!).up()
      .ele('itunes:subtitle').txt(feedOptions.description!).up()
      .ele('itunes:summary').txt(feedOptions.description!).up()
      .ele('itunes:owner')
        .ele('itunes:name').txt(feedOptions.author!).up()
        .ele('itunes:email').txt('noreply@example.com').up()
      .up()
      .ele('itunes:explicit').txt(feedOptions.explicit! ? 'true' : 'false').up()
      .ele('itunes:image', { 'href': absoluteImageUrl }).up();

    // 各エントリをフィードに追加
    for (const entry of limitedEntries) {
      // ファイル名は動画IDだけを使用
      const fileExt = entry.format === 'mp3' ? 'mp3' : 'mp4';

      // 相対パスを絶対パスに変換
      const absoluteFilePath = this.toAbsolutePath(entry.filePath);

      // ファイルURLを生成（baseUrlがあれば絶対パス、なければ相対パス）
      const fileUrl = feedOptions.baseUrl
        ? `${feedOptions.baseUrl}/podcasts/${channel.slug}/media/${entry.videoId}.${fileExt}`
        : `${entry.videoId}.${fileExt}`;

      // アイテムのアイコンURL
      const itunesImageUrl = feedOptions.baseUrl
        ? `${feedOptions.baseUrl}/podcasts/${channel.slug}/icon.jpg`
        : feedOptions.imageUrl!;

      // アイテムを追加
      const item = doc.ele('item')
        .ele('title').dat(entry.title).up()
        .ele('description').dat(entry.description || entry.title).up()
        .ele('link').txt(`https://www.youtube.com/watch?v=${entry.videoId}`).up()
        .ele('guid', { 'isPermaLink': 'false' }).txt(entry.videoId).up()
        .ele('dc:creator').dat(feedOptions.author!).up()
        .ele('pubDate').txt(new Date(entry.publishedAt).toUTCString()).up()
        .ele('enclosure', {
          'url': fileUrl,
          'length': entry.fileSize,
          'type': fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4'
        }).up()
        .ele('itunes:summary').txt(entry.description || entry.title).up()
        .ele('itunes:explicit').txt(feedOptions.explicit! ? 'true' : 'false').up()
        .ele('itunes:image', { 'href': itunesImageUrl }).up();
    }

    // XMLを生成
    const xml = doc.end({ prettyPrint: true });

    // ファイルに保存（slugを使用）
    const outputPath = path.join(outputDir, `${channel.slug}.xml`);
    await fs.writeFile(outputPath, xml);

    Logger.log(`RSSフィードを生成しました: ${outputPath}`);
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
      title: 'YouPod',
      description: 'YouTubeをビデオポッドキャストに',
      siteUrl: 'https://juneboku.xyz',
      imageUrl: 'icon.jpg', // チャンネルのアイコンを設定
      author: 'YouPod',
      copyright: `Copyright ${new Date().getFullYear()} YouPod`,
      language: 'ja',
      categories: ['Technology'],
      explicit: false,
      maxItems: 100,
      baseUrl: ''
    };

    const feedOptions = { ...defaultOptions, ...options };

    // 絶対パスのイメージURLを生成
    const absoluteImageUrl = feedOptions.baseUrl
      ? `${feedOptions.baseUrl}/podcasts/all/icon.jpg`
      : feedOptions.imageUrl;

    // フィードURLを生成
    const feedUrl = `${feedOptions.baseUrl}/podcasts/all/feed.xml`;

    // すべてのエントリを収集
    const allEntries: HistoryEntry[] = [];
    const channelMap = new Map<string, Channel>();

    for (const channel of channels) {
      const entries = historyEntriesByChannel.get(channel.slug) || [];
      // チャンネル情報をマップに保存
      channelMap.set(channel.label, channel);
      // エントリをそのまま追加（タイトルにチャンネル名を追加しない）
      allEntries.push(...entries);
    }

    // エントリを日付順にソート（新しい順）
    const sortedEntries = allEntries.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // 最大アイテム数を制限
    const limitedEntries = sortedEntries.slice(0, feedOptions.maxItems);

    // XMLドキュメントを作成
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('rss', {
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        'xmlns:atom': 'http://www.w3.org/2005/Atom',
        'version': '2.0',
        'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
        'xmlns:podcast': 'https://podcastindex.org/namespace/1.0'
      })
      .ele('channel')
        .ele('title').dat(feedOptions.title!).up()
        .ele('description').dat(feedOptions.description!).up()
        .ele('link').txt(feedOptions.siteUrl!).up()
        .ele('generator').txt('YouPod Generator').up()
        .ele('lastBuildDate').txt(new Date().toUTCString()).up()
        .ele('atom:link', {
          'href': feedUrl,
          'rel': 'self',
          'type': 'application/rss+xml'
        }).up()
        .ele('author').txt(`${feedOptions.author!} <noreply@example.com>`).up()
        .ele('copyright').dat(feedOptions.copyright!).up()
        .ele('language').dat(feedOptions.language!).up();

    // カテゴリを追加
    for (const category of feedOptions.categories!) {
      doc.ele('category').dat(category).up();
    }

    // iTunes固有の情報を追加
    doc.ele('itunes:author').txt(feedOptions.author!).up()
      .ele('itunes:subtitle').txt(feedOptions.description!).up()
      .ele('itunes:summary').txt(feedOptions.description!).up()
      .ele('itunes:owner')
        .ele('itunes:name').txt(feedOptions.author!).up()
        .ele('itunes:email').txt('noreply@example.com').up()
      .up()
      .ele('itunes:explicit').txt(feedOptions.explicit! ? 'true' : 'false').up()
      .ele('itunes:image', { 'href': absoluteImageUrl }).up();

    // 各エントリをフィードに追加
    for (const entry of limitedEntries) {
      // ファイル名は動画IDだけを使用
      const fileExt = entry.format === 'mp3' ? 'mp3' : 'mp4';

      // 相対パスを絶対パスに変換
      const absoluteFilePath = this.toAbsolutePath(entry.filePath);

      // チャンネル情報を取得
      const channel = channelMap.get(entry.channelLabel);

      // チャンネルスラグを取得（チャンネルが見つからない場合はラベルから生成）
      const channelSlug = channel ? channel.slug : entry.channelLabel.toLowerCase().replace(/\s+/g, '-');

      // ファイルURLを生成（baseUrlがあれば絶対パス、なければ相対パス）
      const fileUrl = feedOptions.baseUrl
        ? `${feedOptions.baseUrl}/podcasts/${channelSlug}/media/${entry.videoId}.${fileExt}`
        : `${entry.videoId}.${fileExt}`;

      // アイテムのアイコンURL
      const itunesImageUrl = feedOptions.baseUrl
        ? `${feedOptions.baseUrl}/podcasts/${channelSlug}/icon.jpg`
        : feedOptions.imageUrl!;

      // アイテムを追加
      const item = doc.ele('item')
        .ele('title').dat(entry.title).up()
        .ele('description').dat(entry.description || entry.title).up()
        .ele('link').txt(`https://www.youtube.com/watch?v=${entry.videoId}`).up()
        .ele('guid', { 'isPermaLink': 'false' }).txt(entry.videoId).up()
        .ele('dc:creator').dat(feedOptions.author!).up()
        .ele('pubDate').txt(new Date(entry.publishedAt).toUTCString()).up()
        .ele('enclosure', {
          'url': fileUrl,
          'length': entry.fileSize,
          'type': fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4'
        }).up()
        .ele('itunes:summary').txt(entry.description || entry.title).up()
        .ele('itunes:explicit').txt(feedOptions.explicit! ? 'true' : 'false').up()
        .ele('itunes:image', { 'href': itunesImageUrl }).up();
    }

    // XMLを生成
    const xml = doc.end({ prettyPrint: true });

    // ファイルに保存
    const outputPath = path.join(outputDir, 'all-channels.xml');
    await fs.writeFile(outputPath, xml);

    Logger.log(`統合RSSフィードを生成しました: ${outputPath}`);
    return outputPath;
  }

  /**
   * すべてのフィードを生成する
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
      const entries = historyEntriesByChannel.get(channel.slug) || [];
      if (entries.length === 0) {
        Logger.log(`チャンネル "${channel.label}" の履歴がありません`);
        continue;
      }

      Logger.log(`チャンネル ${channel.slug} の履歴を ${entries.length} 件読み込みました`);

      const outputPath = await this.generateChannelFeed(channel, entries, outputDir, options);
      outputPaths.push(outputPath);
    }

    // すべてのチャンネルを含む統合フィードを生成
    const allChannelsPath = await this.generateAllChannelsFeed(channels, historyEntriesByChannel, outputDir, options);
    outputPaths.push(allChannelsPath);

    return outputPaths;
  }
}
