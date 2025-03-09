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
  const { outputDir, format = 'mp4', quality = 'best' } = options;
  const videoId = videoEntry.id;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // ディレクトリが存在しない場合は作成
  await fs.ensureDir(outputDir);
  
  // ファイル名を動画IDだけにする
  const fileName = `${videoId}.${format}`;
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
    let command = '';
    
    if (format === 'mp3') {
      // 音声のみを抽出してmp3形式で保存
      command = `yt-dlp "${videoUrl}" -o "${filePath}" -x --audio-format mp3 --audio-quality 0`;
    } else if (format === 'mp4') {
      // 動画をmp4形式で保存（シンプルな方法）
      // 一時ファイル名を作成（拡張子なし）
      const tempFilePath = path.join(outputDir, videoId);
      
      // mp4形式で直接ダウンロード（より単純なオプション）
      command = `yt-dlp "${videoUrl}" -o "${tempFilePath}.%(ext)s" -f "best[ext=mp4]/best" --recode-video mp4`;
    }
    
    // 追加オプション
    command += ' --no-check-certificate --no-warnings';
    
    console.log(`実行コマンド: ${command}`);
    
    // コマンドを実行
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.error(`コマンド実行中のエラー: ${stderr}`);
    }
    
    if (stdout) {
      console.log(`コマンド出力: ${stdout.substring(0, 200)}...`);
    }
    
    // ファイルが存在するか確認
    if (await fs.pathExists(filePath)) {
      console.log(`ダウンロード完了: ${fileName}`);
      
      const stats = await fs.stat(filePath);
      return {
        videoId,
        title: videoEntry.title,
        filePath,
        fileSize: stats.size,
        format
      };
    } else {
      // mp4の場合、拡張子が自動的に付けられている可能性があるので検索
      if (format === 'mp4') {
        const dir = await fs.readdir(outputDir);
        const matchingFile = dir.find(file => file.startsWith(`${videoId}.`) || file.startsWith(`${videoId}-`));
        
        if (matchingFile) {
          const actualFilePath = path.join(outputDir, matchingFile);
          const stats = await fs.stat(actualFilePath);
          
          // 必要に応じてファイル名を修正
          if (path.basename(actualFilePath) !== fileName) {
            const newFilePath = path.join(outputDir, fileName);
            await fs.rename(actualFilePath, newFilePath);
            console.log(`ファイル名を修正しました: ${matchingFile} -> ${fileName}`);
            
            return {
              videoId,
              title: videoEntry.title,
              filePath: newFilePath,
              fileSize: stats.size,
              format
            };
          }
          
          console.log(`ダウンロード完了: ${matchingFile}`);
          return {
            videoId,
            title: videoEntry.title,
            filePath: actualFilePath,
            fileSize: stats.size,
            format
          };
        }
      }
      
      throw new Error(`ダウンロードは成功したようですが、ファイルが見つかりません: ${filePath}`);
    }
  } catch (error) {
    console.error(`ダウンロードエラー: ${error instanceof Error ? error.message : String(error)}`);
    // エラーが発生した場合、部分的にダウンロードされたファイルを削除
    if (await fs.pathExists(filePath)) {
      await fs.unlink(filePath).catch(() => {});
    }
    throw error;
  }
} 
