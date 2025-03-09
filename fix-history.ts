import fs from 'fs';
import path from 'path';

// ダウンロード履歴ファイルのパス
const historyFilePath = path.join(process.cwd(), 'data', 'download_history.tsv');

// 履歴ファイルを読み込む
const content = fs.readFileSync(historyFilePath, 'utf-8');
const lines = content.trim().split('\n');

// ヘッダー行をスキップ
const entries = [];
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
  
  // チャンネルスラグを取得（ファイルパスから）
  let channelSlug = '';
  if (filePath.includes('/')) {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      channelSlug = parts[1];
    }
  }
  
  if (!channelSlug) {
    console.warn(`警告: チャンネルスラグが見つかりません: ${filePath}`);
    continue;
  }
  
  // エントリを追加
  entries.push({
    channelLabel,
    channelSlug,
    videoId,
    title,
    filePath,
    publishedAt,
    downloadedAt
  });
}

// チャンネルごとにグループ化
const entriesByChannel = {};
for (const entry of entries) {
  if (!entriesByChannel[entry.channelSlug]) {
    entriesByChannel[entry.channelSlug] = [];
  }
  entriesByChannel[entry.channelSlug].push(entry);
}

// 各チャンネルの履歴ファイルを生成
for (const channelSlug in entriesByChannel) {
  const channelEntries = entriesByChannel[channelSlug];
  const outputPath = path.join(process.cwd(), 'data', `${channelSlug}_history.tsv`);
  
  let output = '';
  for (const entry of channelEntries) {
    // videoId, title, url, publishDate, downloadDate, filePath
    const url = `https://www.youtube.com/watch?v=${entry.videoId}`;
    output += `${entry.videoId}\t${entry.title}\t${url}\t${entry.publishedAt}\t${entry.downloadedAt}\t${entry.filePath}\n`;
  }
  
  fs.writeFileSync(outputPath, output);
  console.log(`チャンネル ${channelSlug} の履歴ファイルを生成しました: ${outputPath}`);
}

console.log('履歴ファイルの生成が完了しました。'); 
