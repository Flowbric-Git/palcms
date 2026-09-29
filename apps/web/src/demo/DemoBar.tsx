import { useNavigate } from 'react-router-dom';
import type { PublicUser } from '@palcms/shared';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { resetDemo } from './engine';

const REPO = 'https://github.com/Flowbric-Git/palcms';

export default function DemoBar() {
  const { boot, setUser } = useApp();
  const navigate = useNavigate();

  const enterAdmin = async () => {
    if (!boot.user) {
      const { user } = await api.post<{ user: PublicUser }>('auth/login', { login: 'admin', password: 'demo' });
      setUser(user);
    }
    navigate('/admin');
  };

  return (
    <div className="sticky top-0 z-[1000] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-1.5 text-center text-sm text-amber-950">
      <span>
        <strong>Démo de PalCMS</strong> : données fictives, tes modifications restent dans ton navigateur.
      </span>
      <span className="flex gap-3">
        <button className="font-semibold underline underline-offset-2" onClick={() => void enterAdmin()}>
          {boot.user ? 'Panel admin' : 'Entrer dans le panel admin'}
        </button>
        <button className="underline underline-offset-2" onClick={resetDemo}>
          Réinitialiser
        </button>
        <a className="underline underline-offset-2" href={REPO} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </span>
    </div>
  );
}
