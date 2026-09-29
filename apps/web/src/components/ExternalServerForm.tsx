import { useState, type FormEvent } from 'react';
import { CheckCircle2, PlugZap } from 'lucide-react';
import type { ExternalServer } from '@palcms/shared';
import { api, ApiError, errorText } from '../lib/api';
import { Alert, Button, Field, Input } from './ui';

type TestResult = { ok: true; info: { servername: string; version: string } } | { ok: false; error: string };

/**
 * Connexion à un serveur Palworld existant (API REST). Utilisé par l'assistant d'installation
 * et par la page "Connexion au serveur" du panel.
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
  /** Mot de passe déjà enregistré : le laisser vide le conserve. */
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
        <Field label="Adresse du serveur (API REST)" help="127.0.0.1 si le serveur tourne sur ce VPS, sinon son IP ou son nom de domaine" error={field('apiHost')}>
          {(id) => <Input id={id} value={form.apiHost} onChange={set('apiHost')} required />}
        </Field>
        <Field label="Port de l’API REST" help="RESTAPIPort (8212 par défaut)" error={field('apiPort')}>
          {(id) => <Input id={id} type="number" value={form.apiPort} onChange={set('apiPort')} required />}
        </Field>
        <Field
          label="Mot de passe admin du serveur"
          help={passwordOptional ? 'Laisse vide pour garder le mot de passe enregistré' : 'Valeur de AdminPassword dans PalWorldSettings.ini'}
          error={field('adminPassword')}
          className="md:col-span-2"
        >
          {(id) => (
            <Input id={id} type="password" value={form.adminPassword} onChange={set('adminPassword')} required={!passwordOptional} autoComplete="off" />
          )}
        </Field>
        <Field label="Adresse à donner aux joueurs" help="Affichée sur le site, ex. play.monserveur.fr:8211 (facultatif)" error={field('publicAddress')}>
          {(id) => <Input id={id} value={form.publicAddress} onChange={set('publicAddress')} placeholder="IP:8211" />}
        </Field>
        <Field label="Port RCON" help="Facultatif, pour la console du panel" error={field('rconPort')}>
          {(id) => <Input id={id} type="number" value={form.rconPort} onChange={set('rconPort')} placeholder="25575" />}
        </Field>
      </div>

      <Alert kind="info">
        Sur le serveur Palworld, <code>RESTAPIEnabled=True</code> doit être activé. S’il tourne sur une autre machine, son port d’API REST doit être
        joignable depuis ce VPS. L’API REST n’est pas chiffrée : limite l’accès à ce port à l’IP de ce VPS dans son pare-feu.
      </Alert>

      {test?.ok && (
        <Alert kind="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Connexion réussie : « {test.info.servername} » (version {test.info.version})
          </span>
        </Alert>
      )}
      {test && !test.ok && <Alert kind="error">{test.error}</Alert>}
      {error && !field('apiHost') && !field('apiPort') && !field('adminPassword') && <Alert kind="error">{error.message}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={testing} onClick={() => void runTest()} disabled={!form.apiHost || !form.apiPort}>
          <PlugZap className="h-4 w-4" /> Tester la connexion
        </Button>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
      {test && !test.ok && (
        <p className="text-xs text-slate-500">Tu peux enregistrer quand même : la connexion sera retentée automatiquement toutes les 5 secondes.</p>
      )}
    </form>
  );
}
