#!/bin/zsh
cd "/Users/changfubin/Desktop/vibe coding/追踪QQQ动能最强的股票"

echo "正在启动 QQQ 动能扫描器..."

# 读取 Vite 输出，自动提取实际端口并用 Safari 打开
npm run dev 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" == *"Local:"* ]]; then
    url=$(echo "$line" | grep -oE 'http://localhost:[0-9]+')
    if [[ -n "$url" ]]; then
      open -a Safari "$url"
    fi
  fi
done
