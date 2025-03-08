import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';

export interface Channel {
  label: string;
  feed_url: string;
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
    
    return config;
  } catch (error) {
    console.error('設定ファイルの読み込みに失敗しました:', error);
    throw error;
  }
} 
