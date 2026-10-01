import { useState, type FormEvent } from 'react';
import { CheckCircle2, PlugZap } from 'lucide-react';
import type { ExternalServer } from '@palcms/shared';
import { api, ApiError, errorText } from '../lib/api';
import { Alert, Button, Field, Input } from './ui';
import { t, tm } from '../lib/i18n';

type TestResult = { ok: true; info: { servername: string; version: string } } | { ok: false; error: string; hint?: string };

/**
 * Connection to an existing Palworld server (REST API). Used by the setup wizard
 * and by the panel's "Server connection" page.
 */
export function ExternalServerForm({
  initial,
  testPath,
  onSave,
  submitLabel,
  passwordOptional = false,
}: {
  initial?: Partial<ExternalServer> | null;
  testPath: string;
  onSave: (value: ExternalServer) => Promise<void>;
  submitLabel: string;
  /** Password already saved: leaving it empty keeps it. */
  passwordOptional?: boolean;
}) {
  const [form, setForm] = useState({
    apiHost: initial?.apiHost ?? '127.0.0.1',
    apiPort: String(initial?.apiPort ?? 8212),
    adminPassword: '',
    publicAddress: initial?.publicAddress ?? '',
    rconPort: initial?.rconPort ? String(initial.rconPort) : '',
  });
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setTest(null);
  };
  const field = (n: string) => (error instanceof ApiError ? error.field(n) : undefined);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(
        await api.post<TestResult>(testPath, {
          apiHost: form.apiHost,
          apiPort: Number(form.apiPort),
          ...(form.adminPassword ? { adminPassword: form.adminPassword } : {}),
        }),
      );
    } catch (e) {
      setTest({ ok: false, error: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        apiHost: form.apiHost.trim(),
        apiPort: Number(form.apiPort),
        adminPassword: form.adminPassword,
        publicAddress: form.publicAddress.trim(),
        rconPort: form.rconPort ? Number(form.rconPort) : null,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_140px]">
        <Field label={t('Server address (REST API)')} help={t('127.0.0.1 if the server runs on this VPS, otherwise its IP or domain name')} error={field('apiHost')}>
          {(id) => <Input id={id} value={form.apiHost} onChange={set('apiHost')} required />}
        </Field>
        <Field label={t('REST API port')} help={t('RESTAPIPort (8212 by default)')} error={field('apiPort')}>
          {(id) => <Input id={id} type="number" value={form.apiPort} onChange={set('apiPort')} required />}
        </Field>
        <Field
          label={t('Server admin password')}
          help={passwordOptional ? t('Leave empty to keep the saved password') : t('Value of AdminPassword in PalWorldSettings.ini')}
          error={field('adminPassword')}
          className="md:col-span-2"
        >
          {(id) => (
            <Input id={id} type="password" value={form.adminPassword} onChange={set('adminPassword')} required={!passwordOptional} autoComplete="off" />
          )}
        </Field>
        <Field label={t('Address for players')} help={t('Shown on the site, e.g. play.myserver.com:8211 (optional)')} error={field('publicAddress')}>
          {(id) => <Input id={id} value={form.publicAddress} onChange={set('publicAddress')} placeholder="IP:8211" />}
        </Field>
        <Field label={t('RCON port')} help={t('Optional, for the panel console')} error={field('rconPort')}>
          {(id) => <Input id={id} type="number" value={form.rconPort} onChange={set('rconPort')} placeholder="25575" />}
        </Field>
      </div>

      <Alert kind="info">
        {t('On the Palworld server, RESTAPIEnabled=True must be set. If it runs on another machine, its REST API port must be reachable from this VPS. The REST API is not encrypted: limit access to this port to this VPS IP in its firewall.')}
      </Alert>

      {test?.ok && (
        <Alert kind="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {t('Connection successful: "{name}" (version {version})', { name: test.info.servername, version: test.info.version })}
          </span>
        </Alert>
      )}
      {test && !test.ok && (
        <Alert kind="error">
          {tm(test.error)}
          {test.hint ? `. ${tm(test.hint)}` : ''}
        </Alert>
      )}
      {error && !field('apiHost') && !field('apiPort') && !field('adminPassword') && <Alert kind="error">{error.message}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={testing} onClick={() => void runTest()} disabled={!form.apiHost || !form.apiPort}>
          <PlugZap className="h-4 w-4" /> {t('Test the connection')}
        </Button>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
      {test && !test.ok && (
        <p className="text-xs text-slate-500">{t('You can save anyway: the connection is retried automatically every 5 seconds.')}</p>
      )}
    </form>
  );
}
