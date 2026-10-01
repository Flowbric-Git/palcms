import { useState } from 'react';
import type { PublicUser } from '@palcms/shared';
import { api, errorText } from '../lib/api';
import { useApp } from '../lib/app';
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui';
import { t } from '../lib/i18n';

export function AccountPage() {
  const { boot, setUser } = useApp();
  const user = boot.user!;
  const [displayName, setDisplayName] = useState(user.displayName);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const save = async (body: Record<string, string>) => {
    setMsg(null);
    try {
      const r = await api.patch<{ user: PublicUser }>('auth/me', body);
      setUser(r.user);
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg({ kind: 'success', text: t('Changes saved.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader title={t('My account')} description={t('Logged in as @{name}', { name: user.username })} />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('Profile')}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ displayName });
            }}
          >
            <Field label={t('Display name')}>{(id) => <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}</Field>
            <Button type="submit" variant="secondary">
              {t('Save')}
            </Button>
          </form>
        </Card>
        <Card title={t('Password')}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (pwd.newPassword !== pwd.confirm) return setMsg({ kind: 'error', text: t('The passwords do not match.') });
              void save({ currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
            }}
          >
            <Field label={t('Current password')}>
              {(id) => <Input id={id} type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} autoComplete="current-password" />}
            </Field>
            <Field label={t('New password')} help={t('At least 8 characters')}>
              {(id) => <Input id={id} type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} autoComplete="new-password" />}
            </Field>
            <Field label={t('Confirmation')}>
              {(id) => <Input id={id} type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" />}
            </Field>
            <Button type="submit" variant="secondary" disabled={pwd.newPassword.length < 8}>
              {t('Change the password')}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
