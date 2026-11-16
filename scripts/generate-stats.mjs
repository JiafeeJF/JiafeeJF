import { mkdir, writeFile } from 'node:fs/promises';

const login = 'JiafeeJF';
const token = process.env.GH_TOKEN;

if (!token) throw new Error('GH_TOKEN is required');

const query = `
  query($login: String!) {
    user(login: $login) {
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
        nodes {
          isFork
          forkCount
          stargazerCount
          primaryLanguage { name color }
        }
      }
      contributionsCollection {
        contributionCalendar { totalContributions }
      }
      pullRequests(first: 1) { totalCount }
      issues(first: 1) { totalCount }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'JiafeeJF-profile-stats',
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

const payload = await response.json();
if (payload.errors?.length) throw new Error(payload.errors.map((item) => item.message).join('; '));

const user = payload.data.user;
const owned = user.repositories.nodes.filter((repo) => !repo.isFork);
const stars = owned.reduce((total, repo) => total + repo.stargazerCount, 0);
const forks = owned.reduce((total, repo) => total + repo.forkCount, 0);
const languageCounts = new Map();

for (const repo of owned) {
  const language = repo.primaryLanguage;
  if (!language) continue;
  const current = languageCounts.get(language.name) ?? { count: 0, color: language.color ?? '#8b949e' };
  current.count += 1;
  languageCounts.set(language.name, current);
}

const languages = [...languageCounts.entries()]
  .sort((left, right) => right[1].count - left[1].count)
  .slice(0, 4);

const stats = [
  ['PUBLIC REPOS', user.repositories.totalCount],
  ['STARS EARNED', stars],
  ['PULL REQUESTS', user.pullRequests.totalCount],
  ['CONTRIBUTIONS', user.contributionsCollection.contributionCalendar.totalContributions],
];

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function render(theme) {
  const dark = theme === 'dark';
  const colors = dark
    ? { bg: '#0d1117', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', signal: '#ff7b54', link: '#58a6ff' }
    : { bg: '#f6f8fa', border: '#d0d7de', text: '#1f2328', muted: '#57606a', signal: '#e85d3a', link: '#0969da' };

  const metrics = stats.map(([label, value], index) => {
    const x = 52 + index * 186;
    return `
      <text x="${x}" y="132" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="36" font-weight="700">${escapeXml(value)}</text>
      <text x="${x}" y="160" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13">${label}</text>`;
  }).join('');

  const totalLanguages = languages.reduce((total, [, value]) => total + value.count, 0) || 1;
  let barX = 52;
  const bars = languages.map(([name, value]) => {
    const width = Math.max(26, Math.round((value.count / totalLanguages) * 696));
    const segment = `<rect x="${barX}" y="220" width="${width}" height="8" rx="4" fill="${escapeXml(value.color)}"/>`;
    barX += width + 4;
    return segment;
  }).join('');

  const legend = languages.map(([name, value], index) => {
    const x = 52 + index * 180;
    return `<circle cx="${x + 5}" cy="266" r="5" fill="${escapeXml(value.color)}"/><text x="${x + 18}" y="271" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13">${escapeXml(name)} · ${value.count}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="310" viewBox="0 0 800 310" role="img" aria-labelledby="title desc">
    <title id="title">${login} public GitHub stats</title>
    <desc id="desc">Public repositories, stars, pull requests, yearly contributions, and primary repository languages.</desc>
    <rect x="1" y="1" width="798" height="308" rx="10" fill="${colors.bg}" stroke="${colors.border}"/>
    <circle cx="52" cy="50" r="7" fill="${colors.signal}"/>
    <text x="72" y="58" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700">${login} / PUBLIC ACTIVITY</text>
    <text x="748" y="56" text-anchor="end" fill="${colors.link}" font-family="Segoe UI, sans-serif" font-size="13">AUTO UPDATED</text>
    <path d="M52 82H748" stroke="${colors.border}"/>
    ${metrics}
    <text x="52" y="204" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="600">PRIMARY REPOSITORY LANGUAGES</text>
    ${bars}
    ${legend}
    <text x="748" y="291" text-anchor="end" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="12">Forks on owned repositories: ${forks} · Issues opened: ${user.issues.totalCount}</text>
  </svg>`;
}

await mkdir('dist', { recursive: true });
await Promise.all([
  writeFile('dist/github-stats.svg', render('light')),
  writeFile('dist/github-stats-dark.svg', render('dark')),
]);
