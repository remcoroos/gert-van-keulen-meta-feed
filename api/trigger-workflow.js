/**
 * Trigger Workflow API for Vercel
 * Uses the GitHub API to dispatch the 'Daily Feed Update' workflow.
 * Requires: GH_TOKEN environment variable in Vercel.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST method required' });
  }

  const GH_TOKEN = process.env.GH_TOKEN;
  const REPO = process.env.GH_REPO || 'remcoroos/gert-van-keulen-meta-feed';
  const WORKFLOW_ID = 'daily-update.yml';

  if (!GH_TOKEN) {
    console.error('GH_TOKEN is missing in Vercel environment variables.');
    return res.status(500).json({ error: 'Server misconfigured: GH_TOKEN missing' });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Serverless-Function'
      },
      body: JSON.stringify({ ref: 'main' }),
    });

    if (response.ok) {
      return res.status(200).json({ success: true, message: `GitHub workflow for ${REPO} started!` });
    } else {
      const errText = await response.text();
      return res.status(response.status).json({ error: `GitHub API error: ${errText}` });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
