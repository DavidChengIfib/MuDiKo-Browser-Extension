// Talks to the same hub endpoints as Hub/Frontend/src/pages/apps/AppImportPage.jsx.

export const DEFAULT_HUB_URL = 'http://localhost:3000';
export const SESSION_COOKIE = 'mudiko_admin_session';
export const ACTIVE_JOB_STATUSES = ['queued', 'running', 'cancelling'];

export function normalizeHubUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('Bitte eine vollständige Adresse eingeben, z. B. http://localhost:3000');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Die Hub-Adresse muss mit http:// oder https:// beginnen.');
  }
  return url.origin;
}

export function parseTags(text) {
  const tags = String(text ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  return [...new Set(tags)];
}

export function createHubClient(hubUrl, fetchImpl = (...args) => fetch(...args)) {
  async function request(path, options, fallbackMessage) {
    let response;
    try {
      response = await fetchImpl(`${hubUrl}${path}`, { credentials: 'include', cache: 'no-store', ...options });
    } catch {
      const error = new Error(`Der Hub unter ${hubUrl} ist nicht erreichbar.`);
      error.status = 0;
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      const error = new Error(data.error || fallbackMessage);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    loginUrl: `${hubUrl}/api/admin/auth/github/login`,
    appUrl: (slug) => `${hubUrl}/apps/${encodeURIComponent(slug)}`,

    getSession: () => request('/api/admin/session', {}, 'Der Admin-Status konnte nicht geladen werden.'),

    getStatus: () => request('/api/app-hub/status', {}, 'Der Hub-Status konnte nicht geladen werden.'),

    async listApps() {
      const data = await request('/api/apps', {}, 'Die App-Liste konnte nicht geladen werden.');
      return Array.isArray(data.apps) ? data.apps : [];
    },

    async startDeployment({ name, description, tags, zipFile, csrfToken }) {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      formData.append('tags', JSON.stringify(tags));
      formData.append('projectZip', zipFile, zipFile.name);
      const data = await request('/api/app-hub/deployments', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
      }, 'Das Deployment konnte nicht gestartet werden.');
      return data.job;
    },

    async getDeployment(jobId) {
      const data = await request(
        `/api/app-hub/deployments/${encodeURIComponent(jobId)}`,
        {},
        'Der Deployment-Status konnte nicht geladen werden.',
      );
      return data.job;
    },
  };
}
