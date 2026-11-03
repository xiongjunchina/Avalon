#!/usr/bin/env bash
# Standalone entry point: can be copied to /root before the repository is updated.
set -euo pipefail
umask 077
exec python3 - "$@" <<'PY'
import argparse
import datetime
import fcntl
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import warnings

parser = argparse.ArgumentParser(description='Avalon 内容安全受控发布；只重建 Avalon server/gateway，不自动 git pull。')
parser.add_argument('phase', choices=['prepare', 'cutover', 'verify'])
parser.add_argument('--root', default=os.environ.get('AVALON_DIR', '/opt/avalon'))
parser.add_argument('--config-file', help='prepare 使用的私有 JSON 文件，仅含 ALIYUN_CONTENT_* 配置；不打印内容')
parser.add_argument('--revision', help='cutover 必填，已审核的完整 40 位 Git 提交号，必须等于 HEAD')
parser.add_argument('--test-player-code', help='cutover 必填，本人专用微信验收账号的六位仙友码')
parser.add_argument('--mafia-project', help='存在多个 Mafia 项目时，指定现有 Compose 项目名')
args = parser.parse_args()
os.umask(0o077)

class ReleaseError(Exception):
    pass

def require(condition, message):
    if not condition:
        raise ReleaseError(message)

root = Path(args.root).resolve()
runtime = root / 'deploy/runtime'
env_path = root / 'deploy/.env.ecs'
state_dir = None
state = None
mutation_started = False
state_owned = False

def save(path, value, binary=False):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb' if binary else 'w') as handle:
            handle.write(value)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def save_state():
    save(state_dir / 'state.json', json.dumps(state, ensure_ascii=False, indent=2) + '\n')

