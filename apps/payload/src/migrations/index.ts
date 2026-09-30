import * as migration_20260930_222916_initial from './20260930_222916_initial';

export const migrations = [
  {
    up: migration_20260930_222916_initial.up,
    down: migration_20260930_222916_initial.down,
    name: '20260930_222916_initial'
  },
];
