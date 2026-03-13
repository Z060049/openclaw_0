/**
 * Compatibility layer for extensions (e.g. WhatsApp) that expect
 * openclaw/plugin-sdk/compat. Provides runtime store and security helpers.
 */

import type { OpenClawConfig } from "../config/config.js";
import type { ChannelSecurityDmPolicy } from "../channels/plugins/types.js";
import { formatPairingApproveHint } from "../channels/plugins/helpers.js";

export function createPluginRuntimeStore<T>(notSetMessage: string): {
  getRuntime: () => T;
  setRuntime: (runtime: T) => void;
} {
  let value: T | null = null;
  return {
    getRuntime(): T {
      if (value === null) {
        throw new Error(notSetMessage);
      }
      return value;
    },
    setRuntime(runtime: T): void {
      value = runtime;
    },
  };
}

export function buildAccountScopedDmSecurityPolicy(params: {
  cfg: OpenClawConfig;
  channelKey: string;
  accountId: string | undefined;
  fallbackAccountId: string;
  policy: string | undefined;
  allowFrom: Array<string | number>;
  policyPathSuffix: string;
  normalizeEntry?: (raw: string) => string;
}): ChannelSecurityDmPolicy {
  const {
    channelKey,
    accountId,
    fallbackAccountId,
    policy = "pairing",
    allowFrom,
    policyPathSuffix,
    normalizeEntry,
  } = params;
  const isMultiAccount = accountId != null && accountId !== fallbackAccountId;
  const policyPath = isMultiAccount
    ? `channels.${channelKey}.accounts.${accountId}.${policyPathSuffix}`
    : `channels.${channelKey}.${policyPathSuffix}`;
  const allowFromPath = isMultiAccount
    ? `channels.${channelKey}.accounts.${accountId}.allowFrom`
    : `channels.${channelKey}.allowFrom`;
  return {
    policy,
    allowFrom: allowFrom.length ? allowFrom : undefined,
    policyPath,
    allowFromPath,
    approveHint: formatPairingApproveHint(channelKey),
    normalizeEntry,
  };
}

export function collectAllowlistProviderGroupPolicyWarnings(params: {
  cfg: OpenClawConfig;
  providerConfigPresent: boolean;
  configuredGroupPolicy: string | undefined;
  collect: (groupPolicy: string) => string[];
}): string[] {
  if (!params.providerConfigPresent || params.configuredGroupPolicy == null) {
    return [];
  }
  return params.collect(params.configuredGroupPolicy);
}

export function collectOpenGroupPolicyRouteAllowlistWarnings(params: {
  groupPolicy: string;
  routeAllowlistConfigured: boolean;
  restrictSenders: {
    surface: string;
    openScope: string;
    groupPolicyPath: string;
    groupAllowFromPath: string;
  };
  noRouteAllowlist: {
    surface: string;
    routeAllowlistPath: string;
    routeScope: string;
    groupPolicyPath: string;
    groupAllowFromPath: string;
  };
}): string[] {
  const warnings: string[] = [];
  if (params.groupPolicy === "open" && !params.routeAllowlistConfigured) {
    warnings.push(
      `- ${params.noRouteAllowlist.surface}: groupPolicy is "open" but no ${params.noRouteAllowlist.routeScope} allowlist (${params.noRouteAllowlist.routeAllowlistPath}); ${params.restrictSenders.openScope}.`,
    );
  }
  if (params.groupPolicy === "allowlist" && !params.routeAllowlistConfigured) {
    warnings.push(
      `- ${params.noRouteAllowlist.surface}: groupPolicy is "allowlist" but no ${params.noRouteAllowlist.routeScope} allowlist (${params.noRouteAllowlist.routeAllowlistPath}); set ${params.noRouteAllowlist.groupAllowFromPath} or configure groups.`,
    );
  }
  return warnings;
}
