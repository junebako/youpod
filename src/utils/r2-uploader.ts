import { S3Client, PutObjectCommand, ListBucketsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Logger } from './logger';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  skipBucketCheck?: boolean;  // バケットの存在確認をスキップするオプション
  skipExistingFiles?: boolean; // 既存ファイルのアップロードをスキップするオプション
}

export class R2Uploader {
  private client: S3Client;
  private bucketName: string;
  private skipBucketCheck: boolean;
  private skipExistingFiles: boolean;
  private skippedFiles: number = 0;
  private uploadedFiles: number = 0;

  constructor(config: R2Config) {
    this.bucketName = config.bucketName;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.skipBucketCheck = config.skipBucketCheck || false;
    this.skipExistingFiles = config.skipExistingFiles || false;
    this.skippedFiles = 0;
    this.uploadedFiles = 0;
  }

  /**
   * ファイルのMD5ハッシュを計算する
   * @param filePath ファイルパス
   */
  private async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * R2上のファイルが存在するか確認し、存在する場合はMD5ハッシュを取得
   * @param key R2内のキー（ファイル名）
   */
  private async checkFileExists(key: string): Promise<string | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);
      // ETagはダブルクォーテーションで囲まれているので、それを取り除く
      return response.ETag ? response.ETag.replace(/"/g, '') : null;
    } catch (error) {
      // ファイルが存在しない場合はnullを返す
      return null;
    }
  }

  /**
   * ファイルをR2にアップロードする
   * @param filePath アップロードするファイルのパス
   * @param key R2内のキー（ファイル名）
   * @param contentType コンテンツタイプ（省略可）
   */
  async uploadFile(filePath: string, key: string, contentType?: string): Promise<string> {
    try {
      // 既存ファイルのスキップが有効で、ファイルが存在する場合
      if (this.skipExistingFiles) {
        const remoteETag = await this.checkFileExists(key);

        if (remoteETag) {
          // ローカルファイルのMD5ハッシュを計算
          const localMD5 = await this.calculateMD5(filePath);

          // ハッシュが一致する場合（同じ内容のファイル）、アップロードをスキップ
          if (remoteETag === localMD5) {
            // スキップカウントを増やす
            this.skippedFiles++;
            return `https://${this.bucketName}.r2.dev/${key}`;
          }
        }
      }

      const fileContent = await fs.readFile(filePath);

      // コンテンツタイプが指定されていない場合、ファイル拡張子から推測
      if (!contentType) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.xml') contentType = 'application/xml';
        else if (ext === '.mp3') contentType = 'audio/mpeg';
        else if (ext === '.mp4') contentType = 'video/mp4';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else contentType = 'application/octet-stream';
      }

      const command = new PutObjectCommand({
        Bucket: this.bucketName,  // バケット名を設定
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: contentType === 'application/xml' ? 'max-age=300' : 'max-age=86400',
      });

      await this.client.send(command);

      // アップロードカウントを増やす
      this.uploadedFiles++;

      // 新規ファイルのアップロードのみログに表示
      Logger.log(`ファイル "${key}" をアップロードしました`);

      // パブリックURLを返す（r2.devドメインを使用）
      return `https://${this.bucketName}.r2.dev/${key}`;
    } catch (error) {
      Logger.error(`R2へのアップロードに失敗しました: ${error}`);
      throw error;
    }
  }

  /**
   * ディレクトリ内のすべてのファイルをR2にアップロードする
   * @param dirPath アップロードするディレクトリのパス
   * @param prefix R2内のプレフィックス（省略可）
   */
  async uploadDirectory(dirPath: string, prefix: string = ''): Promise<string[]> {
    try {
      // スキップカウントとアップロードカウントをリセット
      this.skippedFiles = 0;
      this.uploadedFiles = 0;

      const files = await fs.readdir(dirPath);
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const key = prefix ? `${prefix}/${file}` : file;

          // uploadFileメソッド内でスキップ処理が行われる
          const url = await this.uploadFile(filePath, key);
          uploadedUrls.push(url);
        }
      }

      // 処理結果のサマリーを表示
      if (this.skippedFiles > 0) {
        Logger.log(`${this.skippedFiles}個のファイルが既に存在し、内容が同じなのでスキップしました`);
      }

      return uploadedUrls;
    } catch (error) {
      Logger.error(`ディレクトリのアップロードに失敗しました: ${error}`);
      throw error;
    }
  }

  /**
   * バケットが存在するか確認する
   */
  async checkBucket(): Promise<boolean> {
    // バケットの存在確認をスキップする場合はtrueを返す
    if (this.skipBucketCheck) {
      return true;
    }

    try {
      const command = new ListBucketsCommand({});
      const response = await this.client.send(command);

      if (response.Buckets) {
        return response.Buckets.some(bucket => bucket.Name === this.bucketName);
      }

      return false;
    } catch (error) {
      Logger.error(`バケットの確認に失敗しました: ${error}`);
      throw error;
    }
  }
} 
