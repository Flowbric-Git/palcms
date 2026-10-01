/**
 * What the site makes available to extensions in window.PalCMS.
 * The creator kit (sdk/) maps the "react", "react-router-dom" and "@palcms/sdk" imports
 * of a plugin to these objects: the plugin uses the same copy of React as the site.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactRouter from 'react-router-dom';
import { api, basePath, errorText, isExternal, url } from './api';
import { useApp } from './app';
import { useLiveServer } from './live';
import { useLoad } from './useLoad';
import { useRealtime } from './ws';
import { formatBytes, formatDate, formatDateTime, formatDuration, timeAgo } from './format';
import { lang, t } from './i18n';
import { ExtensionBoundary, Slot, useThemeSettings } from './extensions';
import { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Prose, Select, Spinner, Textarea, Toggle, cx } from '../components/ui';
import { CopyAddress, LeaderboardTable, OnlinePlayers, ServerStatusCard, StatusDot } from '../components/live';
import { ImageField } from '../components/ImageField';
import { ThemeToggle } from '../components/ThemeToggle';
import { DefaultFooter, DefaultHeader, MenuLink } from '../public/PublicLayout';
import { DefaultHome, DefaultHomeHero } from '../public/Home';

/** Extension API version: only increased when a change breaks existing extensions. */
export const SDK_VERSION = 1;

export const sdk = {
  version: SDK_VERSION,
  api,
  url,
  basePath,
  errorText,
  isExternal,
  cx,
  useApp,
  useLiveServer,
  useLoad,
  useRealtime,
  useThemeSettings,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  timeAgo,
  // Language of the visitor ("en" or "fr") and the CMS translations (since 1.1.0).
  lang,
  t,
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
  Prose,
  Select,
  Spinner,
  Textarea,
  Toggle,
  ImageField,
  ThemeToggle,
  CopyAddress,
  LeaderboardTable,
  OnlinePlayers,
  ServerStatusCard,
  StatusDot,
  MenuLink,
  DefaultHeader,
  DefaultFooter,
  DefaultHome,
  DefaultHomeHero,
  Slot,
  ExtensionBoundary,
};

declare global {
  interface Window {
    PalCMS?: typeof sdk & { modules: Record<string, unknown> };
  }
}

export function installSdk(): void {
  if (window.PalCMS) return;
  window.PalCMS = {
    ...sdk,
    modules: {
      react: React,
      'react-dom': ReactDOM,
      'react/jsx-runtime': jsxRuntime,
      'react-router-dom': ReactRouter,
      'react-router': ReactRouter,
      '@palcms/sdk': sdk,
    },
  };
}
