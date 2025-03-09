import { S3Client, PutObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  skipBucketCheck?: boolean;  // バケットの存在確認をスキップするオプション
}

export class R2Uploader {
  private client: S3Client;
  private bucketName: string;
  private skipBucketCheck: boolean;

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
  }

  /**
   * ファイルをR2にアップロードする
   * @param filePath アップロードするファイルのパス
   * @param key R2内のキー（ファイル名）
   * @param contentType コンテンツタイプ（省略可）
   */
  async uploadFile(filePath: string, key: string, contentType?: string): Promise<string> {
    try {
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
      });

      await this.client.send(command);
      
      // パブリックURLを返す（r2.devドメインを使用）
      return `https://${this.bucketName}.r2.dev/${key}`;
    } catch (error) {
      console.error(`R2へのアップロードに失敗しました: ${error}`);
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
      const files = await fs.readdir(dirPath);
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const key = prefix ? `${prefix}/${file}` : file;
          const url = await this.uploadFile(filePath, key);
          uploadedUrls.push(url);
        }
      }

      return uploadedUrls;
    } catch (error) {
      console.error(`ディレクトリのアップロードに失敗しました: ${error}`);
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
      console.error(`バケットの確認に失敗しました: ${error}`);
      throw error;
    }
  }
} 
