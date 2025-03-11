/**
 * タイムスタンプ付きのログ出力ユーティリティ
 */
export class Logger {
  /**
   * 現在の日時を「yyyy-mm-dd HH:MM:SS」形式で取得
   */
  private static getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}]`;
  }

  /**
   * 情報ログを出力
   * @param message ログメッセージ
   * @param args 追加の引数
   */
  public static log(message: string, ...args: any[]): void {
    const timestamp = this.getTimestamp();
    if (args.length > 0) {
      console.log(`${timestamp} ${message}`, ...args);
    } else {
      console.log(`${timestamp} ${message}`);
    }
  }

  /**
   * エラーログを出力
   * @param message エラーメッセージ
   * @param args 追加の引数
   */
  public static error(message: string, ...args: any[]): void {
    const timestamp = this.getTimestamp();
    if (args.length > 0) {
      console.error(`${timestamp} ${message}`, ...args);
    } else {
      console.error(`${timestamp} ${message}`);
    }
  }

  /**
   * 警告ログを出力
   * @param message 警告メッセージ
   * @param args 追加の引数
   */
  public static warn(message: string, ...args: any[]): void {
    const timestamp = this.getTimestamp();
    if (args.length > 0) {
      console.warn(`${timestamp} ${message}`, ...args);
    } else {
      console.warn(`${timestamp} ${message}`);
    }
  }

  /**
   * デバッグログを出力
   * @param message デバッグメッセージ
   * @param args 追加の引数
   */
  public static debug(message: string, ...args: any[]): void {
    const timestamp = this.getTimestamp();
    if (args.length > 0) {
      console.debug(`${timestamp} ${message}`, ...args);
    } else {
      console.debug(`${timestamp} ${message}`);
    }
  }

  /**
   * 空行を追加してからセクションヘッダーを出力
   * @param message セクションヘッダーメッセージ
   */
  public static section(message: string): void {
    console.log('');
    this.log(message);
  }
}
