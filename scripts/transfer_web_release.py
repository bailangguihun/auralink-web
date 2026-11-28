"""Upload a release archive to its prepared, run-specific R25 incoming directory."""

import argparse
import hashlib
from pathlib import Path
import re
import shlex
import subprocess
import time


ARCHIVE_ROOT = Path('/root/autodl-tmp/auralink-web-deploy/incoming')
ATTEMPTS = 3
TRANSFER_SECONDS = 240
REMOTE_INSPECTION = '''
set -eu
archive=$1
if [ -L "$archive" ]; then exit 65; fi
if [ ! -e "$archive" ]; then printf 'MISSING\\n'; exit 0; fi
[ -f "$archive" ] && [ "$(stat -c '%u:%g:%a:%h' -- "$archive")" = 0:0:600:1 ] || exit 65
size=$(stat -c %s -- "$archive")
[ "$size" -le "$2" ] || exit 65
digest=$(sha256sum < "$archive")
printf '%s %s\\n' "$size" "${digest%% *}"
'''


def checksum_prefix(archive, size):
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        remaining = size
        while remaining:
            block = stream.read(min(remaining, 1024 * 1024))
            if not block:
                raise ValueError('local archive changed during transfer')
            digest.update(block)
            remaining -= len(block)
    return digest.hexdigest()


def inspect_remote(command, remote_archive, total):
    script = shlex.join(['sh', '-c', REMOTE_INSPECTION, 'inspect-web-release', str(remote_archive), str(total)])
    inspect = [*command, script]
    for _ in range(ATTEMPTS):
        try:
            result = subprocess.run(inspect, capture_output=True, text=True, timeout=20)
        except subprocess.TimeoutExpired:
            continue
        if result.returncode == 255:
            continue
        if result.returncode != 0:
            raise ValueError('server refused incoming archive inspection')
        response = result.stdout.strip()
        if response == 'MISSING':
            return None, None
        match = re.fullmatch(r'([0-9]{1,12}) ([0-9a-f]{64})', response)
        if match is None:
            raise ValueError('invalid incoming archive inspection response')
        return int(match[1]), match[2]
    raise ValueError('could not inspect incoming archive over SSH')


def transfer(archive, remote_archive, expected_digest, destination, port, options):
    for path in (archive, remote_archive):
        if not re.fullmatch(r'/[A-Za-z0-9._/-]+', str(path)):
            raise ValueError('unsupported archive path')
    total = archive.stat().st_size
    if not total or checksum_prefix(archive, total) != expected_digest:
        raise ValueError('local archive checksum mismatch')
    archive.chmod(0o600)
    ssh = ['ssh', *options, '-p', port, destination]
    sftp = ['sftp', *options, '-P', port, '-b', '-', destination]
    started = time.monotonic()
    for attempt in range(ATTEMPTS + 1):
        size, digest = inspect_remote(ssh, remote_archive, total)
        if size is not None:
            if size > total or digest != (expected_digest if size == total else checksum_prefix(archive, size)):
                raise ValueError('incoming archive prefix checksum mismatch; retained for investigation')
            if size == total:
                print(f'Web archive verified on server ({total} bytes, {time.monotonic() - started:.0f}s)', flush=True)
                return
        if attempt == ATTEMPTS:
            raise ValueError(f'Web archive transfer incomplete ({size or 0}/{total} bytes verified)')
        method = 'put' if size is None else 'reput'
        print(f'Web archive transfer {attempt + 1}/{ATTEMPTS} ({size or 0}/{total} bytes verified)', flush=True)
        try:
            result = subprocess.run(sftp, input=f'{method} -p {archive} {remote_archive}\n',
                                    text=True, timeout=TRANSFER_SECONDS)
            print(f'SFTP exited with status {result.returncode}; checking received bytes', flush=True)
        except subprocess.TimeoutExpired:
            print('SFTP transfer window expired; checking received bytes', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--release', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--destination', required=True)
    parser.add_argument('--port', required=True)
    parser.add_argument('--identity', required=True)
    parser.add_argument('--known-hosts', required=True)
    args = parser.parse_args()
    if re.fullmatch(r'[a-f0-9]{40}(-[1-9][0-9]{0,19}){2}', args.release) is None:
        parser.error('invalid GitHub release identity')
    if re.fullmatch(r'[a-f0-9]{64}', args.sha256) is None:
        parser.error('invalid Web archive SHA-256')
    if re.fullmatch(r'[a-z_][a-z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*', args.destination) is None:
        parser.error('invalid SSH destination')
    if re.fullmatch(r'[1-9][0-9]{0,4}', args.port) is None or int(args.port) > 65535:
        parser.error('invalid SSH port')
    options = ['-i', args.identity, '-o', f'UserKnownHostsFile={args.known_hosts}',
               '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
               '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3']
    try:
        transfer(args.archive, ARCHIVE_ROOT / args.release / 'web.tar.gz', args.sha256,
                 args.destination, args.port, options)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
