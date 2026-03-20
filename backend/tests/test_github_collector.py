import json
from unittest.mock import AsyncMock, patch

import pytest

from app.collectors import github_collector


def _make_process_mock(stdout: str, returncode: int = 0):
    """Create a mock async process with given stdout and returncode."""
    proc = AsyncMock()
    proc.communicate.return_value = (stdout.encode(), b"")
    proc.returncode = returncode
    return proc


SELF_HOSTED_RUNS_RESPONSE = json.dumps({
    "workflow_runs": [{"id": 999}]
})
SELF_HOSTED_JOBS_RESPONSE = json.dumps({
    "jobs": [{"labels": ["self-hosted", "Linux"]}]
})
CLOUD_JOBS_RESPONSE = json.dumps({
    "jobs": [{"labels": ["ubuntu-latest"]}]
})


def _build_fake_subprocess(
    repos_json: str,
    workflow_responses: dict,
    runs_responses: list,
    self_hosted_repos: set | None = None,
):
    """Build a fake subprocess handler for github_collector tests.

    self_hosted_repos: set of repo names that use self-hosted runners.
    If None, all repos with workflows are treated as self-hosted.
    """
    run_call_index = {"value": 0}

    async def fake_subprocess(*args, **kwargs):
        cmd = args
        if cmd[0] == "gh" and cmd[1] == "repo" and cmd[2] == "list":
            return _make_process_mock(repos_json)

        if cmd[0] == "gh" and cmd[1] == "api":
            endpoint = cmd[2]

            # Workflow check
            if endpoint in workflow_responses:
                return _make_process_mock(workflow_responses[endpoint])

            # Self-hosted check: runs endpoint
            if "/actions/runs" in endpoint and "jobs" not in endpoint:
                repo_name = endpoint.split("/")[2]  # repos/owner/NAME/actions/runs
                return _make_process_mock(SELF_HOSTED_RUNS_RESPONSE)

            # Self-hosted check: jobs endpoint
            if "/jobs" in endpoint:
                # Extract repo name from endpoint
                parts = endpoint.split("/")
                repo_name = parts[2]  # repos/owner/NAME/actions/runs/ID/jobs
                if self_hosted_repos is None or repo_name in self_hosted_repos:
                    return _make_process_mock(SELF_HOSTED_JOBS_RESPONSE)
                return _make_process_mock(CLOUD_JOBS_RESPONSE)

            return _make_process_mock("", returncode=1)

        if cmd[0] == "gh" and cmd[1] == "run":
            idx = run_call_index["value"]
            run_call_index["value"] += 1
            if idx < len(runs_responses):
                return _make_process_mock(runs_responses[idx])
            return _make_process_mock("[]")

        raise ValueError(f"Unexpected command: {cmd}")

    return fake_subprocess


@pytest.mark.asyncio
async def test_collect_discovers_repos_and_filters_by_workflows():
    repos_json = json.dumps([
        {"name": "repo-a", "owner": {"login": "myorg"}},
        {"name": "repo-b", "owner": {"login": "myorg"}},
        {"name": "repo-c", "owner": {"login": "myorg"}},
    ])
    workflow_responses = {
        "repos/myorg/repo-a/actions/workflows": json.dumps({"total_count": 2}),
        "repos/myorg/repo-b/actions/workflows": json.dumps({"total_count": 0}),
        "repos/myorg/repo-c/actions/workflows": json.dumps({"total_count": 1}),
    }
    runs_a = json.dumps([
        {"workflowName": "CI", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T10:00:00Z", "event": "push", "headBranch": "main"},
    ])
    runs_c = json.dumps([
        {"workflowName": "Deploy", "status": "completed", "conclusion": "failure",
         "createdAt": "2026-03-20T09:00:00Z", "event": "push", "headBranch": "main"},
    ])

    fake = _build_fake_subprocess(repos_json, workflow_responses, [runs_a, runs_c])
    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake):
        result = await github_collector.collect()

    assert len(result) == 2
    assert result[0]["repo"] == "myorg/repo-a"
    assert result[1]["repo"] == "myorg/repo-c"


