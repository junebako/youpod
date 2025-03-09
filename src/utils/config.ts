import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';

export interface Channel {
  label: string;
  slug: string;
  feed_url: string;
  format: 'audio' | 'video';
  iconUrl?: string; // チャンネルアイコンのURL
}

export interface R2Storage {
  type: 'r2';
  bucket: string;
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  public_url?: string;
}

export interface Config {
  channels: Channel[];
  storage?: R2Storage;
}

export async function loadConfig(configPath: string = 'config.yml'): Promise<Config> {
  try {
    const configFile = path.resolve(process.cwd(), configPath);
    
    // 設定ファイルが存在するか確認
    if (!await fs.pathExists(configFile)) {
      console.error(`エラー: 設定ファイル ${configPath} が見つかりません。`);
      console.error('config.example.yml をコピーして config.yml を作成してください:');
      console.error('  cp config.example.yml config.yml');
      console.error('その後、config.yml を編集して必要な情報を設定してください。');
      throw new Error(`設定ファイル ${configPath} が見つかりません`);
    }
    
    const fileContents = await fs.readFile(configFile, 'utf8');
    const config = yaml.load(fileContents) as Config;
    
    if (!config.channels || !Array.isArray(config.channels)) {
      throw new Error('設定ファイルに channels が定義されていないか、配列ではありません');
    }
    
    // 各チャンネルの設定を検証
    config.channels.forEach((channel, index) => {
      if (!channel.label) {
        throw new Error(`channels[${index}] に label が定義されていません`);
      }
      if (!channel.feed_url) {
        throw new Error(`channels[${index}] に feed_url が定義されていません`);
      }
      
      // slugが未定義の場合はlabelから生成
      if (!channel.slug) {
        channel.slug = channel.label
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
      }
      
      // formatが未定義または無効な場合はデフォルト値を設定
      if (!channel.format || !['audio', 'video'].includes(channel.format)) {
        channel.format = 'video'; // デフォルトはvideo
      }
    });
    
    // ストレージの設定を検証
    if (config.storage && config.storage.type === 'r2') {
      if (!config.storage.bucket) {
        throw new Error('storage.bucket が定義されていません');
      }
      
      // 必須のR2設定が不足している場合は警告を表示
      if (!config.storage.account_id || !config.storage.access_key_id || !config.storage.secret_access_key) {
        console.warn('警告: R2の認証情報が不完全です。アップロード機能は利用できません。');
      }
    }
    
    return config;
  } catch (error) {
    console.error('設定ファイルの読み込みに失敗しました:', error);
    throw error;
  }
} 
