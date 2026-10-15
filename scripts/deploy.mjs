import { cli, instance, compose } from './deploy/lib.mjs';
cli(async () => {
  const [name = 'local', action = 'status'] = process.argv.slice(2), context = instance(name);
  const actions = {
    build: ['build', '--pull'], up: ['up', '-d', '--wait', '--wait-timeout', '120'],
    stop: ['stop'], status: ['ps'], restart: ['restart', 'server'],
    database: ['up', '-d', '--wait', 'postgres'],
    pause: ['stop', 'gateway', 'server'],
    migrate: ['run', '--rm', '--no-deps', 'server', 'node', 'scripts/migrate.js'],
  };
  if (!(action in actions)) throw new Error('Actions: build | up | stop | status | restart | database | pause | migrate');
  if (action === 'migrate') {
    const running = (await compose(context, ['ps', '--status', 'running', '--services'])).toString().split(/\s+/);
    if (running.includes('server')) throw new Error('Pause this instance before applying an upgrade migration.');
  }
  await compose(context, actions[action], { stdio: 'inherit' });
});
