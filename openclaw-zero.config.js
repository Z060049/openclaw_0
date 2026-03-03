/**
 * OpenClaw Zero Token Configuration
 * 集中管理所有路径和端口配置
 */

import path from 'path';
import os from 'os';

// 基本配置
export const config = {
  // 状态目录
  stateDir: '.openclaw-zero',
  
  // 配置文件名
  configFilename: 'openclaw.json',
  
  // 工作区目录名
  workspaceDir: 'workspace',
  
  // 网关锁目录后缀
  gatewayLockSuffix: 'openclaw-zero',
  
  // 默认网关端口
  defaultGatewayPort: 18790,
  
  // OAuth 目录
  oauthDir: 'credentials',
  
  // OAuth 文件名
  oauthFilename: 'oauth.json',
  
  // 工作区状态目录名
  workspaceStateDirname: '.openclaw-zero',
  
  // 工作区状态文件名
  workspaceStateFilename: 'workspace-state.json',
  
  // 环境变量前缀
  envPrefix: 'OPENCLAW_ZERO_',
  
  // 旧的环境变量前缀
  legacyEnvPrefix: 'OPENCLAW_',
  
  // 遗留的状态目录名
  legacyStateDirs: ['.clawdbot', '.moldbot', '.moltbot'],
  
  // 遗留的配置文件名
  legacyConfigFilenames: ['clawdbot.json', 'moldbot.json', 'moltbot.json']
};

// 解析完整路径
export function resolvePaths(env = process.env, homedir = os.homedir) {
  const home = homedir();
  
  // 状态目录
  const stateDirOverride = env[`${config.envPrefix}STATE_DIR`] || env[`${config.legacyEnvPrefix}STATE_DIR`] || env.CLAWDBOT_STATE_DIR;
  const stateDir = stateDirOverride ? path.resolve(stateDirOverride) : path.join(home, config.stateDir);
  
  // 配置文件路径
  const configPathOverride = env[`${config.envPrefix}CONFIG_PATH`] || env[`${config.legacyEnvPrefix}CONFIG_PATH`] || env.CLAWDBOT_CONFIG_PATH;
  const configPath = configPathOverride ? path.resolve(configPathOverride) : path.join(stateDir, config.configFilename);
  
  // 工作区目录
  const workspaceDir = path.join(stateDir, config.workspaceDir);
  
  // 会话目录
  const sessionDir = path.join(stateDir, 'agents', 'main', 'sessions');
  
  // OAuth 目录
  const oauthDirOverride = env[`${config.envPrefix}OAUTH_DIR`] || env[`${config.legacyEnvPrefix}OAUTH_DIR`];
  const oauthDir = oauthDirOverride ? path.resolve(oauthDirOverride) : path.join(stateDir, config.oauthDir);
  
  // 网关锁目录
  const tmpdir = os.tmpdir();
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const gatewayLockSuffix = uid != null ? `${config.gatewayLockSuffix}-${uid}` : config.gatewayLockSuffix;
  const gatewayLockDir = path.join(tmpdir, gatewayLockSuffix);
  
  // 网关端口
  const gatewayPortOverride = env[`${config.envPrefix}GATEWAY_PORT`] || env[`${config.legacyEnvPrefix}GATEWAY_PORT`] || env.CLAWDBOT_GATEWAY_PORT;
  const gatewayPort = gatewayPortOverride ? parseInt(gatewayPortOverride, 10) : config.defaultGatewayPort;
  
  return {
    stateDir,
    configPath,
    workspaceDir,
    sessionDir,
    oauthDir,
    gatewayLockDir,
    gatewayPort,
    ...config
  };
}
