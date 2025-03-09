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
}

export class HistoryManager {
  private historyFilePath: string;
  private history: Map<string, HistoryEntry>;

  constructor(historyDir: string = 'data') {
    this.historyFilePath = path.join(process.cwd(), historyDir, 'download_history.tsv');
    this.history = new Map();
    this.ensureHistoryFileSync();
    this.loadHistorySync();
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
          downloadedAt
        ] = line.split('\t');
        
        const entry: HistoryEntry = {
          channelLabel,
          videoId,
          title,
          filePath,
          fileSize: parseInt(fileSize, 10),
          format,
          publishedAt,
          downloadedAt
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
    const entry: HistoryEntry = {
      channelLabel,
      videoId: downloadResult.videoId,
      title: downloadResult.title,
      filePath: downloadResult.filePath,
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
} 
