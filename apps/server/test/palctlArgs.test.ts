import { describe, expect, it } from 'vitest';
import { validatePalctlArgs } from '../src/palworld/palctlArgs';

describe('liste blanche palctl', () => {
  it.each([
    [['install-deps']],
    [['install-palworld']],
    [['write-service', '8211', '32']],
    [['service', 'restart']],
    [['service', 'is-active']],
    [['firewall-open', '8211']],
    [['write-config']],
    [['read-config']],
    [['logs', '300']],
    [['tail-logs']],
    [['backup-create', 'auto']],
    [['backup-list']],
    [['backup-restore', 'palworld-20260929-120000-manual.tar.gz']],
    [['backup-download', 'palworld-20260929-120000-auto.tar.gz']],
  ])('autorise %j', (args) => {
    expect(validatePalctlArgs(args)).toBeNull();
  });

  it.each([
    [[]],
    [['rm', '-rf', '/']],
    [['service', 'restart; rm -rf /']],
    [['service', 'restart', 'extra']],
    [['service', 'mask']],
    [['write-service', '22', '32']],
    [['write-service', '8211', '99']],
    [['write-service', '8211']],
    [['firewall-open', '80']],
    [['firewall-open', '8211/tcp']],
    [['logs', '999999']],
    [['logs', '-f']],
    [['install-deps', '--force']],
    [['backup-create', 'hack']],
    [['backup-restore', '../../etc/shadow']],
    [['backup-delete', 'palworld-20260929-120000-manual.tar.gz; rm -rf /']],
    [['backup-download', '/var/lib/palworld-backups/x.tar.gz']],
  ])('refuse %j', (args) => {
    expect(validatePalctlArgs(args)).not.toBeNull();
  });
});
