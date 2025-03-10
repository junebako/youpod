import fs from 'fs-extra';
import path from 'path';
import { VideoEntry } from './feed';
import { DownloadResult } from './downloader';

export interface HistoryEntry {
  channelLabel: string;
  videoId: string;
  title: string;
  filePath: string;
  fileSize: number;
  format: string;
  publishedAt: string;
  downloadedAt: string;
  description?: string;
}

export interface SimpleHistoryEntry {
  videoId: string;
  title: string;
  url: string;
  publishDate: string;
  downloadDate: Date | string;
  filePath: string;
  channelLabel?: string;
  description?: string;
}

export class HistoryManager {
  private historyFilePath: string;
  private history: Map<string, HistoryEntry>;
  private rootDir: string;

  constructor(historyDir: string = 'data') {
    this.rootDir = process.cwd();
    this.historyFilePath = path.join(this.rootDir, historyDir, 'download_history.tsv');
    this.history = new Map();
    this.ensureHistoryFileSync();
    this.loadHistorySync();
  }

  /**
   * 絶対パスを相対パスに変換
   */
  private toRelativePath(absolutePath: string): string {
    return path.relative(this.rootDir, absolutePath);
  }

  /**
   * 履歴ファイルが存在することを確認し、なければ作成する（同期版）
   */
  private ensureHistoryFileSync(): void {
    const dir = path.dirname(this.historyFilePath);
    fs.ensureDirSync(dir);

    if (!fs.pathExistsSync(this.historyFilePath)) {
      // ヘッダー行を書き込む
      const header = [
        'channelLabel',
        'videoId',
        'title',
        'filePath',
        'fileSize',
        'format',
        'publishedAt',
        'downloadedAt'
      ].join('\t');
      fs.writeFileSync(this.historyFilePath, header + '\n');
    }
  }

  /**
   * 履歴ファイルから履歴を読み込む（同期版）
   */
  private loadHistorySync(): void {
    try {
      const content = fs.readFileSync(this.historyFilePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      // ヘッダー行をスキップ
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const [
          channelLabel,
          videoId,
          title,
          filePath,
          fileSize,
          format,
          publishedAt,
          downloadedAt,
          encodedDescription
        ] = line.split('\t');
        
        // Base64エンコードされた説明文をデコード
        let description: string | undefined;
        if (encodedDescription) {
          try {
            description = Buffer.from(encodedDescription, 'base64').toString('utf-8');
          } catch (e) {
            console.warn(`警告: 説明文のデコードに失敗しました: ${videoId}`);
          }
        }
        
        const entry: HistoryEntry = {
          channelLabel,
          videoId,
          title,
          filePath,
          fileSize: parseInt(fileSize, 10),
          format,
          publishedAt,
          downloadedAt,
          description
        };
        
        this.history.set(videoId, entry);
      }
      
      console.log(`${this.history.size}件のダウンロード履歴を読み込みました`);
    } catch (error) {
      console.error('履歴の読み込みに失敗しました:', error);
      // エラーが発生しても処理を続行
    }
  }

  /**
   * 動画がすでにダウンロードされているかチェック
   */
  public isDownloaded(videoId: string): boolean {
    return this.history.has(videoId);
  }