@pytest.mark.asyncio
async def test_collect_filters_to_self_hosted_repos_only():
    """Only repos using self-hosted runners should be included."""
    repos_json = json.dumps([
        {"name": "self-hosted-app", "owner": {"login": "org"}},
        {"name": "cloud-app", "owner": {"login": "org"}},
    ])
    workflow_responses = {
        "repos/org/self-hosted-app/actions/workflows": json.dumps({"total_count": 1}),
        "repos/org/cloud-app/actions/workflows": json.dumps({"total_count": 1}),
    }
    runs = json.dumps([
        {"workflowName": "CI", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T10:00:00Z", "event": "push", "headBranch": "main"},
    ])

    fake = _build_fake_subprocess(
        repos_json, workflow_responses, [runs],
        self_hosted_repos={"self-hosted-app"},
    )
    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake):
        result = await github_collector.collect()

    assert len(result) == 1
    assert result[0]["repo"] == "org/self-hosted-app"


@pytest.mark.asyncio
async def test_collect_merges_runs_sorted_newest_first():
    repos_json = json.dumps([
        {"name": "alpha", "owner": {"login": "org"}},
        {"name": "beta", "owner": {"login": "org"}},
    ])
    workflow_responses = {
        "repos/org/alpha/actions/workflows": json.dumps({"total_count": 1}),
        "repos/org/beta/actions/workflows": json.dumps({"total_count": 1}),
    }
    runs_alpha = json.dumps([
        {"workflowName": "CI", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T08:00:00Z", "event": "push", "headBranch": "main"},
    ])
    runs_beta = json.dumps([
        {"workflowName": "Deploy", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T10:00:00Z", "event": "push", "headBranch": "main"},
    ])

    fake = _build_fake_subprocess(repos_json, workflow_responses, [runs_alpha, runs_beta])
    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake):
        result = await github_collector.collect()

    assert len(result) == 2
    assert result[0]["repo"] == "org/beta"
    assert result[1]["repo"] == "org/alpha"


@pytest.mark.asyncio
async def test_collect_returns_empty_when_gh_fails():
    async def fake_subprocess(*args, **kwargs):
        return _make_process_mock("", returncode=1)

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    assert result == []


@pytest.mark.asyncio
async def test_collect_skips_repo_when_workflow_check_fails():
    repos_json = json.dumps([
        {"name": "good-repo", "owner": {"login": "org"}},
        {"name": "bad-repo", "owner": {"login": "org"}},
    ])
    runs_good = json.dumps([
        {"workflowName": "CI", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T10:00:00Z", "event": "push", "headBranch": "main"},
    ])

    async def fake_subprocess(*args, **kwargs):
        cmd = args
        if cmd[0] == "gh" and cmd[1] == "repo":
            return _make_process_mock(repos_json)
        if cmd[0] == "gh" and cmd[1] == "api":
            endpoint = cmd[2]
            if "good-repo/actions/workflows" in endpoint:
                return _make_process_mock(json.dumps({"total_count": 1}))
            if "bad-repo/actions/workflows" in endpoint:
                return _make_process_mock("", returncode=1)
            # Self-hosted checks for good-repo
            if "/actions/runs" in endpoint and "jobs" not in endpoint:
                return _make_process_mock(SELF_HOSTED_RUNS_RESPONSE)
            if "/jobs" in endpoint:
                return _make_process_mock(SELF_HOSTED_JOBS_RESPONSE)
            return _make_process_mock("", returncode=1)
        if cmd[0] == "gh" and cmd[1] == "run":
            return _make_process_mock(runs_good)
        raise ValueError(f"Unexpected command: {cmd}")

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    assert len(result) == 1
    assert result[0]["repo"] == "org/good-repo"


@pytest.mark.asyncio
async def test_collect_handles_run_list_failure():
    repos_json = json.dumps([
        {"name": "repo-x", "owner": {"login": "org"}},
    ])

    async def fake_subprocess(*args, **kwargs):
        cmd = args
        if cmd[0] == "gh" and cmd[1] == "repo":
            return _make_process_mock(repos_json)
        if cmd[0] == "gh" and cmd[1] == "api":
            endpoint = cmd[2]
            if "actions/workflows" in endpoint:
                return _make_process_mock(json.dumps({"total_count": 1}))
            if "/actions/runs" in endpoint and "jobs" not in endpoint:
                return _make_process_mock(SELF_HOSTED_RUNS_RESPONSE)
            if "/jobs" in endpoint:
                return _make_process_mock(SELF_HOSTED_JOBS_RESPONSE)
        if cmd[0] == "gh" and cmd[1] == "run":
            return _make_process_mock("", returncode=1)
        raise ValueError(f"Unexpected command: {cmd}")

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    assert result == []