def run(command, *, label=None, allow_failure=False, output=None, timeout=180, stdin_data=None):
    # Do not print raw tool output: Docker/configuration errors can include private values.
    try:
        if output is None:
            result = subprocess.run(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, input=stdin_data)
        else:
            with Path(output).open('wb') as archive:
                result = subprocess.run(command, cwd=root, stdout=archive, stderr=subprocess.PIPE, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise ReleaseError((label or command[0]) + ' 未完成；请检查工具、网络或私有日志。') from None
    if state_dir:
        with (state_dir / 'operations.log').open('ab') as log:
            log.write(('\n[' + (label or command[0]) + '] exit=' + str(result.returncode) + '\n').encode())
            # Commands themselves are deliberately omitted, including player codes.
            log.write(result.stdout if output is None else b'[binary output saved separately]\n')
            log.write(result.stderr)
    if result.returncode and not allow_failure:
        raise ReleaseError((label or command[0]) + ' 失败；详细输出仅保存在私有发布目录。')
    return result.returncode, result.stdout.decode('utf-8', errors='replace').strip() if output is None else ''

def dotenv(path):
    # Parse data, never execute dotenv as shell code. All unrelated lines are preserved.
    values = {}
    for line in Path(path).read_text().splitlines():
        match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$', line)
        if not match:
            continue
        key, value = match.groups()
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("\\'", "'")
        elif value.startswith('"') and value.endswith('"'):
            try:
                value = json.loads(value)
            except ValueError:
                raise ReleaseError('私有配置存在不能安全解析的引号；请使用简单单行 dotenv 值。') from None
        else:
            value = re.split(r'\s+#', value, maxsplit=1)[0]
        values[key] = value
    return values

def env_update(source, destination, values):
    for value in values.values():
        require(isinstance(value, str) and not any(c in value for c in '\r\n\x00'), '配置必须是单行字符串。')
    lines = []
    for line in Path(source).read_text().splitlines():
        match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
        if not match or match.group(1) not in values:
            lines.append(line)
    # Compose dotenv single quotes prevent interpolation of dollar signs in credentials.
    for key, value in values.items():
        lines.append(key + "='" + value.replace("'", "\\'") + "'")
    save(destination, '\n'.join(lines) + '\n')

def containers():
    ids = run(['docker', 'ps', '-aq'], label='读取容器列表')[1].split()
    require(bool(ids), '未发现现有容器，停止操作。')
    template = '{{.Id}}\t{{.Name}}\t{{.Image}}\t{{.State.StartedAt}}\t{{.RestartCount}}\t{{index .Config.Labels "com.docker.compose.project"}}\t{{index .Config.Labels "com.docker.compose.service"}}'
    rows = run(['docker', 'inspect', '--format', template, *ids], label='读取非秘密容器基线')[1]
    records = []
    for line in rows.splitlines():
        fields = line.split('\t')
        require(len(fields) == 7, '容器基线格式不完整。')
        records.append(dict(zip(['id', 'name', 'image', 'started', 'restarts', 'project', 'service'], fields)))
    return records

def service(records, project, name):
    found = [r for r in records if r['project'] == project and r['service'] == name]
    require(len(found) == 1, '必须能唯一定位 ' + project + '/' + name + ' 容器。')
    return found[0]

def head():
    revision = run(['git', 'rev-parse', 'HEAD'], label='读取 Git HEAD')[1]
    require(re.fullmatch(r'[0-9a-f]{40}', revision), 'Git HEAD 不是完整提交号。')
    return revision

def require_portal(values):
    require(values.get('PUBLIC_INGRESS_MODE') == 'portal' and values.get('APP_BASE_PATH') == '/avalon/',
            '仅支持现有独立公共入口模式，必须 PUBLIC_INGRESS_MODE=portal、APP_BASE_PATH=/avalon/。')
    require(values.get('APP_ORIGIN') == 'https://game.ccnepower.com', 'APP_ORIGIN 与本次授权域名不一致。')
    require(bool(re.fullmatch(r'[a-z0-9][a-z0-9_-]*', values.get('PROJECT', ''))), '缺少有效的现有 Compose 项目名。')

def dc(environment, commands, rollback=False):
    directory = state_dir if rollback else root / 'deploy'
    command = ['docker', 'compose', '--project-directory', str(root / 'deploy'), '--project-name', state['project'],
               '--env-file', str(environment), '-f', str(directory / 'compose.yaml'), '-f', str(directory / 'compose.portal.yaml')]
    if rollback:
        command += ['-f', str(state_dir / 'rollback.json')]
    return run(command + commands, label=('回滚 Avalon' if rollback else 'Avalon Compose ' + commands[0]), timeout=3600)

def timer_state(name):
    active = run(['systemctl', 'is-active', name], label='读取定时器状态', allow_failure=True)[1] == 'active'
    enabled = run(['systemctl', 'is-enabled', name], label='读取定时器启用状态', allow_failure=True)[1]
    return {'active': active, 'enabled': enabled}

def restore_timers(success):
    errors = []
    for timer, original in state['timers'].items():
        if original['enabled'] == 'not-found':
            continue
        should_run = original['active'] and (success or timer == 'mafia-auto-update.timer')
        try:
            run(['systemctl', 'start' if should_run else 'stop', timer], label='恢复定时器运行状态')
        except ReleaseError:
            errors.append(timer)
    require(not errors, '恢复定时器状态失败：' + ', '.join(errors))

def idle():
    sql = "SELECT count(*) FROM rooms WHERE phase NOT IN ('waiting','finished','closed');"
    result = run(['docker', 'exec', state['postgres'], 'sh', '-c',
                  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"', 'sh', sql],
                 label='检查 Avalon 进行中对局')[1]
    require(result == '0', 'Avalon 有进行中对局或无法核实，延后切换；不会中断该对局。')

def protected_unchanged():
    current = {r['id']: r for r in containers()}
    for original in state['containers']:
        if original['project'] == state['project'] and original['service'] in ['server', 'gateway']:
            continue
        require(current.get(original['id']) == original,
                '其他服务或数据库容器基线发生变化，停止发布并保留记录：' + original['name'])

def health(local, safety=True):
    name = 'health-local.json' if local else 'health-public.json'
    command = ['curl', '--fail', '--silent', '--show-error', '--noproxy', '*', '--connect-timeout', '5', '--max-time', '20']
    if local:
        command += ['--resolve', 'game.ccnepower.com:443:127.0.0.1']
    command += ['https://game.ccnepower.com/avalon/api/health']
    body = run(command, label='本机 HTTPS 健康检查' if local else '普通公网 HTTPS 健康检查')[1]
    try:
        value = json.loads(body)
    except ValueError:
        raise ReleaseError('健康检查没有返回有效 JSON。') from None
    require(value.get('status') == 'ok' and (not safety or value.get('contentSafetyEnabled') is True), '健康检查未确认内容安全已启用。')
    save(state_dir / name, json.dumps(value, ensure_ascii=False) + '\n')

def verify():
    health(True)
    health(False)
    routes = ['/', '/avalon/', '/mafia/']
    if any('xiongqc' in r['project'] for r in state['containers']):
        routes.append('/xiongqc/')
    for route in routes:
        result = run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-redirs', '3', '--noproxy', '*',
                      '--connect-timeout', '5', '--max-time', '20', '--output', '/dev/null', '--write-out', '%{http_code}',
                      'https://game.ccnepower.com' + route], label='验证公网入口 ' + route)[1]
        require(result == '200', '公网入口未返回 200：' + route)
    protected_unchanged()
    save(state_dir / 'verification.json', json.dumps({'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'routes': routes, 'httpsCertificateVerified': True, 'contentSafetyEnabled': True,
        'otherContainerBaselinesUnchanged': True, 'realDeviceAndVoice': 'NOT_TESTED'}) + '\n')
    print('HTTPS、内容安全健康及其他容器基线验证通过；手机游戏/真实语音仍需人工验收。')

