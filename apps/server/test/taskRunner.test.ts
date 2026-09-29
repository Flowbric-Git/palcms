import { describe, expect, it } from 'vitest';
import { MemoryTaskStore, TaskRunner, type TaskDef } from '../src/setup/taskRunner';

function makeDefs(calls: string[], failOn: { id: string; times: number } | null = null): TaskDef[] {
  let failures = 0;
  return ['a', 'b', 'c'].map((id) => ({
    id,
    label: id.toUpperCase(),
    async run(ctx) {
      calls.push(id);
      ctx.log(`run ${id}`);
      if (failOn?.id === id && failures < failOn.times) {
        failures++;
        throw new Error(`échec ${id}`);
      }
    },
  }));
}

describe('TaskRunner', () => {
  it('exécute toutes les étapes dans l’ordre', async () => {
    const calls: string[] = [];
    const events: string[] = [];
    const runner = new TaskRunner(new MemoryTaskStore(), makeDefs(calls), (e) => events.push(e.type));
    expect(await runner.runAll()).toBe(true);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(runner.allDone()).toBe(true);
    expect(events).toContain('task-log');
  });

  it('s’arrête à la première erreur puis reprend à l’étape en échec', async () => {
    const calls: string[] = [];
    const store = new MemoryTaskStore();
    const runner = new TaskRunner(store, makeDefs(calls, { id: 'b', times: 1 }));

    expect(await runner.runAll()).toBe(false);
    expect(calls).toEqual(['a', 'b']);
    const failed = runner.state().find((t) => t.id === 'b')!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('échec b');
    expect(runner.state().find((t) => t.id === 'c')!.status).toBe('pending');
    expect(store.getLog('b')).toContain('✖ échec b');

    expect(await runner.runAll()).toBe(true);
    expect(calls).toEqual(['a', 'b', 'b', 'c']);
  });

  it('marque en échec une étape interrompue par un crash', () => {
    const store = new MemoryTaskStore();
    store.save({ id: 'a', status: 'running', error: null, startedAt: 1, finishedAt: null });
    const runner = new TaskRunner(store, makeDefs([]));
    runner.recover();
    expect(runner.state()[0].status).toBe('failed');
  });

  it('refuse deux installations en parallèle', async () => {
    let release!: () => void;
    const slow: TaskDef = { id: 's', label: 'S', run: () => new Promise<void>((r) => (release = r)) };
    const runner = new TaskRunner(new MemoryTaskStore(), [slow]);
    const first = runner.runAll();
    await expect(runner.runAll()).rejects.toThrow();
    release();
    expect(await first).toBe(true);
  });
});
