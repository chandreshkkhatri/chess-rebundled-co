'use client';

import { useState, useEffect } from 'react';

export interface AppConfig {
  discordInviteUrl: string | null;
}

// Simple in-memory cache
let cachedConfig: AppConfig | null = null;
let fetchPromise: Promise<AppConfig> | null = null;

async function fetchConfig(): Promise<AppConfig> {
  // Return cached if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Reuse in-flight request
  if (fetchPromise) {
    return fetchPromise;
  }

  // Make request
  fetchPromise = (async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      const response = await fetch(`${apiUrl}/api/config`);
      if (!response.ok) {
        throw new Error('Failed to fetch config');
      }
      const config = await response.json();
      cachedConfig = config;
      return config;
    } catch (error) {
      console.error('[useAppConfig] Failed to fetch config:', error);
      return { discordInviteUrl: 'https://discord.gg/rebundled' };
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(cachedConfig);
  const [isLoading, setIsLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      setIsLoading(false);
      return;
    }

    fetchConfig().then((result) => {
      setConfig(result);
      setIsLoading(false);
    });
  }, []);

  return {
    config,
    isLoading,
    discordInviteUrl: config?.discordInviteUrl || 'https://discord.gg/rebundled',
  };
}
