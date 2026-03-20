import asyncio
import json
import os
from typing import Any


async def _run_gh(*args: str) -> str | None:
    """Run a gh CLI command and return stdout, or None on failure."""
    env = os.environ.copy()
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        env["GITHUB_TOKEN"] = token

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, _ = await proc.communicate()
    except (FileNotFoundError, OSError):
        return None
    if proc.returncode != 0:
        return None
    return stdout.decode()


async def _get_repos() -> list[dict[str, Any]]:
    """Discover all accessible repos via gh repo list."""
    output = await _run_gh(
        "gh", "repo", "list", "--json", "name,owner", "--limit", "100"
    )
    if not output:
        return []
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        return []


async def _has_workflows(owner: str, repo: str) -> bool:
    """Check if a repo has at least one workflow."""
    output = await _run_gh(
        "gh", "api", f"repos/{owner}/{repo}/actions/workflows"
    )
    if not output:
        return False
    try:
        data = json.loads(output)
        return data.get("total_count", 0) > 0
    except json.JSONDecodeError:
        return False


async def _get_runs(owner: str, repo: str) -> list[dict[str, Any]]:
    """Fetch recent workflow runs for a repo."""
    output = await _run_gh(
        "gh", "run", "list", "-R", f"{owner}/{repo}",
        "--json", "workflowName,status,conclusion,createdAt,event,headBranch",
        "--limit", "10",
    )
    if not output:
        return []
    try:
        runs = json.loads(output)
    except json.JSONDecodeError:
        return []

    return [
        {
            "repo": f"{owner}/{repo}",
            "workflow_name": r.get("workflowName", ""),
            "status": r.get("status", ""),
            "conclusion": r.get("conclusion", ""),
            "created_at": r.get("createdAt", ""),
        }
        for r in runs
    ]


async def collect() -> list[dict[str, Any]]:
    """Collect recent GitHub Actions runs from all accessible repos with workflows.

    Returns a flat list of runs sorted by created_at (newest first).
    Returns empty list if gh CLI is unavailable or GITHUB_TOKEN is missing.
    """
    repos = await _get_repos()
    if not repos:
        return []

    # Check which repos have workflows
    workflow_checks = []
    for repo in repos:
        owner = repo["owner"]["login"]
        name = repo["name"]
        workflow_checks.append((owner, name, _has_workflows(owner, name)))

    repos_with_workflows = []
    for owner, name, coro in workflow_checks:
        if await coro:
            repos_with_workflows.append((owner, name))

    # Fetch runs from all repos with workflows
    all_runs: list[dict[str, Any]] = []
    for owner, name in repos_with_workflows:
        runs = await _get_runs(owner, name)
        all_runs.extend(runs)

    # Sort by created_at descending (newest first)
    all_runs.sort(key=lambda r: r.get("created_at", ""), reverse=True)

    return all_runs