  /**
   * 特定のチャンネルの履歴エントリを取得
   */
  public getChannelEntries(channelLabel: string): HistoryEntry[] {
    return Array.from(this.history.values())
      .filter(entry => entry.channelLabel === channelLabel)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  /**
   * 履歴に新しいエントリを追加
   */
  public async addEntry(
    channelLabel: string,
    videoEntry: VideoEntry,
    downloadResult: DownloadResult
  ): Promise<void> {
    // ファイルパスを相対パスに変換
    const relativeFilePath = this.toRelativePath(downloadResult.filePath);
    
    const entry: HistoryEntry = {
      channelLabel,
      videoId: downloadResult.videoId,
      title: downloadResult.title,
      filePath: relativeFilePath,
      fileSize: downloadResult.fileSize,
      format: downloadResult.format,
      publishedAt: videoEntry.published,
      downloadedAt: new Date().toISOString()
    };
    
    this.history.set(entry.videoId, entry);
    
    // TSVファイルに追記
    const line = [
      entry.channelLabel,
      entry.videoId,
      entry.title,
      entry.filePath,
      entry.fileSize,
      entry.format,
      entry.publishedAt,
      entry.downloadedAt
    ].join('\t');
    
    await fs.appendFile(this.historyFilePath, line + '\n');
  }

  /**
   * チャンネルスラグを使用して履歴を読み込む
   */
  public async loadHistory(channelSlug: string): Promise<SimpleHistoryEntry[]> {
    try {
      // メインの履歴ファイルのパス
      const historyFilePath = this.historyFilePath;
      
      // ファイルが存在しない場合は空の配列を返す
      if (!await fs.pathExists(historyFilePath)) {
        return [];
      }
      
      const content = await fs.readFile(historyFilePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      // ヘッダー行がない場合は空の配列を返す
      if (lines.length <= 1) {
        return [];
      }
      
      const entries: SimpleHistoryEntry[] = [];
      
      // ヘッダー行をスキップ
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const [
          channelLabel,
          videoId,
          title,
          filePath,
          fileSize,
          format,
          publishedAt,
          downloadedAt
        ] = line.split('\t');
        
        // 指定されたチャンネルスラグに関連するエントリのみを追加
        // ファイルパスにチャンネルスラグが含まれているかどうかで判断
        if (filePath.includes(channelSlug)) {
          entries.push({
            videoId,
            title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            publishDate: publishedAt,
            downloadDate: downloadedAt,
            filePath,
            channelLabel
          });
        }
      }
      
      console.log(`チャンネル ${channelSlug} の履歴を ${entries.length} 件読み込みました`);
      return entries;
    } catch (error) {
      console.error(`チャンネル ${channelSlug} の履歴読み込みに失敗しました:`, error);
      return [];
    }
  }

  /**
   * チャンネルスラグを使用して履歴に追加
   */
  public async addToHistory(channelSlug: string, entry: SimpleHistoryEntry): Promise<void> {
    try {
      // メインの履歴ファイルのパス
      const historyFilePath = this.historyFilePath;
      
      // ディレクトリが存在することを確認
      await fs.ensureDir(path.dirname(historyFilePath));
      
      // ファイルパスを相対パスに変換
      const relativeFilePath = this.toRelativePath(entry.filePath);
      
      // ファイルサイズを取得
      let fileSize = 0;
      try {
        const stats = await fs.stat(entry.filePath);
        fileSize = stats.size;
      } catch (error) {
        console.warn(`警告: ファイルサイズの取得に失敗しました: ${entry.filePath}`);
      }
      
      // ファイル形式を取得
      const format = path.extname(entry.filePath).replace('.', '');
      
      // チャンネルラベルを取得（エントリから取得するか、スラグから推測）
      const channelLabel = entry.channelLabel || (channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1).replace(/-/g, ' '));
      
      // 新しいエントリを作成
      const newEntry: HistoryEntry = {
        channelLabel,
        videoId: entry.videoId,
        title: entry.title,
        filePath: relativeFilePath,
        fileSize,
        format,
        publishedAt: entry.publishDate,
        downloadedAt: typeof entry.downloadDate === 'string' ? entry.downloadDate : entry.downloadDate.toISOString(),
        description: entry.description
      };
      
      // 既存のエントリを確認
      if (this.history.has(entry.videoId)) {
        // 既存のエントリを更新
        this.history.set(entry.videoId, newEntry);
      } else {
        // 新しいエントリを追加
        this.history.set(entry.videoId, newEntry);
        
        // ファイルに追加
        const encodedDescription = newEntry.description ? Buffer.from(newEntry.description).toString('base64') : '';
        const line = [
          newEntry.channelLabel,
          newEntry.videoId,
          newEntry.title,
          newEntry.filePath,
          newEntry.fileSize,
          newEntry.format,
          newEntry.publishedAt,
          newEntry.downloadedAt,
          encodedDescription // Base64エンコードされた説明文
        ].join('\t');
        
        await fs.appendFile(historyFilePath, line + '\n');
      }
    } catch (error) {
      console.error(`履歴への追加に失敗しました:`, error);
      throw error;
    }
  }
} 
