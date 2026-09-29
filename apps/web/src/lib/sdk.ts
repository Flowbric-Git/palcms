/**
 * Ce que le site met à disposition des extensions dans window.PalCMS.
 * Le kit de création (sdk/) redirige les imports "react", "react-router-dom" et "@palcms/sdk"
 * d'un plugin vers ces objets : le plugin utilise la même copie de React que le site.
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
import { ExtensionBoundary, Slot, useThemeSettings } from './extensions';
import { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Prose, Select, Spinner, Textarea, Toggle, cx } from '../components/ui';
import { CopyAddress, LeaderboardTable, OnlinePlayers, ServerStatusCard, StatusDot } from '../components/live';
import { ImageField } from '../components/ImageField';
import { ThemeToggle } from '../components/ThemeToggle';
import { DefaultFooter, DefaultHeader, MenuLink } from '../public/PublicLayout';
import { DefaultHome, DefaultHomeHero } from '../public/Home';

/** Version de l'API des extensions : augmentée seulement si un changement casse les extensions existantes. */
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
