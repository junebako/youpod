import fs from 'fs';
import path from 'path';

// ダウンロードディレクトリのパス
const downloadsDir = path.join(process.cwd(), 'downloads');

// 新しい命名規則に沿っているかチェックする関数
function isValidFileName(fileName: string): boolean {
  // 拡張子を取得
  const ext = path.extname(fileName);
  if (ext !== '.mp3' && ext !== '.mp4') {
    return true; // mp3とmp4以外のファイルはスキップ
  }
  
  // ファイル名（拡張子なし）を取得
  const baseName = path.basename(fileName, ext);
  
  // 新しい命名規則: videoIdのみ（11文字の英数字とハイフン、アンダースコア）
  const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  return videoIdPattern.test(baseName);
}

// ディレクトリ内のファイルを再帰的に処理する関数
async function processDirectory(dirPath: string): Promise<void> {
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        // サブディレクトリを再帰的に処理
        await processDirectory(itemPath);
      } else if (stats.isFile()) {
        // ファイルの場合、命名規則をチェック
        if (!isValidFileName(item)) {
          console.log(`削除: ${itemPath}`);
          fs.unlinkSync(itemPath);
        } else {
          console.log(`保持: ${itemPath}`);
        }
      }
    }
  } catch (error) {
    console.error(`エラー: ${error}`);
  }
}

// メイン処理
async function main() {
  console.log('新しい命名規則に沿わないファイルを削除します...');
  
  if (!fs.existsSync(downloadsDir)) {
    console.log(`ディレクトリが存在しません: ${downloadsDir}`);
    return;
  }
  
  await processDirectory(downloadsDir);
  console.log('処理が完了しました。');
}

main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
