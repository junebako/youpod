import axios from 'axios';

export interface NotificationStats {
  totalChannels: number;
  totalNewVideos: number;
  channelStats: Array<{
    label: string;
    newVideos: number;
  }>;
  errors?: string[];
}

export class SlackNotifier {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendProcessingComplete(stats: NotificationStats): Promise<void> {
    const { totalChannels, totalNewVideos, channelStats, errors } = stats;

    let status = 'success';
    let emoji = '✅';
    let color = 'good';

    if (errors && errors.length > 0) {
      status = 'warning';
      emoji = '⚠️';
      color = 'warning';
    }

    // チャンネル別の詳細を生成
    const channelDetails = channelStats
      .filter(channel => channel.newVideos > 0)
      .map(channel => `• ${channel.label}: ${channel.newVideos}件`)
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
