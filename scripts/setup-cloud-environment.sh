#!/usr/bin/env bash
set -euo pipefail
mkdir -p /workspace/.tools /workspace/.setup/restrova
if [ ! -x /workspace/.tools/node-v22.23.5-linux-x64/bin/node ]; then
  cd /workspace/.setup/restrova
  curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.xz -o node-v22.23.5-linux-x64.tar.xz
  echo 'cdeb8670a0c81f51b4dc4ac61919f9b1ad917b304bf8221eb939570663d240f8  node-v22.23.5-linux-x64.tar.xz' | sha256sum -c -
  tar -xJf node-v22.23.5-linux-x64.tar.xz -C /workspace/.tools
fi
mkdir -p /workspace/.tools/bin
/workspace/.tools/node-v22.23.5-linux-x64/bin/corepack enable --install-directory /workspace/.tools/bin
cat > /workspace/.setup/restrova/activate.sh <<'ACTIVATE'
export PATH=/workspace/.tools/bin:/workspace/.tools/node-v22.23.5-linux-x64/bin:$PATH
export COREPACK_HOME=/workspace/.tools/corepack
export PNPM_HOME=/workspace/.tools/pnpm
export XDG_DATA_HOME=/workspace/.tools/share
export XDG_CACHE_HOME=/workspace/.tools/cache
export NODE_USE_ENV_PROXY=1
export npm_config_cache=/workspace/.tools/cache/npm
ACTIVATE
. /workspace/.setup/restrova/activate.sh
cd /workspace/restrova-platform
pnpm install --frozen-lockfile

