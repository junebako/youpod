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
  videoId?: string;
  title?: string;
  channelSlug?: string;
}

export interface DownloadResult {
  videoId: string;
  title: string;
  filePath: string;
  fileSize: number;
  format: string;
}

/**
 * VideoEntryオブジェクトから動画をダウンロードする
 */
export async function downloadVideo(
  videoUrlOrEntry: string | VideoEntry,
  options: DownloadOptions
): Promise<string> {
  const { outputDir, format = 'mp4', quality = 'best' } = options;
  
  // videoUrlOrEntryがstring型（URL）かVideoEntry型かを判定
  let videoUrl: string;
  let videoId: string;
  let videoTitle: string;
  
  if (typeof videoUrlOrEntry === 'string') {
    // URLが直接渡された場合
    videoUrl = videoUrlOrEntry;
    videoId = options.videoId || '';
    videoTitle = options.title || '';
  } else {
    // VideoEntryオブジェクトが渡された場合
    videoUrl = videoUrlOrEntry.videoUrl || `https://www.youtube.com/watch?v=${videoUrlOrEntry.id}`;
    videoId = videoUrlOrEntry.id;
    videoTitle = videoUrlOrEntry.title;
  }
  
  // ファイル名に使えない文字を置換
  const safeTitle = videoTitle
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
  
  // チャンネルスラグがある場合はプレフィックスとして使用
  const prefix = options.channelSlug ? `${options.channelSlug}_` : '';
  
  // 出力ファイル名を生成（video_idのみを使用）
  const outputFileName = `${videoId}.${format}`;
  const outputFilePath = path.join(outputDir, outputFileName);
  
  // すでにファイルが存在する場合はスキップ
  if (await fs.pathExists(outputFilePath)) {
    console.log(`ファイルはすでに存在します: ${outputFileName}`);
    return outputFilePath;
  }
  
  // yt-dlpコマンドを構築
  let command = `yt-dlp "${videoUrl}" --no-progress`;
  
  if (format === 'mp3') {
    command += ' -x --audio-format mp3 --audio-quality 0';
  } else {
    command += ` -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --recode mp4`;
  }
  
  command += ` -o "${outputFilePath}"`;
  
  console.log(`コマンドを実行: ${command}`);
  
  try {
    // コマンドを実行
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.warn(`警告: ${stderr}`);
    }
    
    // ファイルサイズを取得
    const stats = await fs.stat(outputFilePath);
    console.log(`ダウンロード完了: ${outputFileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return outputFilePath;
  } catch (error) {
    console.error(`ダウンロード中にエラーが発生しました: ${error}`);
    throw error;
  }
} 
