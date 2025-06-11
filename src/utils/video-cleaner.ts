import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

interface FileInfo {
  path: string;
  mtime: Date;
}

/**
 * チャンネルディレクトリ内の古い動画ファイルを削除し、最新のN件のみを保持する
 * @param channelDir チャンネルのディレクトリパス
 * @param keepCount 保持する動画ファイル数（デフォルト: 20）
 * @returns 削除されたファイル数
 */
export async function cleanOldVideos(channelDir: string, keepCount: number = 20): Promise<number> {
  if (!fs.existsSync(channelDir)) {
    Logger.log(`ディレクトリが存在しません: ${channelDir}`);
    return 0;
  }

  // ディレクトリ内のすべてのファイルを取得
  const files = fs.readdirSync(channelDir);

  // 動画/音声ファイルのみをフィルタリング（mp4, mp3）
  const mediaFiles: FileInfo[] = files
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.mp4' || ext === '.mp3';
    })
    .map(file => {
      const filePath = path.join(channelDir, file);
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        mtime: stats.mtime
      };
    });

  // ファイルがkeepCount以下の場合は何もしない
  if (mediaFiles.length <= keepCount) {
    Logger.log(`${path.basename(channelDir)}: 動画ファイル数（${mediaFiles.length}）が上限（${keepCount}）以下のため、削除なし`);
    return 0;
  }

  // 更新日時で降順ソート（新しいものが先頭）
  mediaFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // keepCount件より古いファイルを削除対象とする
  const filesToDelete = mediaFiles.slice(keepCount);
  let deletedCount = 0;

  Logger.log(`${path.basename(channelDir)}: ${filesToDelete.length}件の古い動画ファイルを削除します`);

  for (const fileInfo of filesToDelete) {
    try {
      fs.unlinkSync(fileInfo.path);
      Logger.log(`  削除: ${path.basename(fileInfo.path)} (${fileInfo.mtime.toLocaleDateString('ja-JP')})`);
      deletedCount++;
    } catch (error) {
      Logger.error(`  削除エラー: ${path.basename(fileInfo.path)} - ${error}`);
    }
  }

  return deletedCount;
}

/**
 * すべてのチャンネルディレクトリの古い動画ファイルを削除
 * @param downloadsDir ダウンロードディレクトリのルートパス
 * @param keepCount 各チャンネルで保持する動画ファイル数
 * @returns 各チャンネルの削除結果
 */
export async function cleanAllChannels(downloadsDir: string, keepCount: number = 20): Promise<{ [channel: string]: number }> {
  const results: { [channel: string]: number } = {};

  if (!fs.existsSync(downloadsDir)) {
    Logger.error(`ダウンロードディレクトリが存在しません: ${downloadsDir}`);
    return results;
  }

  // ディレクトリ内のすべてのサブディレクトリを取得
  const entries = fs.readdirSync(downloadsDir, { withFileTypes: true });
  const channelDirs = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  Logger.log(`\n古い動画ファイルのクリーンアップ開始`);
  Logger.log(`各チャンネルで最新${keepCount}件のみを保持します`);

  for (const channelName of channelDirs) {
    const channelPath = path.join(downloadsDir, channelName);
    const deletedCount = await cleanOldVideos(channelPath, keepCount);
    results[channelName] = deletedCount;
  }

  const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);
  Logger.log(`クリーンアップ完了: 合計${totalDeleted}件削除`);

  return results;
}
