import fs from 'fs';
import path from 'path';

// メイン処理
async function main() {
  try {
    // ダウンロード履歴ファイルのパス
    const historyFilePath = path.join(process.cwd(), 'data', 'download_history.tsv');
    
    // ファイルが存在するか確認
    if (!fs.existsSync(historyFilePath)) {
      console.log('ダウンロード履歴ファイルが見つかりません');
      return;
    }
    
    // ファイルを読み込む
    const content = fs.readFileSync(historyFilePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    // ヘッダー行を取得
    const header = lines[0];
    
    // 修正後の行を格納する配列
    const newLines = [header];
    
    // 削除されたエントリの数
    let removedCount = 0;
    
    // 各行を処理
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const parts = line.split('\t');
      if (parts.length < 8) continue;
      
      // ファイルパスを取得
      const filePath = parts[3];
      const absoluteFilePath = path.join(process.cwd(), filePath);
      
      // ファイルが存在するか確認
      if (fs.existsSync(absoluteFilePath)) {
        // ファイルが存在する場合は行を保持
        newLines.push(line);
      } else {
        // ファイルが存在しない場合は行を削除
        console.log(`削除: ${filePath} (ファイルが存在しません)`);
        removedCount++;
      }
    }
    
    // ファイルに書き込む
    fs.writeFileSync(historyFilePath, newLines.join('\n'));
    console.log(`ダウンロード履歴ファイルを更新しました: ${removedCount}件のエントリを削除しました`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// スクリプトを実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
