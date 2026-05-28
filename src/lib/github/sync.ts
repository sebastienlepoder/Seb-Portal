import prisma from '@/lib/db';
import { listSyncableRepos } from '@/lib/github';
import { writeActivity } from '@/lib/activity';

export interface RepoSyncResult {
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'repo'
  );
}

/**
 * Pull the configured GitHub repos and create a Project row for any that
 * don't already exist (matched by repoOwner/repoName). Existing projects
 * are left untouched — we never clobber a user's classification (status),
 * renamed title, or custom working branch. GitHub-archived repos are
 * created with status "archived".
 */
export async function syncReposToProjects(): Promise<RepoSyncResult> {
  const result: RepoSyncResult = { fetched: 0, created: 0, skipped: 0, errors: [] };

  let repos;
  try {
    repos = await listSyncableRepos();
  } catch (e) {
    result.errors.push((e as Error).message);
    return result;
  }
  result.fetched = repos.length;

  const existing = await prisma.project.findMany({
    select: { id: true, slug: true, repoOwner: true, repoName: true },
  });
  const byRepo = new Map(
    existing
      .filter((p) => p.repoOwner && p.repoName)
      .map((p) => [`${p.repoOwner!.toLowerCase()}/${p.repoName!.toLowerCase()}`, p])
  );
  const slugs = new Set(existing.map((p) => p.slug));

  const maxSort = existing.length; // append new ones after current set
  let nextSort = maxSort;

  for (const repo of repos) {
    const key = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
    if (byRepo.has(key)) {
      result.skipped += 1;
      continue;
    }

    // Unique slug.
    const base = slugify(repo.name);
    let slug = base;
    let n = 2;
    while (slugs.has(slug)) slug = `${base}-${n++}`;
    slugs.add(slug);

    try {
      await prisma.project.create({
        data: {
          slug,
          name: repo.name,
          description: repo.description ?? null,
          repoUrl: repo.htmlUrl,
          repoOwner: repo.owner,
          repoName: repo.name,
          workingBranch: repo.defaultBranch || 'main',
          status: repo.archived ? 'archived' : 'active',
          kind: 'digital',
          allowWrite: false,
          sortOrder: nextSort++,
        },
      });
      byRepo.set(key, { id: 'new', slug, repoOwner: repo.owner, repoName: repo.name });
      result.created += 1;
    } catch (e) {
      result.errors.push(`${repo.fullName}: ${(e as Error).message}`);
    }
  }

  if (result.created > 0 || result.errors.length > 0) {
    await writeActivity({
      type: 'github.synced',
      description: `GitHub sync: ${result.created} new project${result.created === 1 ? '' : 's'} from ${result.fetched} repo${result.fetched === 1 ? '' : 's'}`,
      entityType: 'project',
      actor: 'system',
      data: result,
    }).catch(() => {});
  }

  return result;
}
