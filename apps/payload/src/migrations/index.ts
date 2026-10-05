import * as migration_20260930_222916_initial from './20260930_222916_initial';
import * as migration_20261004_073724_messenger from './20261004_073724_messenger';
import * as migration_20261005_024600_twin from './20261005_024600_twin';
import * as migration_20261005_171116_profile_presence from './20261005_171116_profile_presence';
import * as migration_20261005_213806_companies from './20261005_213806_companies';

export const migrations = [
  {
    up: migration_20260930_222916_initial.up,
    down: migration_20260930_222916_initial.down,
    name: '20260930_222916_initial',
  },
  {
    up: migration_20261004_073724_messenger.up,
    down: migration_20261004_073724_messenger.down,
    name: '20261004_073724_messenger',
  },
  {
    up: migration_20261005_024600_twin.up,
    down: migration_20261005_024600_twin.down,
    name: '20261005_024600_twin',
  },
  {
    up: migration_20261005_171116_profile_presence.up,
    down: migration_20261005_171116_profile_presence.down,
    name: '20261005_171116_profile_presence',
  },
  {
    up: migration_20261005_213806_companies.up,
    down: migration_20261005_213806_companies.down,
    name: '20261005_213806_companies'
  },
];
