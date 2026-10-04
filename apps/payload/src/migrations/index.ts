import * as migration_20260930_222916_initial from './20260930_222916_initial';
import * as migration_20261004_072305_messenger from './20261004_072305_messenger';

export const migrations = [
  {
    up: migration_20260930_222916_initial.up,
    down: migration_20260930_222916_initial.down,
    name: '20260930_222916_initial',
  },
  {
    up: migration_20261004_072305_messenger.up,
    down: migration_20261004_072305_messenger.down,
    name: '20261004_072305_messenger'
  },
];
