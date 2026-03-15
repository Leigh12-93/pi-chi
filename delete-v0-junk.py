"""Delete all v0-package-* projects from Vercel, paginating through all pages."""
import json, urllib.request, ssl, time

AUTH_FILE = r'C:\Users\leigh\AppData\Roaming\com.vercel.cli\Data\auth.json'
TEAM_ID = 'team_vq0Al9awzgoaAOq7QvvdR95V'

with open(AUTH_FILE) as f:
    token = json.load(f)['token']

headers = {'Authorization': f'Bearer {token}'}
ctx = ssl.create_default_context()

# Paginate through ALL projects
all_projects = []
until = None
while True:
    url = f'https://api.vercel.com/v9/projects?limit=100&teamId={TEAM_ID}'
    if until:
        url += f'&until={until}'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx) as resp:
        data = json.load(resp)

    projects = data.get('projects', [])
    all_projects.extend(projects)

    pagination = data.get('pagination', {})
    next_ts = pagination.get('next')
    if not next_ts or len(projects) == 0:
        break
    until = next_ts

print(f'Total projects found: {len(all_projects)}')

# Only delete v0-package-* projects
targets = [p for p in all_projects if p['name'].startswith('v0-package-')]
print(f'v0-package-* to delete: {len(targets)}')
print(f'Keeping: {len(all_projects) - len(targets)} projects\n')

deleted = 0
errors = 0
for p in targets:
    url = f"https://api.vercel.com/v9/projects/{p['id']}?teamId={TEAM_ID}"
    dr = urllib.request.Request(url, method='DELETE', headers=headers)
    try:
        urllib.request.urlopen(dr, context=ctx)
        deleted += 1
        if deleted % 10 == 0:
            print(f'  ...deleted {deleted}/{len(targets)}')
    except Exception as e:
        errors += 1
        print(f"  FAILED: {p['name']} - {e}")

print(f'\nDone: {deleted} deleted, {errors} errors')
