import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('portal_runtime', Path(__file__).parents[2] / 'deploy/portal/runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
original_portal_up = runtime.portal_up
original_compose = runtime.compose
original_get_url = runtime.get_url
original_identities = runtime.identities


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo, self.mafia, self.portal = [self.root / name for name in ('avalon', 'mafia', 'portal')]
        for directory in (self.repo, self.mafia):
            (directory / 'deploy/runtime').mkdir(parents=True)
        self.original = 'PROJECT=avalon-ecs\nAPP_ORIGIN=' + runtime.ORIGIN + '\nIMAGE_TAG=previous\nPOSTGRES_PASSWORD=private-test-value\n'
        (self.repo / 'deploy/.env.ecs').write_text(self.original)
        (self.repo / 'deploy/runtime/last-successful-deploy').write_text('old-revision\n')
        (self.repo / 'deploy/runtime/compose.mafia.yaml').write_text('old-overlay')
        (self.mafia / 'deploy/.env.ecs').write_text('PROJECT=mafia-deploy-ecs\nAPP_ORIGIN=' + runtime.ORIGIN + '\nAPP_BASE_PATH=/mafia/\n')
        self.calls, self.composes = [], []
        self.protected = {'database': {'id': 'existing', 'mounts': ['existing-data']}}
        for name, implementation in {
            'run': self.command_run, 'compose': self.compose, 'identities': lambda names: self.protected,
            'require_idle': lambda: None, 'backup_database': lambda container, path: path.write_bytes(b'dump'),
            'public_env': self.public_env, 'prepare': self.prepare, 'get_url': self.get_url,
            'portal_up': lambda root, release: self.calls.append(('portal-up', release.name)),
        }.items():
            patcher = patch.object(runtime, name, side_effect=implementation)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(runtime.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0))
        patcher.start()
        self.addCleanup(patcher.stop)

    def command_run(self, args, **kwargs):
        self.calls.append(tuple(str(value) for value in args))

    def compose(self, args, env_file, files):
        self.composes.append((list(args), Path(env_file).read_text(), [str(file) for file in files]))

    def public_env(self, repo, root, env):
        runtime.atomic_text(root / '.env', 'APP_ORIGIN=' + runtime.ORIGIN + '\nPORTAL_ROOT=' + str(root) + '\n')

    def prepare(self, repo, root):
        release = root / 'public/new-release'
        release.mkdir(parents=True)
        (release / 'games.json').write_text(json.dumps([
            {'id': 'avalon', 'healthPath': '/avalon/api/health', 'network': 'game-avalon-ingress'},
            {'id': 'mafia', 'healthPath': '/mafia/api/health', 'network': 'mafia-ingress'},
        ]))
        (release / 'release.json').write_text(json.dumps({'revision': 'a' * 40}))
        (release / 'compose.yaml').write_text('services: {}')
        (release / 'www').mkdir()
        (release / 'www/index.html').write_text('<html><h1>游戏大厅</h1><p>新封面</p></html>\n')
        return release, 'a' * 40

    def get_url(self, path):
        if path == '/':
            return (self.portal / 'public/current/www/index.html').read_text().strip()
        if path == '/avalon/':
            return '<script src="/avalon/assets/app.js"></script>'
        return json.dumps({'status': 'ok', 'ok': True})

    def migrate(self):
        runtime.migrate(self.repo, self.mafia, self.portal, True)

    def assert_timers_restored(self):
        for timer in runtime.TIMERS:
            self.assertIn(('systemctl', 'start', timer), self.calls)

    def test_requires_external_public_verification(self):
        with self.assertRaisesRegex(RuntimeError, 'outside ECS'):
            runtime.migrate(self.repo, self.mafia, self.portal, False)
        self.assertEqual(self.calls, [])

    def test_local_migration_records_public_acceptance_pending(self):
        runtime.migrate(self.repo, self.mafia, self.portal, False, local_verify=True)
        state = json.loads((self.portal / 'state.json').read_text())
        self.assertEqual(state['publicVerification'], 'pending')
        self.assertEqual(state['healthVerification'], 'ecs-loopback-https')
        self.assert_timers_restored()

    def test_loopback_preserves_https_hostname_and_certificate_validation(self):
        with patch.object(runtime, 'output', return_value='{"status":"ok"}') as request:
            original_get_url('/avalon/api/health')
        command = request.call_args.args[0]
        self.assertIn('--resolve', command)
        self.assertIn('game.ccnepower.com:443:127.0.0.1', command)
        self.assertIn('--noproxy', command)
        self.assertEqual(command[-1], runtime.ORIGIN + '/avalon/api/health')
        self.assertNotIn('-k', command)
        self.assertNotIn('--insecure', command)

    def test_home_verification_rejects_an_old_game_hall(self):
        release, _ = self.prepare(self.repo, self.portal)
        runtime.get_url.side_effect = lambda path: '<html><h1>游戏大厅</h1><p>旧封面</p></html>' if path == '/' else self.get_url(path)
        with self.assertRaisesRegex(RuntimeError, 'does not match the prepared release'):
            runtime.verify_release(release)
        self.assertEqual(runtime.get_url.call_args_list, [unittest.mock.call('/')])

    def test_home_verification_accepts_the_prepared_release(self):
        release, _ = self.prepare(self.repo, self.portal)
        runtime.point_current(self.portal, release)
        runtime.verify_release(release)
        self.assertEqual([call.args[0] for call in runtime.get_url.call_args_list],
                         ['/', '/avalon/', '/avalon/api/health', '/mafia/api/health', '/api/health'])

    def test_unhealthy_existing_game_prevents_mutations(self):
        runtime.get_url.side_effect = lambda path: '{"status":"error"}'
        with self.assertRaisesRegex(RuntimeError, 'Existing game health failed'):
            self.migrate()
        self.assertEqual(self.composes, [])
        self.assertEqual(self.calls, [])

    def test_success_preserves_secrets_volumes_and_other_game_services(self):
        self.migrate()
        env = runtime.read_env(self.repo / 'deploy/.env.ecs')
        self.assertEqual(env['POSTGRES_PASSWORD'], 'private-test-value')
        self.assertEqual(env['APP_BASE_PATH'], '/avalon/')
        self.assertEqual(env['PUBLIC_INGRESS_MODE'], 'portal')
        self.assertEqual((self.repo / 'deploy/runtime/last-successful-deploy').read_text(), 'a' * 40 + '\n')
        for args, _, _ in self.composes:
            if args[0] == 'up':
                self.assertEqual(args[-2:], ['server', 'gateway'])
                self.assertIn('--no-deps', args)
        self.assert_timers_restored()
        self.assertEqual((self.repo / 'deploy/.env.ecs').stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads((self.portal / 'state.json').read_text())['current'], 'new-release')

    def test_active_game_stops_before_any_container_change(self):
        runtime.require_idle.side_effect = RuntimeError('Active games')
        with self.assertRaisesRegex(RuntimeError, 'Active games'):
            self.migrate()
        self.assertEqual((self.repo / 'deploy/.env.ecs').read_text(), self.original)
        self.assertEqual(self.composes, [])
        self.assert_timers_restored()

    def test_early_backup_error_also_restores_timers(self):
        with patch.object(runtime.shutil, 'copyfile', side_effect=OSError('backup disk failure')):
            with self.assertRaisesRegex(OSError, 'disk failure'):
                self.migrate()
        self.assert_timers_restored()

    def test_failure_before_new_portal_starts_restores_old_images_and_overlay(self):
        def fail_new_up(args, env_file, files):
            self.compose(args, env_file, files)
            if args[0] == 'up' and runtime.read_env(Path(env_file)).get('PUBLIC_INGRESS_MODE') == 'portal':
                raise RuntimeError('new application failed')
        runtime.compose.side_effect = fail_new_up
        with self.assertRaisesRegex(RuntimeError, 'new application failed'):
            self.migrate()
        self.assertEqual((self.repo / 'deploy/.env.ecs').read_text(), self.original)
        self.assertEqual((self.repo / 'deploy/runtime/last-successful-deploy').read_text(), 'old-revision\n')
        last = self.composes[-1]
        self.assertIn('compose.mafia.yaml', last[2][-1])
        self.assertEqual(last[1], self.original)
        self.assertFalse((self.portal / 'state.json').exists())
        self.assert_timers_restored()

    def test_public_health_failure_restores_original_entry(self):
        runtime.portal_up.side_effect = RuntimeError('new gateway failed')
        with self.assertRaisesRegex(RuntimeError, 'new gateway failed'):
            self.migrate()
        self.assertEqual((self.repo / 'deploy/.env.ecs').read_text(), self.original)
        self.assertEqual(self.composes[-1][1], self.original)
        self.assert_timers_restored()

    def test_portal_only_release_and_rollback_leave_game_containers_alone(self):
        self.migrate()
        old = self.portal / 'public/old-release'
        old.mkdir()
        (old / 'release.json').write_text(json.dumps({'revision': 'b' * 40}))
        (old / 'games.json').write_text((self.portal / 'public/new-release/games.json').read_text())
        (old / 'www').mkdir()
        (old / 'www/index.html').write_text('<html><h1>游戏大厅</h1><p>旧封面</p></html>\n')
        state = json.loads((self.portal / 'state.json').read_text())
        state['previous'] = old.name
        (self.portal / 'state.json').write_text(json.dumps(state))
        self.composes.clear()
        runtime.portal_up.side_effect = original_portal_up
        runtime.release_portal(self.repo, self.portal, True, self.mafia)
        self.assertEqual(len(self.composes), 2)
        self.assertEqual(self.composes[-1][0][-1], 'gateway')
        self.assertTrue(all('server' not in args and 'postgres' not in args for args, _, _ in self.composes))
        self.assertEqual((self.portal / 'public/current').resolve(), old.resolve())
        self.assertEqual(json.loads((self.portal / 'state.json').read_text())['revision'], 'b' * 40)

    def test_shell_image_tag_cannot_override_the_rollback_file(self):
        with patch.dict(os.environ, {'IMAGE_TAG': 'wrong-shell-tag', 'POSTGRES_PASSWORD': 'wrong-shell-password'}):
            original_compose(['up', 'server'], self.repo / 'deploy/.env.ecs', [self.repo / 'deploy/compose.yaml'])
        self.assertNotIn('IMAGE_TAG', runtime.run.call_args.kwargs['env'])
        self.assertNotIn('POSTGRES_PASSWORD', runtime.run.call_args.kwargs['env'])

    def test_mount_order_is_ignored_but_container_recreation_is_detected(self):
        item = {'Name':'/game', 'Id':'original', 'State':{'StartedAt':'unchanged'}, 'RestartCount':0,
                'Mounts':[{'Name':'certificates','Destination':'/data','Source':'/vol/data'},
                          {'Name':'configuration','Destination':'/config','Source':'/vol/config'}]}
        reordered = dict(item, Mounts=list(reversed(item['Mounts'])))
        recreated = dict(reordered, Id='replacement')
        with patch.object(runtime, 'output', side_effect=[json.dumps([x]) for x in (item,reordered,recreated)]):
            before = original_identities(['game'])
            self.assertEqual(before, original_identities(['game']))
            self.assertNotEqual(before, original_identities(['game']))


if __name__ == '__main__':
    unittest.main()
