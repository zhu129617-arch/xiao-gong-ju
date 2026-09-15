#!/bin/bash
# 工作台 · 双击启动脚本
# 关掉这个窗口（或按 Ctrl+C）即停止工作台，数据不会丢。

cd "$(dirname "$0")" || exit 1

find_node() {
  local c
  c="$(command -v node 2>/dev/null)"
  if [ -n "$c" ] && [ -x "$c" ]; then echo "$c"; return 0; fi
  for c in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    if [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  for c in "$HOME"/.workbuddy/binaries/node/versions/*/bin/node; do
    if [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}

NODE_BIN="$(find_node)"

if [ -z "$NODE_BIN" ]; then
  echo ""
  echo "  没有找到 Node.js，工作台启动不了。"
  echo ""
  echo "  解决办法：到 https://nodejs.org 下载安装 Node.js（选 LTS 版本），"
  echo "  装好之后再双击一次这个脚本。"
  echo ""
  read -n 1 -s -r -p "  按任意键关闭这个窗口…"
  echo ""
  exit 1
fi

echo "  正在启动工作台..."
echo "  用的 Node: $NODE_BIN"
# "$@" 会把参数透传下去：加 --no-open 可以只启动服务、不自动开浏览器
exec "$NODE_BIN" server/server.js "$@"
