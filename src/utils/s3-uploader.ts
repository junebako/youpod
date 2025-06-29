import { S3Client, PutObjectCommand, ListBucketsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Logger } from './logger';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  cloudFrontDistributionId?: string; // CloudFrontディストリビューションID（オプション）
  skipBucketCheck?: boolean;  // バケットの存在確認をスキップするオプション
  skipExistingFiles?: boolean; // 既存ファイルのアップロードをスキップするオプション
}

export class S3Uploader {
  private client: S3Client;
  private cloudFrontClient: CloudFrontClient | null;
  private bucketName: string;
  private cloudFrontDistributionId: string | null;
  private skipBucketCheck: boolean;
  private skipExistingFiles: boolean;
  private skippedFiles: number = 0;
  private uploadedFiles: number = 0;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    this.cloudFrontDistributionId = config.cloudFrontDistributionId || null;

    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    // CloudFrontディストリビューションIDが設定されている場合のみCloudFrontクライアントを初期化
    if (this.cloudFrontDistributionId) {
      this.cloudFrontClient = new CloudFrontClient({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    } else {
      this.cloudFrontClient = null;
    }

    this.skipBucketCheck = config.skipBucketCheck || false;
    this.skipExistingFiles = config.skipExistingFiles || false;
    this.skippedFiles = 0;
    this.uploadedFiles = 0;
  }

  /**
   * CloudFrontのキャッシュを無効化する
   * @param paths 無効化するパスの配列
   */
  private async invalidateCloudFrontCache(paths: string[]): Promise<void> {
    if (!this.cloudFrontClient || !this.cloudFrontDistributionId) {
      return;
    }

    try {
      const command = new CreateInvalidationCommand({
        DistributionId: this.cloudFrontDistributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: paths.length,
            Items: paths,
          },
          CallerReference: `youpod-${Date.now()}`,
        },
      });

      const result = await this.cloudFrontClient.send(command);
      Logger.log(`CloudFrontキャッシュ無効化を開始しました (ID: ${result.Invalidation?.Id})`);
      Logger.log(`無効化パス: ${paths.join(', ')}`);
    } catch (error) {
      Logger.error(`CloudFrontキャッシュ無効化に失敗しました: ${error}`);
    }
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
   * S3上のファイルが存在するか確認し、存在する場合はMD5ハッシュを取得
   * @param key S3内のキー（ファイル名）
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
   * ファイルをS3にアップロードする
   * @param filePath アップロードするファイルのパス
   * @param key S3内のキー（ファイル名）
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
            return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
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

      // パブリックURLを返す
      return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
    } catch (error) {
      Logger.error(`S3へのアップロードに失敗しました: ${error}`);
      throw error;
    }
  }

  /**
   * ディレクトリ内のすべてのファイルをS3にアップロードする
   * @param dirPath アップロードするディレクトリのパス
   * @param prefix S3内のプレフィックス（省略可）
   */
  async uploadDirectory(dirPath: string, prefix: string = ''): Promise<string[]> {
    try {
      // スキップカウントとアップロードカウントをリセット
      this.skippedFiles = 0;
      this.uploadedFiles = 0;

      const files = await fs.readdir(dirPath);
      const uploadedUrls: string[] = [];
      const invalidationPaths: string[] = [];

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const key = prefix ? `${prefix}/${file}` : file;

          // uploadFileメソッド内でスキップ処理が行われる
          const url = await this.uploadFile(filePath, key);
          uploadedUrls.push(url);

          // XMLファイル（フィード）の場合、キャッシュ無効化対象に追加
          if (path.extname(file).toLowerCase() === '.xml') {
            invalidationPaths.push(`/${key}`);
          }
        }
      }

      // フィードファイルがアップロードされた場合、CloudFrontキャッシュを無効化
      if (invalidationPaths.length > 0) {
        await this.invalidateCloudFrontCache(invalidationPaths);
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
