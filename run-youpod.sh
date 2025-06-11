#!/bin/bash

# YouPod自動実行スクリプト
# プロジェクトディレクトリ
PROJECT_DIR="/Users/juneboku/ghq/src/github.com/junebako/youpod"

# ログファイル
LOG_FILE="$PROJECT_DIR/logs/youpod-auto-$(date '+%Y%m%d').log"

# ログディレクトリを作成
mkdir -p "$PROJECT_DIR/logs"

# 実行開始をログに記録
echo "=== YouPod自動実行開始: $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

# PATH環境変数を設定（npm, nodeが見つかるように）
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

# プロジェクトディレクトリに移動
cd "$PROJECT_DIR" || {
    echo "エラー: プロジェクトディレクトリに移動できませんでした: $PROJECT_DIR" >> "$LOG_FILE"
    exit 1
}

# npm run allを実行（Slack通知はyoupod内で行う）
echo "npm run all実行中..." >> "$LOG_FILE"
npm run all >> "$LOG_FILE" 2>&1
exit_code=$?

echo "npm run all 終了コード: $exit_code $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
echo "=== YouPod自動実行終了: $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $exit_code