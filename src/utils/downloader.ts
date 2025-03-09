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
  maxFileSize?: string; // 最大ファイルサイズ（例: '100M'）
  maxHeight?: number;   // 最大解像度の高さ（例: 480）
  maxBitrate?: number;     // 最大ビットレート（例: 500K）
  qualityPreset?: 'low' | 'medium' | 'high'; // 品質プリセット
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
  
  // 品質プリセットの設定
  const qualityPreset = options.qualityPreset || 'medium';
  let maxHeight: number;
  let maxBitrate: string;
  
  // プリセットに基づいて解像度とビットレートを設定
  switch (qualityPreset) {
    case 'low':
      maxHeight = options.maxHeight || 360;
      maxBitrate = options.maxBitrate ? `${options.maxBitrate}K` : '500K';
      break;
    case 'medium':
      maxHeight = options.maxHeight || 480;
      maxBitrate = options.maxBitrate ? `${options.maxBitrate}K` : '1000K';
      break;
    case 'high':
      maxHeight = options.maxHeight || 720;
      maxBitrate = options.maxBitrate ? `${options.maxBitrate}K` : '2000K';
      break;
    default:
      maxHeight = options.maxHeight || 480;
      maxBitrate = options.maxBitrate ? `${options.maxBitrate}K` : '1000K';
  }
  
  if (format === 'mp3') {
    // 音声ファイルの場合はビットレートを制限
    const audioBitrate = options.maxBitrate ? `${options.maxBitrate}K` : '128K';
    command += ` -x --audio-format mp3 --audio-quality ${audioBitrate}`;
  } else {
    // 動画ファイルの場合は解像度とビットレートを制限
    command += ` -f "bestvideo[height<=${maxHeight}][vcodec^=avc]+bestaudio[ext=m4a]/best[height<=${maxHeight}][vcodec^=avc]/best[height<=${maxHeight}]" --merge-output-format mp4`;
    
    // ビットレート制限を追加
    command += ` --postprocessor-args "ffmpeg:-c:v libx264 -b:v ${maxBitrate} -maxrate ${maxBitrate} -bufsize ${maxBitrate} -preset medium -movflags +faststart"`;
  }
  
  // ファイルサイズの上限を設定（オプション）
  if (options.maxFileSize) {
    command += ` --max-filesize ${options.maxFileSize}`;
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
