import fs from 'fs';
import path from 'path';
import { loadConfig } from './src/utils/config';

// メイン処理
async function main() {
  try {
    // 設定ファイルを読み込む
    const config = await loadConfig();
    console.log(`${config.channels.length}個のチャンネルが設定されています`);
    
    // チャンネルのマップを作成（slugをキーにしてlabelを取得できるようにする）
    const channelMap = new Map<string, string>();
    for (const channel of config.channels) {
      channelMap.set(channel.slug, channel.label);
    }
    
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
    
    // 各行を処理
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const parts = line.split('\t');
      if (parts.length < 8) continue;
      
      // ファイルパスからチャンネルスラグを抽出
      const filePath = parts[3];
      let channelSlug = '';
      
      if (filePath.includes('/')) {
        const pathParts = filePath.split('/');
        if (pathParts.length >= 2) {
          channelSlug = pathParts[1];
        }
      }
      
      // チャンネルラベルを取得
      let channelLabel = parts[0];
      if (channelSlug && channelMap.has(channelSlug)) {
        // 設定ファイルから正しいラベルを取得
        channelLabel = channelMap.get(channelSlug)!;
      }
      
      // 行を修正
      parts[0] = channelLabel;
      newLines.push(parts.join('\t'));
    }
    
    // ファイルに書き込む
    fs.writeFileSync(historyFilePath, newLines.join('\n'));
    console.log(`ダウンロード履歴ファイルを更新しました: ${newLines.length - 1}件のエントリを処理しました`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// スクリプトを実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
}); 
