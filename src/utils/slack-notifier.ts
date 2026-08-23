import axios from 'axios';

export interface NotificationStats {
  totalChannels: number;
  totalNewVideos: number;
  totalFailedVideos: number;
  channelStats: Array<{
    label: string;
    newVideos: number;
    videoTitles?: string[]; // 新着動画のタイトル一覧
    failedVideos?: number; // ダウンロードに失敗した動画の件数
    failedReason?: string; // ダウンロード失敗の代表エラー
  }>;
  errors?: string[];
}

/**
 * yt-dlpのエラーをSlack通知向けに短く要約する
 */
export function summarizeDownloadError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lines = rawMessage.split(/\r?\n/);
  const meaningfulLines: string[] = [];
  let inWarning = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (/^WARNING:/i.test(trimmedLine)) {
      inWarning = true;
      continue;
    }

    // WARNINGの複数行メッセージもまとめて除外する
    if (inWarning && /^\s+/.test(line)) {
      continue;
    }

    inWarning = false;
    meaningfulLines.push(trimmedLine);
  }

  const errorLines = meaningfulLines.filter(line => /^ERROR:/.test(line));
  const isCommandFailureLine = (line: string) =>
    line.replace(/^Error:\s*/i, '').trimStart().startsWith('Command failed: yt-dlp');
  let summary = errorLines.length > 0
    ? errorLines[errorLines.length - 1].replace(/^ERROR:\s*/, '').trim()
    : (meaningfulLines.find(line => !isCommandFailureLine(line)) || meaningfulLines[0] || '不明なエラー');

  // yt-dlpの前置きは省略して、HTTPエラーなどの本体を残す
  summary = summary
    .replace(/^Error:\s*/i, '')
    .replace(/^(?:unable to download(?: video data| video)?|failed to download(?: video data| video)?|error downloading video):\s*/i, '')
    .trim();

  return summary.length > 120 ? `${summary.slice(0, 117)}...` : summary;
}

export class SlackNotifier {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendProcessingComplete(stats: NotificationStats): Promise<void> {
    const { totalChannels, totalNewVideos, totalFailedVideos, channelStats, errors } = stats;

    let emoji = '✅';
    let color = 'good';

    if (totalFailedVideos > 0 || (errors && errors.length > 0)) {
      emoji = '⚠️';
      color = 'warning';
    }

    // チャンネル別の詳細を生成
    const channelDetails = channelStats
      .filter(channel => channel.newVideos > 0)
      .map(channel => {
        let detail = `• **${channel.label}**: ${channel.newVideos}件`;
        if (channel.videoTitles && channel.videoTitles.length > 0) {
          const titles = channel.videoTitles.map(title => `  - ${title}`).join('\n');
          detail += `\n${titles}`;
        }
        return detail;
      })
      .join('\n');

    const noNewVideosChannels = channelStats
      .filter(channel => channel.newVideos === 0)
      .map(channel => channel.label);

    let message = `YouPod処理が完了しました ${emoji}`;

    const fields = [
      {
        title: '処理結果',
        value: `${totalChannels}チャンネル中 ${totalNewVideos}件の新着動画`,
        short: true
      },
      {
        title: '実行時刻',
        value: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        short: true
      }
    ];

    if (channelDetails) {
      fields.push({
        title: '新着動画があったチャンネル',
        value: channelDetails,
        short: false
      });
    }

    if (noNewVideosChannels.length > 0) {
      fields.push({
        title: '新着動画がなかったチャンネル',
        value: noNewVideosChannels.join(', '),
        short: false
      });
    }

    const failedVideoDetails = channelStats
      .filter(channel => channel.failedVideos && channel.failedVideos > 0)
      .map(channel => {
        let detail = `• ${channel.label}: ${channel.failedVideos}件`;
        if (channel.failedReason) {
          detail += ` (${channel.failedReason})`;
        }
        return detail;
      })
      .join('\n');

    if (failedVideoDetails) {
      fields.push({
        title: 'ダウンロード失敗',
        value: failedVideoDetails,
        short: false
      });
    }

    if (errors && errors.length > 0) {
      fields.push({
        title: 'エラー',
        value: errors.join('\n'),
        short: false
      });
    }

    const payload = {
      text: message,
      attachments: [{
        color,
        fields
      }]
    };

    try {
      await axios.post(this.webhookUrl, payload);
    } catch (error) {
      console.error('Slack通知の送信に失敗しました:', error);
    }
  }

  async sendError(error: string): Promise<void> {
    const payload = {
      text: 'YouPod処理でエラーが発生しました ❌',
      attachments: [{
        color: 'danger',
        fields: [{
          title: 'エラー詳細',
          value: error,
          short: false
        }, {
          title: '実行時刻',
          value: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
          short: true
        }]
      }]
    };

    try {
      await axios.post(this.webhookUrl, payload);
    } catch (slackError) {
      console.error('Slack通知の送信に失敗しました:', slackError);
    }
  }
}
