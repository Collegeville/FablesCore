# Updating games when FablesCore changes

Each game keeps its own copy of the `fables-core` folder, and `fables-core/VERSION` says which release it is. A game never changes until you merge a pull request.

## Releasing a new version of the core

1. Make the change on a branch. In the same change, set the new number in `fables-core/VERSION` (and `package.json`), add a `## 0.2.0` section at the top of `CHANGELOG.md`, and copy the core into the example with `npm run vendor-example` (or ask Claude to). If a game will need its own code changes, start the changelog entry with **Breaking** and say what to do.
2. In GitHub Desktop, commit, push, and open a pull request. The Tests check runs on it. Merge when it is green.
3. On github.com, open the FablesCore repo, then **Actions > Release > Run workflow**. Type the version without the v (for example `0.2.0`) and click **Run workflow**.
4. The workflow runs every test first. If any test fails, nothing is tagged. If they pass, it creates the tag `v0.2.0` and a release with `fables-core.zip` attached and the changelog section as its notes.

## How a game hears about it

Every game has an **Update FablesCore** workflow (copied from `templates/update-fables-core.yml`). Each Monday it checks for a newer release. If there is one, it replaces the game's `fables-core` folder with the new one and opens a pull request titled "Update FablesCore to 0.2.0", with the changelog in the description.

To check right away instead of waiting for Monday: open the game repo on github.com, then **Actions > Update FablesCore > Run workflow**.

To take the update: open the pull request, read the notes, open the game from the pull request's branch to try a puzzle (in GitHub Desktop, switch to the branch, then **Repository > Show in Finder** and open `index.html`), and click **Merge pull request**.

## One-time setup in each game repo

1. Copy `templates/update-fables-core.yml` to `.github/workflows/update-fables-core.yml` in the game. If the game keeps the core somewhere other than `fables-core` (DataFables would use `site/fables-core`), change `CORE_DIR` at the top of the file.
2. On github.com, open the game repo's **Settings > Actions > General**. Under **Workflow permissions**, tick **Allow GitHub Actions to create and approve pull requests** and save.
3. Add the game to `registry.json` in FablesCore, with `"active": true`.

## Permissions, and why no secret is needed

The weekly check needs no stored token. FablesCore is public, so any repo can read its releases, and the pull request is opened with the game repo's own built-in token, limited to that repo. This is the least-privilege option: nothing in FablesCore can write to any game.

The cost is a wait of up to a week, or one click on **Run workflow**. If you want each release to start the check in every game immediately, add an optional secret to FablesCore:

1. On github.com, go to your profile picture > **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
2. Resource owner: **Collegeville**. Repository access: **Only select repositories**, and pick only the game repos listed in `registry.json`.
3. Permissions: **Actions: Read and write**. Nothing else. That lets it start a workflow, but not change code or open pull requests itself.
4. Set an expiry date, generate it, and copy it.
5. In FablesCore, go to **Settings > Secrets and variables > Actions > New repository secret**, name it `FABLES_NOTIFY_TOKEN`, and paste.

To check the token, open **Actions > Notify games > Run workflow**: it starts the update check in every game, and each game opens a pull request only if it is behind.

When the token is missing, the release still works and the notify step shows a warning; games fall back to their weekly check. When the token has expired or does not cover a game, the notify step fails and names the game, and the release itself is already done; renew the token and run **Notify games** by hand. An organization-owned GitHub App would avoid expiring tokens, but it is more setup than this family needs now.

## DataFables

DataFables keeps the core at `site/fables-core` (its update workflow sets `CORE_DIR` to that). Its daily publish workflow copies `site/` into the published site, so a merged update pull request goes live with the next publish.
