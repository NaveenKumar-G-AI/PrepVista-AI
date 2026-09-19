import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const IMAGE = /^[a-z0-9][a-z0-9._:/-]+@sha256:[a-f0-9]{64}$/;
const NAME = /^pv-check-[a-f0-9-]{36}$/;
export function containerArgs(image, name) {
  if (!IMAGE.test(image) || !NAME.test(name)) throw new Error('Invalid container identity');
  return ['--host', 'unix:///var/run/docker.sock', 'create', '--name', name,
    '--label', 'prepvista.component=coding-validation', '--runtime=runsc', '--pull=never',
    '--network=none', '--read-only', '--cpus=0.5', '--memory=128m', '--memory-swap=128m',
    '--pids-limit=32', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--user=65532:65532', '--log-driver=none', '--ipc=none', '--ulimit=nofile=64:64',
    '--interactive', image];
}

function command(args, input = '', timeout = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/docker', args, { shell: false, windowsHide: true,
      env: { PATH: '/usr/bin:/bin' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let bytes = 0; let exceeded = false;
    const timer = setTimeout(() => { exceeded = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 16000) { exceeded = true; child.kill('SIGKILL'); }
      else output += chunk.toString('utf8');
    });
    // Never log Docker diagnostics: they may contain private submission details.
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > 32000) { exceeded = true; child.kill('SIGKILL'); } });
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('Container unavailable')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || exceeded) reject(new Error('Container unavailable'));
      else resolve(output);
    });
    child.stdin.end(input);
  });
}

export function verifyContainer(value) {
  const host = value.HostConfig;
  if (value.Config?.User !== '65532:65532' || !host || host.Runtime !== 'runsc' ||
      host.NetworkMode !== 'none' || host.ReadonlyRootfs !== true || host.Privileged !== false ||
      host.Memory !== 134217728 || host.MemorySwap !== 134217728 || host.NanoCpus !== 500000000 ||
      host.PidsLimit !== 32 || host.IpcMode !== 'none' || host.LogConfig?.Type !== 'none' ||
      !host.CapDrop?.includes('ALL') || !host.SecurityOpt?.includes('no-new-privileges') ||
      value.Mounts?.length !== 0) throw new Error('Container isolation mismatch');
}

export async function executeContainer(request, image) {
  if (process.platform !== 'linux') throw new Error('An isolated Linux runner host is required');
  const name = 'pv-check-' + randomUUID();
  let container = name;
  try {
    const id = (await command(containerArgs(image, name))).trim();
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid container receipt');
    container = id;
    const inspected = JSON.parse(await command(['--host', 'unix:///var/run/docker.sock', 'inspect', id]));
    if (!Array.isArray(inspected) || inspected.length !== 1) throw new Error('Invalid container inspection');
    verifyContainer(inspected[0]);
    // No shell, host directories, device bindings or environment secrets.
    return JSON.parse(await command(['--host', 'unix:///var/run/docker.sock', 'start', '--attach', '--interactive', id],
      JSON.stringify({ code: request.code, entry: request.entry, tests: request.tests }), 13000));
  } finally {
    // Remove only this generated job container, including killed/start failures.
    // Failed cleanup fails the request and requires the host orphan monitor.
    await command(['--host', 'unix:///var/run/docker.sock', 'rm', '--force', container]);
  }
}
