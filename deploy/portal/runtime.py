#!/usr/bin/env python3
"""ECS-only portal migration/release. No database container is recreated or removed."""
import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile


ORIGIN = 'https://game.ccnepower.com'
TIMERS = ('avalon-auto-update.timer', 'mafia-auto-update.timer')
PROTECTED = ('avalon-ecs-postgres-1', 'mafia-deploy-ecs-app-1',
             'mafia-deploy-ecs-postgres-1', 'mafia-deploy-ecs-gateway-1')


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def output(args, **kwargs):
    return run(args, stdout=subprocess.PIPE, text=True, **kwargs).stdout.strip()


def read_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines()
                if line and not line.startswith('#') and '=' in line)


def atomic_text(path, text, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def changed_env(source, values):
    lines = [line for line in source.splitlines() if line.split('=', 1)[0] not in values]
    return '\n'.join(lines + [key + '=' + value for key, value in values.items()]) + '\n'


def point_current(root, release):
    link = root / 'public/current'
    temporary = link.with_name('current.next')
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(release.name)
    os.replace(temporary, link)


@contextlib.contextmanager
def lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


@contextlib.contextmanager
def paused_timers():
    states = {timer: subprocess.run(['systemctl', 'is-active', '--quiet', timer]).returncode == 0 for timer in TIMERS}
    try:
        run(['systemctl', 'stop', *TIMERS])
        yield states
    finally:
        failures = []
        for timer, active in states.items():
            if active:
                try:
                    run(['systemctl', 'start', timer])
                except subprocess.CalledProcessError:
                    failures.append(timer)
        if failures:
            message = 'Timers require manual restoration: ' + ', '.join(failures)
            if sys.exc_info()[0] is None:
                raise RuntimeError(message)
            print(message, file=sys.stderr)


def compose(args, env_file, files):
    # A calling shell's IMAGE_TAG or other exported values must not override a rollback file.
    env = {key: value for key, value in os.environ.items() if key not in read_env(env_file)}
    command = ['docker', 'compose', '--env-file', env_file]
    for file in files:
        command += ['-f', file]
    return run(command + list(args), env=env)


def identities(names):
    data = json.loads(output(['docker', 'inspect', *names]))
    return {item['Name']: {'id': item['Id'], 'started': item['State']['StartedAt'],
            'restarts': item['RestartCount'], 'mounts': [
                {'name': mount.get('Name'), 'destination': mount['Destination'], 'source': mount['Source']}
            for mount in sorted(item['Mounts'], key=lambda value: value['Destination'])]}
            for item in data}


def sql(container, query):
    value = output(['docker', 'exec', container, 'sh', '-c',
                    'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"', 'sh', query])
    if not value.isdigit():
        raise RuntimeError('Cannot verify active game count')
    return int(value)


def require_idle():
    avalon = sql('avalon-ecs-postgres-1', "SELECT count(*) FROM rooms WHERE phase='playing';")
    mafia = sql('mafia-deploy-ecs-postgres-1', "SELECT count(*) FROM mafia_rooms WHERE state->'game'->>'phase' NOT IN ('finished','aborted');")
    if avalon or mafia:
        raise RuntimeError(f'Active games: Avalon={avalon}, Mafia={mafia}; retry after they finish')


def backup_database(container, path):
    with path.open('wb') as stream:
        run(['docker', 'exec', container, 'sh', '-c',
             'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=stream)
    os.chmod(path, 0o600)
    with path.open('rb') as stream:
        run(['docker', 'exec', '-i', container, 'pg_restore', '-l'], stdin=stream, stdout=subprocess.DEVNULL)
    atomic_text(path.with_suffix('.sha256'), hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n')


def get_url(path):
    # This script runs on ECS. Preserve HTTPS/SNI and certificate validation while
    # testing the actual local ingress, independently of upstream ICP filtering.
    return output(['curl', '-fsS', '--noproxy', '*', '--resolve',
                   'game.ccnepower.com:443:127.0.0.1', '--connect-timeout', '5',
                   '--max-time', '15', ORIGIN + path])


def verify_release(release):
    expected_home = (release / 'www/index.html').read_text().strip()
    if get_url('/').strip() != expected_home:
        raise RuntimeError('Local HTTPS game hall does not match the prepared release')
    if '/avalon/assets/' not in get_url('/avalon/'):
        raise RuntimeError('Avalon frontend prefix verification failed')
    for game in json.loads((release / 'games.json').read_text()):
        health = json.loads(get_url(game['healthPath']))
        if not (health.get('status') == 'ok' or health.get('ok') is True):
            raise RuntimeError('Game health failed: ' + game['id'])
    if json.loads(get_url('/api/health')).get('status') != 'ok':
        raise RuntimeError('Legacy Avalon API verification failed')


def portal_up(root, release):
    compose(['config', '--quiet'], root / '.env', [release / 'compose.yaml'])
    compose(['up', '-d', '--wait', '--wait-timeout', '120', 'gateway'], root / '.env', [release / 'compose.yaml'])
    run(['docker', 'exec', 'game-portal-gateway-1', 'caddy', 'reload', '--config',
         '/opt/game-portal/public/current/Caddyfile', '--adapter', 'caddyfile'])


def prepare(repo, root):
    if output(['git', '-C', repo, 'branch', '--show-current']) != 'main':
        raise RuntimeError('ECS portal releases require the main branch')
    if output(['git', '-C', repo, 'status', '--porcelain']):
        raise RuntimeError('Commit all source changes before preparing a release')
    revision = output(['git', '-C', repo, 'rev-parse', 'HEAD'])
    env = read_env(root / '.env')
    release = root / 'public' / (revision[:12] + '-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    release.mkdir(parents=True)
    run(['docker', 'run', '--rm', '--network', 'none', '-v', f'{repo}:/source:ro', '-v',
         f'{release}:/out', '-w', '/source', env['NODE_IMAGE'], 'node', 'deploy/portal/generate.mjs', '/out'])
    run(['docker', 'run', '--rm', '--network', 'none', '-e', 'SITE_ADDRESS=' + ORIGIN,
         '-e', 'PORTAL_WEB_ROOT=/opt/game-portal/public/' + release.name + '/www',
         '-v', f'{root}/public:/opt/game-portal/public:ro', env['CADDY_IMAGE'],
         'caddy', 'validate', '--config', '/opt/game-portal/public/' + release.name + '/Caddyfile', '--adapter', 'caddyfile'])
    manifest = {'revision': revision, 'release': release.name, 'component': 'game-portal'}
    atomic_text(release / 'release.json', json.dumps(manifest, indent=2) + '\n', 0o644)
    return release, revision


def public_env(repo, root, avalon_env):
    data = json.loads(output(['docker', 'inspect', 'avalon-ecs-gateway-1']))[0]
    mounts = {item['Destination']: item.get('Name') for item in data['Mounts']}
    values = {'APP_ORIGIN': ORIGIN, 'PORTAL_ROOT': str(root),
              'CADDY_DATA_VOLUME': mounts.get('/data'), 'CADDY_CONFIG_VOLUME': mounts.get('/config')}
    for destination in ('CADDY_DATA_VOLUME', 'CADDY_CONFIG_VOLUME'):
        if not values[destination] or not re.fullmatch(r'[a-zA-Z0-9_.-]+', values[destination]):
            raise RuntimeError('Cannot identify the existing named certificate/config volumes')
    dockerfile = (repo / 'deploy/Dockerfile').read_text()
    for key in ('NODE_IMAGE', 'CADDY_IMAGE'):
        values[key] = avalon_env.get(key) or re.search(r'^ARG ' + key + r'=(.+)$', dockerfile, re.M).group(1)
    atomic_text(root / '.env', ''.join(key + '=' + value + '\n' for key, value in values.items()))


def migrate(repo, mafia, root, public_ready, local_verify=False):
    if not public_ready and not local_verify:
        raise RuntimeError('Verify HTTPS from outside ECS and use --public-ready, or explicitly use --local-verify while public access is pending')
    if (root / 'state.json').exists():
        raise RuntimeError('Portal is already installed; use release instead')
    env_file = repo / 'deploy/.env.ecs'
    env = read_env(env_file)
    mafia_env = read_env(mafia / 'deploy/.env.ecs')
    if (env.get('PROJECT') != 'avalon-ecs' or env.get('APP_ORIGIN') != ORIGIN or
        mafia_env.get('PROJECT') != 'mafia-deploy-ecs' or mafia_env.get('APP_ORIGIN') != ORIGIN or
        mafia_env.get('APP_BASE_PATH') != '/mafia/'):
        raise RuntimeError('Unexpected origin or Mafia path')
    # Local deployment verification and external public acceptance are separate.
    for path in ('/api/health', '/mafia/api/health'):
        health = json.loads(get_url(path))
        if not (health.get('status') == 'ok' or health.get('ok') is True):
            raise RuntimeError('Existing game health failed: ' + path)
    with contextlib.ExitStack() as stack:
        for path in (repo / 'deploy/runtime/update-ecs.lock', mafia / 'deploy/runtime/update-app.lock', root / 'update.lock'):
            stack.enter_context(lock(path))
        timers = stack.enter_context(paused_timers())
        stage = root / 'backups' / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        stage.mkdir(parents=True, mode=0o700)
        original = env_file.read_text()
        atomic_text(stage / 'avalon.env.before', original)
        shutil.copyfile(mafia / 'deploy/.env.ecs', stage / 'mafia.env.before')
        os.chmod(stage / 'mafia.env.before', 0o600)
        atomic_text(stage / 'timers.json', json.dumps(timers))
        old_files = [repo / 'deploy/compose.yaml', repo / 'deploy/compose.public.example.yaml']
        overlay = repo / 'deploy/runtime/compose.mafia.yaml'
        if overlay.exists():
            old_files.append(overlay)
            shutil.copyfile(overlay, stage / 'compose.mafia.before.yaml')
        shared_caddy = mafia / 'deploy/runtime/Caddyfile.shared'
        if shared_caddy.exists():
            shutil.copyfile(shared_caddy, stage / 'Caddyfile.shared.before')
        cutover = False
        marker = repo / 'deploy/runtime/last-successful-deploy'
        old_marker = marker.read_text() if marker.exists() else None
        try:
            require_idle()
            before = identities(PROTECTED)
            atomic_text(stage / 'protected.before.json', json.dumps(before, indent=2))
            backup_database('avalon-ecs-postgres-1', stage / 'avalon.dump')
            backup_database('mafia-deploy-ecs-postgres-1', stage / 'mafia.dump')
            public_env(repo, root, env)
            release, revision = prepare(repo, root)
            next_env = stage / 'avalon.next.env'
            atomic_text(next_env, changed_env(original, {'APP_BASE_PATH': '/avalon/', 'PUBLIC_INGRESS_MODE': 'portal', 'IMAGE_TAG': revision[:12]}))
            files = [repo / 'deploy/compose.yaml', repo / 'deploy/compose.portal.yaml']
            compose(['config', '--quiet'], next_env, files)
            compose(['build', 'server', 'gateway'], next_env, files)
            require_idle()
            networks = {game['network'] for game in json.loads((release / 'games.json').read_text())}
            for network in networks:
                if subprocess.run(['docker', 'network', 'inspect', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
                    run(['docker', 'network', 'create', network])
            atomic_text(env_file, next_env.read_text())
            cutover = True
            compose(['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'server', 'gateway'], env_file, files)
            point_current(root, release)
            portal_up(root, release)
            verify_release(release)
            after = identities(PROTECTED)
            atomic_text(stage / 'protected.after.json', json.dumps(after, indent=2))
            if before != after:
                raise RuntimeError('A protected database or Mafia container changed; inspect saved evidence')
            state = {'current': release.name, 'previous': None, 'revision': revision, 'migrationBackup': str(stage),
                     'healthVerification': 'ecs-loopback-https',
                     'publicVerification': 'confirmed-before-migration' if public_ready else 'pending'}
            atomic_text(root / 'state.json', json.dumps(state, indent=2) + '\n')
            atomic_text(marker, revision + '\n')
            print('Migration verified. Existing databases and Mafia containers unchanged. Evidence: ' + str(stage))
            if not public_ready:
                print('Local HTTPS verified with the real domain and certificate. Public acceptance remains pending ICP release.')
        except BaseException:
            if cutover:
                print('Migration failed; restoring the previous Avalon images and public entry.')
                try:
                    compose(['stop', 'gateway'], root / '.env', [release / 'compose.yaml'])
                finally:
                    atomic_text(env_file, original)
                    (root / 'state.json').unlink(missing_ok=True)
                    if old_marker is None:
                        marker.unlink(missing_ok=True)
                    else:
                        atomic_text(marker, old_marker)
                    compose(['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'server', 'gateway'], env_file, old_files)
                for path in ('/api/health', '/mafia/api/health'):
                    json.loads(get_url(path))
            raise


def release_portal(repo, root, rollback=False, mafia=Path('/opt/mafia')):
    with contextlib.ExitStack() as stack:
        for path in (repo / 'deploy/runtime/update-ecs.lock', mafia / 'deploy/runtime/update-app.lock', root / 'update.lock'):
            stack.enter_context(lock(path))
        state = json.loads((root / 'state.json').read_text())
        old = root / 'public' / state['current']
        if rollback:
            if not state.get('previous'):
                raise RuntimeError('No previous portal release is recorded')
            release = root / 'public' / state['previous']
            revision = json.loads((release / 'release.json').read_text())['revision']
        else:
            release, revision = prepare(repo, root)
        before = identities(('avalon-ecs-server-1', 'avalon-ecs-gateway-1', *PROTECTED))
        try:
            point_current(root, release)
            portal_up(root, release)
            verify_release(release)
            if identities(('avalon-ecs-server-1', 'avalon-ecs-gateway-1', *PROTECTED)) != before:
                raise RuntimeError('A game container changed during the portal release')
        except BaseException:
            point_current(root, old)
            portal_up(root, old)
            raise
        state.update(current=release.name, previous=old.name, revision=revision)
        atomic_text(root / 'state.json', json.dumps(state, indent=2) + '\n')
        print('Portal verified; game containers unchanged. Release: ' + release.name)


def main():
    os.umask(0o077)
    def interrupted(number, _frame):
        raise InterruptedError('Deployment interrupted by signal ' + str(number))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['migrate', 'release', 'rollback'])
    verification = parser.add_mutually_exclusive_group()
    verification.add_argument('--public-ready', action='store_true', help='External HTTPS access was verified before migration')
    verification.add_argument('--local-verify', action='store_true', help='Deploy and verify strict HTTPS on ECS; record public acceptance as pending')
    parser.add_argument('--avalon-dir', type=Path, default=Path('/opt/avalon'))
    parser.add_argument('--mafia-dir', type=Path, default=Path('/opt/mafia'))
    parser.add_argument('--portal-dir', type=Path, default=Path('/opt/game-portal'))
    args = parser.parse_args()
    if args.action == 'migrate':
        migrate(args.avalon_dir.resolve(), args.mafia_dir.resolve(), args.portal_dir.resolve(), args.public_ready, args.local_verify)
    else:
        release_portal(args.avalon_dir.resolve(), args.portal_dir.resolve(), args.action == 'rollback', args.mafia_dir.resolve())


if __name__ == '__main__':
    main()
