import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { VideoEntry } from './feed';

const execAsync = promisify(exec);

export interface DownloadOptions {
  outputDir: string;
  format?: 'mp3' | 'mp4';
  quality?: string;
}

export interface DownloadResult {
  videoId: string;
  title: string;
  filePath: string;
  fileSize: number;
  format: string;
}

export async function downloadVideo(
  videoEntry: VideoEntry,
  options: DownloadOptions
): Promise<DownloadResult> {
  const { outputDir, format = 'mp3', quality = 'best' } = options;
  const videoId = videoEntry.id;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // ディレクトリが存在しない場合は作成
  await fs.ensureDir(outputDir);
  
  // ファイル名を作成（ファイル名に使えない文字を置換）
  const safeTitle = videoEntry.title.replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `${safeTitle}-${videoId}.${format}`;
  const filePath = path.join(outputDir, fileName);
  
  // 既にファイルが存在する場合はスキップ
  if (await fs.pathExists(filePath)) {
    const stats = await fs.stat(filePath);
    console.log(`ファイルが既に存在します: ${fileName}`);
    return {
      videoId,
      title: videoEntry.title,
      filePath,
      fileSize: stats.size,
      format
    };
  }
  
  console.log(`ダウンロード開始: ${videoEntry.title}`);
  
  try {
    // yt-dlpコマンドを構築
    let command = `yt-dlp "${videoUrl}" -o "${filePath}"`;
    
    if (format === 'mp3') {
      command += ' -x --audio-format mp3 --audio-quality 0';
    } else {
      command += ` -f ${quality}`;
    }
    
    // 追加オプション
    command += ' --no-check-certificate --no-warnings';
    
    // コマンドを実行
    await execAsync(command);
    
    console.log(`ダウンロード完了: ${fileName}`);
    
    const stats = await fs.stat(filePath);
    return {
      videoId,
      title: videoEntry.title,
      filePath,
      fileSize: stats.size,
      format
    };
  } catch (error) {
    console.error(`ダウンロードエラー: ${error instanceof Error ? error.message : String(error)}`);
    // エラーが発生した場合、部分的にダウンロードされたファイルを削除
    if (await fs.pathExists(filePath)) {
      await fs.unlink(filePath).catch(() => {});
    }
    throw error;
  }
} 
