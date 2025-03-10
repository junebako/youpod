import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Logger } from './logger';

export interface VideoEntry {
  id: string;
  videoId: string;
  title: string;
  link: string;
  videoUrl: string;
  published: string;
  publishDate: string;
  updated: string;
  author: {
    name: string;
    uri: string;
  };
  mediaGroup: {
    thumbnail: {
      url: string;
      width: number;
      height: number;
    };
    description: string;
  };
}

// チャンネルアイコン情報を格納するインターフェース
export interface ChannelIcon {
  url: string;
  width: number;
  height: number;
}

export async function fetchYouTubeFeed(feedUrl: string): Promise<VideoEntry[]> {
  try {
    const response = await axios.get(feedUrl);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'entry',
      processEntities: true,
      parseAttributeValue: true,
      parseTagValue: true,
    });
    
    const result = parser.parse(response.data);
    
    if (!result.feed || !result.feed.entry) {
      Logger.warn('フィードにエントリーが見つかりませんでした:', feedUrl);
      return [];
    }
    
    return result.feed.entry.map((entry: any) => {
      const videoId = entry['yt:videoId'];
      return {
        id: videoId,
        videoId: videoId,
        title: entry.title,
        link: entry.link.href,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        published: entry.published,
        publishDate: entry.published,
        updated: entry.updated,
        author: {
          name: entry.author.name,
          uri: entry.author.uri
        },
        mediaGroup: {
          thumbnail: {
            url: entry['media:group']['media:thumbnail'].url,
            width: entry['media:group']['media:thumbnail'].width,
            height: entry['media:group']['media:thumbnail'].height
          },
          description: entry['media:group']['media:description']
        }
      };
    });
  } catch (error) {
    Logger.error('YouTubeフィードの取得に失敗しました:', error);
    throw error;
  }
}

/**
 * YouTubeチャンネルのアイコン画像URLを取得する
 * @param channelId YouTubeチャンネルID
 * @returns チャンネルアイコン情報（サイズ別）
 */
export async function fetchChannelIcon(channelId: string): Promise<{
  default: ChannelIcon;
  medium: ChannelIcon;
  high: ChannelIcon;
} | null> {
  try {
    // チャンネルページのHTMLを取得
    const response = await axios.get(`https://www.youtube.com/channel/${channelId}`);
    const html = response.data;

    // チャンネルアイコンURLを抽出するための正規表現
    // YouTubeのHTMLからアイコン画像URLを抽出
    const iconRegex = /"avatar":\s*{\s*"thumbnails":\s*\[\s*{\s*"url":\s*"([^"]+)"/;
    const match = html.match(iconRegex);

    if (!match || !match[1]) {
      Logger.warn('チャンネルアイコンが見つかりませんでした:', channelId);
      return null;
    }

    // 基本URLを取得（サイズパラメータを除去）
    let baseUrl = match[1].replace(/=s\d+-c-k-c0x00ffffff-no-rj(-mo)?/, '');
    
    // 異なるサイズのアイコンURLを生成
    return {
      default: {
        url: `${baseUrl}=s88-c-k-c0x00ffffff-no-rj`,
        width: 88,
        height: 88
      },
      medium: {
        url: `${baseUrl}=s240-c-k-c0x00ffffff-no-rj`,
        width: 240,
        height: 240
      },
      high: {
        url: `${baseUrl}=s800-c-k-c0x00ffffff-no-rj`,
        width: 800,
        height: 800
      }
    };
  } catch (error) {
    Logger.error('チャンネルアイコンの取得に失敗しました:', error);
    return null;
  }
} 
