import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

export interface VideoEntry {
  id: string;
  title: string;
  link: string;
  published: string;
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
      console.warn('フィードにエントリーが見つかりませんでした:', feedUrl);
      return [];
    }
    
    return result.feed.entry.map((entry: any) => ({
      id: entry['yt:videoId'],
      title: entry.title,
      link: entry.link.href,
      published: entry.published,
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
    }));
  } catch (error) {
    console.error('YouTubeフィードの取得に失敗しました:', error);
    throw error;
  }
} 
