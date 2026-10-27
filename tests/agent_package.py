"""Run only the packaged self-test: no AppData install, registry or USB access."""
import json
import subprocess
from agent_bridge import ROOT,temporary_home

with temporary_home('dl-package-') as temp:
    exe=ROOT/'.test-artifacts/agent-release/DroneLab-Agent-Setup.exe'
    run=subprocess.run([str(exe),'--self-test',temp],timeout=90,creationflags=subprocess.CREATE_NO_WINDOW)
    from pathlib import Path
    report=Path(temp)/'agent-selftest.json'
    if run.returncode or not report.exists():
        error=Path(temp)/'agent-selftest-error.txt'
        raise RuntimeError(error.read_text() if error.exists() else f'Packaged self-test failed ({run.returncode})')
    data=json.loads(report.read_text())
    assert data['assets'] and data['tk'] and not data['installedToUserProfile'] and not data['registryModified'],data
    print(json.dumps(data))
