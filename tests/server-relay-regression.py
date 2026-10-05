"""Exercise real PHP HTTP handlers, tokens, revisions and inter-process locks.

Run: LOG_PHP_BINARY=/path/to/php python3 tests/server-relay-regression.py
All data and secrets are synthetic and live only in a temporary local server.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get("LOG_PHP_BINARY", "php")
OWNER, MEMBER, OTHER = "owner-token-" + "o" * 32, "member-token-" + "m" * 32, "wrong-token-" + "w" * 32


def run():
    for file in ROOT.joinpath("server").glob("*.php"):
        subprocess.run([PHP, "-n", "-l", str(file)], check=True, capture_output=True)
    with tempfile.TemporaryDirectory(prefix="log-php-test-") as scratch:
        docroot = Path(scratch) / "log"
        api = docroot / "api"
        api.mkdir(parents=True)
        for file in ROOT.joinpath("server").glob("*.php"):
            shutil.copy(file, api / file.name)
        (docroot / "private").mkdir()
        (docroot / "private" / "publish-secret.php").write_text("<?php define('LOG_PUBLISH_KEY','synthetic-publish-key-0000000000');")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        server = subprocess.Popen([PHP, "-n", "-S", f"127.0.0.1:{port}", "-t", str(docroot)],
                                  env={**os.environ, "PHP_CLI_SERVER_WORKERS": "4"},
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        base = f"http://127.0.0.1:{port}/api/"

        def request(endpoint, body=None, token="", identifier="", extra_headers=None):
            headers = {"Content-Type": "application/json", **(extra_headers or {})}
            if token:
                headers["X-Log-Access-Token"] = token
            url = base + endpoint + ("?id=" + identifier if identifier else "")
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            try:
                response = urllib.request.urlopen(req, timeout=8)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                data = response.read().decode()
                return response.status, json.loads(data) if data else {}, dict(response.headers)

        def expect(status, result):
            assert result[0] == status, result
            return result[1]

        def payload(text="ciphertext"):
            return {"v": 1, "alg": "A256GCM", "data": text, "iv": "synthetic"}

        def put(identifier, kind="conversation", revision=0, text="ciphertext"):
            return {"action": "put", "id": identifier, "kind": kind, "baseRevision": revision,
                    "ownerPersonId": "O" * 12, "payload": payload(text)}

        try:
            for _ in range(100):
                try:
                    result = request("sync.php")
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.02)
            else:
                raise AssertionError("Local PHP server did not start")
            for endpoint in ("sync.php", "connections.php", "publish.php"):
                result = request(endpoint)
                expect(422, result)
                assert result[2].get("X-Log-Server-Version") == "2026-10-05.1"
            for index, kind in enumerate(("task", "vehicle", "conversation")):
                identifier = str(index) * 12
                expect(200, request("sync.php", put(identifier, kind), OWNER))
                expect(403, request("sync.php", identifier=identifier))
                expect(403, request("sync.php", token=OTHER, identifier=identifier))
                assert expect(200, request("sync.php", token=OWNER, identifier=identifier))["payload"]["data"] == "ciphertext"
                expect(200, request("sync.php", {"action": "member", "id": identifier, "memberToken": MEMBER,
                                                   "personId": "M" * 12, "rights": ["view"]}, OWNER))
                expect(200, request("sync.php", token=MEMBER, identifier=identifier))
                expect(403, request("sync.php", put(identifier, kind, 1), MEMBER))
                expect(200, request("sync.php", {"action": "member", "id": identifier, "memberToken": MEMBER,
                                                   "personId": "M" * 12, "rights": ["write"]}, OWNER))
                expect(403, request("sync.php", token=MEMBER, identifier=identifier))
            # Public ciphertext recovery and existing person-card routing stay compatible.
            for kind, identifier in (("person-backup", "B" * 12), ("collaboration", "P" * 12)):
                expect(200, request("sync.php", put(identifier, kind), OWNER))
                assert "payload" in expect(200, request("sync.php", identifier=identifier))
            identifier = "R" * 12
            expect(200, request("sync.php", put(identifier), OWNER))
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                results = list(pool.map(lambda text: request("sync.php", put(identifier, revision=1, text=text), OWNER), ("first", "second")))
            assert sorted(result[0] for result in results) == [200, 409], results
            final = expect(200, request("sync.php", token=OWNER, identifier=identifier))
            assert final["revision"] == 2 and final["payload"]["data"] in ("first", "second")
            # A lock held by a separate PHP process must bound the wait with 503.
            lock_path = docroot / "private" / "locks" / f"sync-{identifier}.lock"
            holder = subprocess.Popen([PHP, "-n", "-r", '$h=fopen($argv[1],"c");flock($h,LOCK_EX);echo "locked\\n";flush();sleep(4);', str(lock_path)], stdout=subprocess.PIPE, text=True)
            try:
                assert holder.stdout.readline().strip() == "locked"
                result = request("sync.php", token=OWNER, identifier=identifier)
                expect(503, result)
                assert result[2].get("Retry-After") == "2"
            finally:
                holder.terminate()
                holder.wait(timeout=5)
            expect(200, request("sync.php", {"action": "revoke", "id": identifier}, OWNER))
            assert "payload" not in expect(200, request("sync.php", token=OWNER, identifier=identifier))
            expect(410, request("sync.php", put(identifier, revision=2), OWNER))
            connection_id = "C" * 12
            create = {"action": "create", "id": connection_id, "ownerPersonId": "O" * 12,
                      "memberPersonId": "M" * 12, "memberToken": MEMBER, "payload": payload()}
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                results = list(pool.map(lambda _: request("connections.php", create, OWNER), range(2)))
            assert sorted(result[0] for result in results) == [200, 409], results
            expect(403, request("connections.php", identifier=connection_id))
            expect(200, request("connections.php", identifier=connection_id, token=MEMBER))
            update = {"action": "put", "id": connection_id, "baseRevision": 1, "status": "connected", "payload": payload()}
            expect(403, request("connections.php", update, OWNER))
            expect(200, request("connections.php", update, MEMBER))
            expect(409, request("connections.php", update, MEMBER))
            expect(200, request("connections.php", {"action": "revoke", "id": connection_id}, MEMBER))
            assert "payload" not in expect(200, request("connections.php", identifier=connection_id, token=OWNER))
            # Existing publishing key and owner-only controls must still work.
            identifier = "F" * 12
            config = {"kind": "log-config", "schema": "https://sharon.life/log/config/v1", "version": 1, "id": identifier,
                      "root": {"type": "card", "id": "Card0001"},
                      "objects": {name: [] for name in ("locations", "themes", "subthemes", "cards", "actions")}}
            headers = {"X-Log-Publish-Key": "synthetic-publish-key-0000000000"}
            expect(200, request("publish.php", config, extra_headers=headers))
            expect(200, request("publish.php", identifier=identifier))
            expect(401, request("publish.php", config, extra_headers={"X-Log-Sharing-Action": "offline"}))
            expect(200, request("publish.php", config, extra_headers={**headers, "X-Log-Sharing-Action": "offline"}))
            assert not expect(200, request("publish.php", identifier=identifier))["active"]
            print("PHP relay checks passed: syntax, tokens/view/write rights, legacy recovery/cards, concurrent updates/create, bounded process locks, revoke and publishing controls.")
        finally:
            os.killpg(server.pid, signal.SIGTERM)
            server.wait(timeout=5)


if __name__ == "__main__":
    run()
