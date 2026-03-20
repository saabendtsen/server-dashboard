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


@pytest.mark.asyncio
async def test_collect_discovers_repos_and_filters_by_workflows():
    """collect() should discover repos via gh, filter to those with workflows, and fetch runs."""
    repos_json = json.dumps([
        {"name": "repo-a", "owner": {"login": "myorg"}},
        {"name": "repo-b", "owner": {"login": "myorg"}},
        {"name": "repo-c", "owner": {"login": "myorg"}},
    ])

    # repo-a has workflows, repo-b has none, repo-c has workflows
    workflow_responses = {
        "repos/myorg/repo-a/actions/workflows": json.dumps({"total_count": 2, "workflows": []}),
        "repos/myorg/repo-b/actions/workflows": json.dumps({"total_count": 0, "workflows": []}),
        "repos/myorg/repo-c/actions/workflows": json.dumps({"total_count": 1, "workflows": []}),
    }

    runs_a = json.dumps([
        {"workflowName": "CI", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T10:00:00Z", "event": "push", "headBranch": "main"},
    ])
    runs_c = json.dumps([
        {"workflowName": "Deploy", "status": "completed", "conclusion": "failure",
         "createdAt": "2026-03-20T09:00:00Z", "event": "push", "headBranch": "main"},
    ])

    call_index = {"value": 0}

    async def fake_subprocess(*args, **kwargs):
        cmd = args
        if cmd[0] == "gh" and cmd[1] == "repo" and cmd[2] == "list":
            return _make_process_mock(repos_json)
        if cmd[0] == "gh" and cmd[1] == "api":
            endpoint = cmd[2]
            return _make_process_mock(workflow_responses[endpoint])
        if cmd[0] == "gh" and cmd[1] == "run":
            # run list calls: first for repo-a, then repo-c
            call_index["value"] += 1
            if call_index["value"] == 1:
                return _make_process_mock(runs_a)
            else:
                return _make_process_mock(runs_c)
        raise ValueError(f"Unexpected command: {cmd}")

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    # Should have 2 runs total (only from repos with workflows)
    assert len(result) == 2
    # Sorted newest first
    assert result[0]["repo"] == "myorg/repo-a"
    assert result[0]["workflow_name"] == "CI"
    assert result[0]["conclusion"] == "success"
    assert result[1]["repo"] == "myorg/repo-c"
    assert result[1]["workflow_name"] == "Deploy"
    assert result[1]["conclusion"] == "failure"


@pytest.mark.asyncio
async def test_collect_merges_runs_sorted_newest_first():
    """Runs from multiple repos should be merged into a single list sorted by created_at desc."""
    repos_json = json.dumps([
        {"name": "alpha", "owner": {"login": "org"}},
        {"name": "beta", "owner": {"login": "org"}},
    ])

    workflow_responses = {
        "repos/org/alpha/actions/workflows": json.dumps({"total_count": 1, "workflows": []}),
        "repos/org/beta/actions/workflows": json.dumps({"total_count": 1, "workflows": []}),
    }

    runs_alpha = json.dumps([
        {"workflowName": "CI", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T08:00:00Z", "event": "push", "headBranch": "main"},
        {"workflowName": "CI", "status": "completed", "conclusion": "failure",
         "createdAt": "2026-03-19T12:00:00Z", "event": "push", "headBranch": "main"},
    ])
    runs_beta = json.dumps([
        {"workflowName": "Deploy", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-20T10:00:00Z", "event": "push", "headBranch": "main"},
        {"workflowName": "Lint", "status": "completed", "conclusion": "success",
         "createdAt": "2026-03-19T15:00:00Z", "event": "pull_request", "headBranch": "feat"},
    ])

    run_call_index = {"value": 0}

    async def fake_subprocess(*args, **kwargs):
        cmd = args
        if cmd[0] == "gh" and cmd[1] == "repo":
            return _make_process_mock(repos_json)
        if cmd[0] == "gh" and cmd[1] == "api":
            return _make_process_mock(workflow_responses[cmd[2]])
        if cmd[0] == "gh" and cmd[1] == "run":
            run_call_index["value"] += 1
            if run_call_index["value"] == 1:
                return _make_process_mock(runs_alpha)
            else:
                return _make_process_mock(runs_beta)
        raise ValueError(f"Unexpected command: {cmd}")

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    assert len(result) == 4
    # Verify sorted newest first
    timestamps = [r["created_at"] for r in result]
    assert timestamps == sorted(timestamps, reverse=True)
    # Newest is beta's Deploy at 10:00
    assert result[0]["repo"] == "org/beta"
    assert result[0]["workflow_name"] == "Deploy"
    # Oldest is alpha's CI failure at 12:00 on 19th
    assert result[3]["repo"] == "org/alpha"
    assert result[3]["created_at"] == "2026-03-19T12:00:00Z"


@pytest.mark.asyncio
async def test_collect_returns_empty_when_gh_fails():
    """If gh repo list fails, collect() should return an empty list gracefully."""
    async def fake_subprocess(*args, **kwargs):
        return _make_process_mock("", returncode=1)

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    assert result == []


@pytest.mark.asyncio
async def test_collect_skips_repo_when_workflow_check_fails():
    """If checking workflows for a repo fails, that repo should be skipped."""
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
            if "good-repo" in endpoint:
                return _make_process_mock(json.dumps({"total_count": 1, "workflows": []}))
            else:
                # bad-repo workflow check fails
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
    """If fetching runs for a repo fails, that repo's runs are just empty."""
    repos_json = json.dumps([
        {"name": "repo-x", "owner": {"login": "org"}},
    ])

    async def fake_subprocess(*args, **kwargs):
        cmd = args
        if cmd[0] == "gh" and cmd[1] == "repo":
            return _make_process_mock(repos_json)
        if cmd[0] == "gh" and cmd[1] == "api":
            return _make_process_mock(json.dumps({"total_count": 1, "workflows": []}))
        if cmd[0] == "gh" and cmd[1] == "run":
            return _make_process_mock("", returncode=1)
        raise ValueError(f"Unexpected command: {cmd}")

    with patch("app.collectors.github_collector.asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        result = await github_collector.collect()

    assert result == []
