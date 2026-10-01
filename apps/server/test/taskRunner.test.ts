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
        throw new Error(`failure ${id}`);
      }
    },
  }));
}

describe('TaskRunner', () => {
  it('runs every step in order', async () => {
    const calls: string[] = [];
    const events: string[] = [];
    const runner = new TaskRunner(new MemoryTaskStore(), makeDefs(calls), (e) => events.push(e.type));
    expect(await runner.runAll()).toBe(true);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(runner.allDone()).toBe(true);
    expect(events).toContain('task-log');
  });

  it('stops at the first error, then resumes at the failed step', async () => {
    const calls: string[] = [];
    const store = new MemoryTaskStore();
    const runner = new TaskRunner(store, makeDefs(calls, { id: 'b', times: 1 }));

    expect(await runner.runAll()).toBe(false);
    expect(calls).toEqual(['a', 'b']);
    const failed = runner.state().find((t) => t.id === 'b')!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('failure b');
    expect(runner.state().find((t) => t.id === 'c')!.status).toBe('pending');
    expect(store.getLog('b')).toContain('✖ failure b');

    expect(await runner.runAll()).toBe(true);
    expect(calls).toEqual(['a', 'b', 'b', 'c']);
  });

  it('marks a step interrupted by a crash as failed', () => {
    const store = new MemoryTaskStore();
    store.save({ id: 'a', status: 'running', error: null, startedAt: 1, finishedAt: null });
    const runner = new TaskRunner(store, makeDefs([]));
    runner.recover();
    expect(runner.state()[0].status).toBe('failed');
  });

  it('refuses two installs at the same time', async () => {
    let release!: () => void;
    const slow: TaskDef = { id: 's', label: 'S', run: () => new Promise<void>((r) => (release = r)) };
    const runner = new TaskRunner(new MemoryTaskStore(), [slow]);
    const first = runner.runAll();
    await expect(runner.runAll()).rejects.toThrow();
    release();
    expect(await first).toBe(true);
  });
});
