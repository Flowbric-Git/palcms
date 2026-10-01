import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api, errorText } from '../lib/api';
import { Button } from './ui';
import { t } from '../lib/i18n';

/** Image upload (logo, banner, cover) with preview. */
export function ImageField({
  value,
  onChange,
  uploadPath = 'admin/site/upload',
  previewClass = 'h-16',
}: {
  value: string;
  onChange: (url: string) => void;
  uploadPath?: string;
  previewClass?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange((await api.upload(uploadPath, file)).url);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {value && (
          <div className="relative">
            <img src={value} alt="" className={`${previewClass} rounded-lg object-contain ring-1 ring-slate-200 dark:ring-slate-700`} />
            <button
              type="button"
              aria-label={t('Remove the image')}
              onClick={() => onChange('')}
              className="absolute -top-2 -right-2 rounded-full bg-slate-800 p-0.5 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <Button type="button" variant="secondary" loading={busy} onClick={() => ref.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          {value ? t('Change the image') : t('Choose an image')}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  );
}