def prepare():
    global state, state_dir, state_owned
    require(env_path.is_file(), '找不到 deploy/.env.ecs。')
    values = dotenv(env_path)
    require_portal(values)
    records = containers()
    project = values['PROJECT']
    server = service(records, project, 'server')
    gateway = service(records, project, 'gateway')
    postgres = service(records, project, 'postgres')
    mafia = [r for r in records if r['service'] == 'postgres' and
             (r['project'] == args.mafia_project if args.mafia_project else re.fullmatch(r'mafia(?:-ecs)?', r['project']))]
    require(len(mafia) == 1, '无法唯一定位 Mafia 数据库，请核实后填写 --mafia-project；不会猜测或跳过备份。')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    state_dir = runtime / ('content-safety-' + stamp)
    state_dir.mkdir(mode=0o700)
    state = {'version': 1, 'phase': 'preparing', 'project': project, 'preparedRevision': head(),
             'containers': records, 'postgres': postgres['id'], 'mafiaPostgres': mafia[0]['id'],
             'rollbackImages': {}, 'timers': {}, 'switchStarted': False}
    state_owned = True
    save(runtime / 'content-safety-current', str(state_dir) + '\n')
    save_state()
    for timer in ['avalon-auto-update.timer', 'mafia-auto-update.timer']:
        state['timers'][timer] = timer_state(timer)
        save_state()
        if state['timers'][timer]['enabled'] != 'not-found':
            run(['systemctl', 'stop', timer], label='暂停自动更新定时器')
    for job in ['avalon-auto-update.service', 'mafia-auto-update.service']:
        require(run(['systemctl', 'is-active', job], label='检查更新任务', allow_failure=True)[1] != 'active',
                '存在正在运行的自动更新任务，请等它结束后再准备。')
    idle()
    for source, destination in [(env_path, '.env.backup'), (root / 'deploy/compose.yaml', 'compose.yaml'),
                                (root / 'deploy/compose.portal.yaml', 'compose.portal.yaml')]:
        save(state_dir / destination, source.read_bytes(), binary=True)
    allowed = {'ALIYUN_CONTENT_ACCESS_KEY_ID', 'ALIYUN_CONTENT_ACCESS_KEY_SECRET', 'ALIYUN_CONTENT_SECURITY_TOKEN',
               'ALIYUN_CONTENT_REGION', 'ALIYUN_CONTENT_ENDPOINT', 'ALIYUN_CONTENT_NICKNAME_SERVICE',
               'ALIYUN_CONTENT_CHAT_SERVICE', 'ALIYUN_CONTENT_IMAGE_SERVICE'}
    if args.config_file:
        private_file = Path(args.config_file)
        require(private_file.is_file() and private_file.stat().st_mode & 0o077 == 0,
                '--config-file 必须是只有当前用户可访问的私有 JSON 文件（chmod 600）。')
        try:
            credentials = json.loads(private_file.read_text())
        except ValueError:
            raise ReleaseError('私有 JSON 配置格式错误；未输出内容。') from None
        require(isinstance(credentials, dict) and set(credentials).issubset(allowed), '私有 JSON 只允许 ALIYUN_CONTENT_* 指定字段。')
    else:
        try:
            with open('/dev/tty', 'r+'):
                pass
        except OSError:
            raise ReleaseError('无交互终端，请提供 --config-file 私有 JSON。') from None
        warnings.simplefilter('error', getpass.GetPassWarning)
        credentials = {key: values[key] for key in allowed if values.get(key)}
        for key, prompt in [('ALIYUN_CONTENT_ACCESS_KEY_ID', '专用 RAM AccessKey ID（隐藏输入）：'),
                            ('ALIYUN_CONTENT_ACCESS_KEY_SECRET', '专用 RAM AccessKey Secret（隐藏输入）：')]:
            if not credentials.get(key):
                credentials[key] = getpass.getpass(prompt)
    require(all(isinstance(v, str) and v and re.fullmatch(r'[\x21-\x7e]+', v) for v in credentials.values()),
            '阿里云私有配置必须是非空 ASCII 单行字符串。可选空字段请省略。')
    require(credentials.get('ALIYUN_CONTENT_ACCESS_KEY_ID') and credentials.get('ALIYUN_CONTENT_ACCESS_KEY_SECRET'), '缺少专用 RAM AccessKey。')
    require(values.get('WECHAT_MINIGAME_APP_ID') == 'wxdb4e422c14adab3f' and values.get('WECHAT_MINIGAME_APP_SECRET'),
            '原私有配置缺少正确 AppID/AppSecret；本脚本不会猜测或覆盖微信凭据。')
    changes = {'ALIYUN_CONTENT_REGION': 'cn-shanghai', 'ALIYUN_CONTENT_NICKNAME_SERVICE': 'nickname_detection_pro',
               'ALIYUN_CONTENT_CHAT_SERVICE': 'comment_detection_pro', 'ALIYUN_CONTENT_IMAGE_SERVICE': 'profilePhotoCheck',
               **credentials, 'CONTENT_SAFETY_ENABLED': 'true', 'CONTENT_SAFETY_MAINTENANCE': 'true'}
    env_update(env_path, state_dir / '.env.next', changes)
    state['phase'] = 'prepared'
    save_state()
    print('准备完成，两个自动更新定时器已暂停，原始状态已保存。尚未切换容器或验证付费接口。')
    print('私有记录目录：' + str(state_dir))
    print('更新仓库后运行 cutover --revision <完整提交号> --test-player-code <本人微信验收仙友码>。')

