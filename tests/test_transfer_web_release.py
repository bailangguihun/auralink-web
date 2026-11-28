import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from transfer_web_release import transfer


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.sandbox = tempfile.TemporaryDirectory()
        self.addCleanup(self.sandbox.cleanup)
        self.archive = Path(self.sandbox.name) / 'web.tar.gz'
        self.data = b'completed Web archive'
        self.archive.write_bytes(self.data)
        self.digest = hashlib.sha256(self.data).hexdigest()
        self.remote_data = None
        self.commands = []
        self.uploads = []
        self.addCleanup(patch.stopall)
        patch('transfer_web_release.subprocess.run', side_effect=self.command).start()

    def command(self, args, **kwargs):
        if args[0] == 'ssh':
            if self.remote_data is None:
                output = 'MISSING\n'
            else:
                output = f'{len(self.remote_data)} {hashlib.sha256(self.remote_data).hexdigest()}\n'
            return subprocess.CompletedProcess(args, 0, stdout=output)
        self.commands.append(kwargs['input'].split()[0])
        updated, status = self.uploads.pop(0)
        self.remote_data = updated
        if status == 'timeout':
            raise subprocess.TimeoutExpired(args, kwargs['timeout'])
        return subprocess.CompletedProcess(args, status)

    def run_transfer(self):
        return transfer(self.archive, Path('/incoming/release/web.tar.gz'), self.digest, 'root@host', '22', [])

    def test_timed_out_transfer_resumes_and_recovers_lost_final_receipt(self):
        self.uploads = [(self.data[:8], 'timeout'), (self.data, 255)]
        self.run_transfer()
        self.assertEqual(self.commands, ['put', 'reput'])

    def test_wrong_prefix_is_preserved(self):
        self.remote_data = b'unrelated'
        with self.assertRaisesRegex(ValueError, 'prefix checksum'):
            self.run_transfer()
        self.assertEqual(self.remote_data, b'unrelated')
        self.assertEqual(self.commands, [])

    def test_complete_archive_is_reused(self):
        self.remote_data = self.data
        self.run_transfer()
        self.assertEqual(self.commands, [])

    def test_no_progress_stops_after_consecutive_attempts(self):
        self.uploads = [(None, 255)] * 3
        with self.assertRaisesRegex(ValueError, 'transfer incomplete'):
            self.run_transfer()
        self.assertEqual(self.commands, ['put', 'put', 'put'])

    def test_corrupt_local_archive_is_refused_before_contacting_server(self):
        self.archive.write_bytes(b'wrong local file')
        with self.assertRaisesRegex(ValueError, 'local archive checksum'):
            self.run_transfer()
        self.assertEqual(self.commands, [])
