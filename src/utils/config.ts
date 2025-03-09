import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';

export interface Channel {
  label: string;
  slug: string;
  feed_url: string;
  format: 'audio' | 'video';
}

export interface Storage {
  bucket: string;
}

export interface Config {
  channels: Channel[];
  storage?: Storage;
}

export async function loadConfig(configPath: string = 'config.yml'): Promise<Config> {
  try {
    const configFile = path.resolve(process.cwd(), configPath);
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
    
    return config;
  } catch (error) {
    console.error('設定ファイルの読み込みに失敗しました:', error);
    throw error;
  }
} 