def load_state():
    global state, state_dir
    pointer = runtime / 'content-safety-current'
    require(pointer.is_file(), '请先运行 prepare。')
    state_dir = Path(pointer.read_text().strip()).resolve()
    require(state_dir.parent == runtime and state_dir.name.startswith('content-safety-'), '发布记录目录无效。')
    state = json.loads((state_dir / 'state.json').read_text())
    require(state.get('version') == 1, '发布记录版本不匹配。')

def cutover():
    global mutation_started, state_owned
    require(state['phase'] == 'prepared', '本轮尚未准备或已执行；请检查私有发布记录，勿重复切换。')
    require(re.fullmatch(r'[0-9a-f]{40}', args.revision or '') is not None, 'cutover 必须提供 --revision 完整40位提交号。')
    require(re.fullmatch(r'\d{6}', args.test_player_code or '') is not None, 'cutover 必须提供本人专用微信验收账号的六位 --test-player-code。')
    require(head() == args.revision, 'HEAD 与指定发布提交号不一致；脚本不会自动拉取或改变 Git。')
    require(run(['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'], label='检查发布分支')[1] == 'main',
            '发布必须在 main 分支执行；请先完成修复合并和显式快进，脚本不会切换分支。')
    require(run(['git', 'rev-parse', 'refs/remotes/origin/main'], label='检查 main 追踪提交')[1] == args.revision,
            '本地 origin/main 与指定提交号不一致，请先核实合并结果并显式 fetch，不能提前恢复定时器。')
    require(not run(['git', 'status', '--porcelain'], label='检查工作树')[1], '仓库有未提交修改，停止发布。')
    require(env_path.read_bytes() == (state_dir / '.env.backup').read_bytes(), 'prepare 后私有配置已改变，请重新核实，禁止覆盖。')
    require_portal(dotenv(state_dir / '.env.next'))
    state_owned = True
    for timer in state['timers']:
        if state['timers'][timer]['enabled'] != 'not-found':
            run(['systemctl', 'stop', timer], label='确认定时器保持暂停')
    for job in ['avalon-auto-update.service', 'mafia-auto-update.service']:
        require(run(['systemctl', 'is-active', job], label='检查更新任务', allow_failure=True)[1] != 'active', '自动更新任务尚在运行。')
    protected_unchanged()
    current = containers()
    for name in ['server', 'gateway']:
        original = service(state['containers'], state['project'], name)
        require(service(current, state['project'], name) == original, 'Avalon 在 prepare 后已被其他发布改变，请重新准备。')
        tag = 'avalon-content-safety-rollback:' + name + '-' + state_dir.name[len('content-safety-'):].lower()
        run(['docker', 'image', 'tag', original['image'], tag], label='保留旧 Avalon 镜像')
        state['rollbackImages'][name] = tag
    save(state_dir / 'rollback.json', json.dumps({'services': {name: {'image': tag} for name, tag in state['rollbackImages'].items()}}))
    state['targetRevision'] = args.revision
    save_state()
    restore_sql = root / 'scripts/deploy/restore-content-safety-avatars.sql'
    require(restore_sql.is_file(), '缺少头像兼容回滚 SQL，停止切换。')
    save(state_dir / 'restore-content-safety-avatars.sql', restore_sql.read_bytes(), binary=True)
    next_env = state_dir / '.env.next'
    env_update(next_env, next_env, {'IMAGE_TAG': args.revision[:12]})
    dc(next_env, ['config', '--quiet'])
    idle()
    print('开始构建已锁定版本，构建期间现有游戏继续运行：' + args.revision)
    dc(next_env, ['build', 'server', 'gateway'])
    require(head() == args.revision, '构建期间 HEAD 改变，未切换容器。')
    idle()
    protected_unchanged()
    state['phase'] = 'switching'
    state['switchStarted'] = True
    save_state()
    mutation_started = True
    dc(next_env, ['stop', 'server', 'gateway'])
    # Close the last-second start-game race after ingress stops, before deployment/data work.
    idle()
    for container, name in [(state['postgres'], 'avalon'), (state['mafiaPostgres'], 'mafia')]:
        destination = state_dir / (name + '.dump')
        run(['docker', 'exec', container, 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],
            label='备份 ' + name + ' 数据库', output=destination, timeout=600)
        with destination.open('rb') as archive:
            require(destination.stat().st_size > 5 and archive.read(5) == b'PGDMP', '数据库备份未产生有效自定义格式归档。')
    dc(next_env, ['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'server', 'gateway'])
    health(True)
    new_server = service(containers(), state['project'], 'server')['id']
    audit_command = ['docker', 'exec', new_server, 'node', 'apps/server/src/content-safety-audit.js']
    print('维护模式下验证微信及阿里云实际接口；仅使用本人验收账号和正常样本。')
    run(audit_command + ['probe', args.test_player_code], label='供应商真实能力预检', timeout=120)
    run(audit_command + ['inventory'], label='记录历史内容数量')
    print('开始检查历史内容；原资料保留，待审与拒绝内容不会公开。')
    run(audit_command + ['audit'], label='历史内容审核', timeout=3600)
    env_update(next_env, env_path, {'CONTENT_SAFETY_MAINTENANCE': 'false'})
    dc(env_path, ['up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '180', 'server', 'gateway'])
    verify()
    restore_timers(True)
    save(runtime / 'last-successful-deploy', args.revision + '\n')
    state['phase'] = 'complete'
    save_state()
    mutation_started = False
    print('Avalon 发布完成：' + args.revision + '；已恢复原先运行的两个定时器。')

def rollback():
    # Freeze new writes before converting approved managed avatar URLs for the old server.
    dc(state_dir / '.env.next', ['stop', 'server', 'gateway'])
    run(['docker', 'exec', '-i', state['postgres'], 'sh', '-c',
         'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v public_base="$1"',
         'sh', 'https://game.ccnepower.com/avalon'], label='恢复旧版本可读的已审核头像',
        stdin_data=(state_dir / 'restore-content-safety-avatars.sql').read_bytes())
    save(env_path, (state_dir / '.env.backup').read_bytes(), binary=True)
    dc(env_path, ['up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '180', 'server', 'gateway'], rollback=True)
    health(True, safety=False)
    protected_unchanged()

def interrupted(_number, _frame):
    raise ReleaseError('发布被中断。')

try:
    require(root.is_dir(), '仓库目录不存在。')
    for tool in ['git', 'docker', 'systemctl', 'curl']:
        require(shutil.which(tool), '缺少命令：' + tool)
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = (runtime / 'update-ecs.lock').open('a')
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise ReleaseError('已有 Avalon 更新正在运行，稍后再试。') from None
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    if args.phase == 'prepare':
        if (runtime / 'content-safety-current').exists():
            load_state()
            require(state.get('phase') not in ['preparing', 'prepared', 'switching'], '已有未完成发布记录；请继续对应阶段或人工检查，不覆盖备份。')
            state = None
            state_dir = None
        prepare()
    else:
        load_state()
        if args.phase == 'cutover':
            cutover()
        else:
            require(state.get('phase') == 'complete', '本轮未成功切换，不把旧版本健康误记为新版本验收。')
            verify()
except (Exception, KeyboardInterrupt) as error:
    print('发布未完成：' + (str(error) if isinstance(error, ReleaseError) else '发生错误，原始详情不输出以保护私有配置。'), file=sys.stderr)
    if state_owned and state and state_dir:
        if mutation_started:
            try:
                rollback()
                print('已恢复原 Avalon 配置和镜像；保留新审核表、备份及所有原数据。', file=sys.stderr)
            except Exception:
                print('自动回滚未验证成功，请检查私有日志与 Avalon 容器；不要删除数据卷。', file=sys.stderr)
        try:
            restore_timers(False)
        except Exception:
            print('定时器恢复需人工检查。', file=sys.stderr)
        state['phase'] = 'failed'
        save_state()
        print('Avalon 自动更新保持暂停，避免重新部署未验收版本；Mafia 已尝试恢复原运行状态。', file=sys.stderr)
        print('私有发布记录：' + str(state_dir), file=sys.stderr)
    sys.exit(1)
PY
