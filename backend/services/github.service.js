const axios = require('axios');

const GH_API = 'https://api.github.com';

const parseRepoUrl = (repoUrl) => {
  const match = repoUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
};

const triggerWorkflowDispatch = async (accessToken, owner, repo, workflow = 'deploy.yml', ref = 'main') => {
  await axios.post(
    `${GH_API}/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    { ref },
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
  );
};

const getLatestWorkflowRuns = async (accessToken, owner, repo) => {
  const res = await axios.get(
    `${GH_API}/repos/${owner}/${repo}/actions/runs?per_page=10`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
  );
  return res.data?.workflow_runs || [];
};

const getWorkflowRunLogs = async (accessToken, owner, repo, runId) => {
  // Returns a redirect URL to the logs zip — use the URL directly
  const res = await axios.get(
    `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}/logs`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      maxRedirects: 0,
      validateStatus: s => s === 302,
    }
  );
  return res.headers.location; // download URL for logs zip
};

module.exports = { parseRepoUrl, triggerWorkflowDispatch, getLatestWorkflowRuns, getWorkflowRunLogs };
