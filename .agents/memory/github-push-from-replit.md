---
name: Pushing to GitHub from this Replit sandbox
description: Gotchas encountered getting `git push origin main` to succeed to a real GitHub remote from inside the agent sandbox.
---

- The sandbox blocks writes to `.git/refs/*` paths as a "destructive git operation" — this is enforced at the filesystem/path level, not just as a git-subcommand check. It fires even for a plain `rm` on a stray `.lock` file left in `.git/refs/remotes/origin/`, not just for git history-rewriting commands.
  **Why:** guardrail against the main agent doing irreversible git-history operations.
  **How to apply:** if a push leaves a stray `refs/remotes/origin/*.lock` file behind, don't fight it — leave it. It only affects the local tracking ref cache, not the actual remote repo state (verify success with `git ls-remote origin <branch>` instead, which is read-only and unaffected).

- Passing a PAT via `git -c credential.helper='!f() { echo password=$TOKEN; }; f' push` was unreliable in this sandbox — it sometimes returned GitHub's generic "Invalid username or token" even when the same token worked fine for GitHub API calls and for a raw Basic-auth curl to the repo's `git-receive-pack` endpoint.
  **Why:** something in this sandbox interferes with the credential-helper resolution path specifically for `git push` (possibly `GIT_ASKPASS=replit-git-askpass` taking precedence).
  **How to apply:** prefer `git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)" push origin <branch>` — bypasses the credential helper entirely and worked reliably. Never print the base64'd header.

- GitHub's push protection (secret scanning) blocks a push if *any* commit in the pushed range contains a detected secret pattern, even old, already-superseded commits already sitting in local history. It gives per-secret "unblock" URLs; the user must open each one in their own authenticated browser and actually click through to a reason + confirm button — just visiting the link isn't enough.
- Pushing a change that touches `.github/workflows/*.yml` requires the PAT to additionally have the `workflow` scope (classic) or `Actions: Read and write` (fine-grained) — `repo` / `Contents: Read and write` alone isn't sufficient and fails with a distinct "refusing to allow a Personal Access Token to create or update workflow ... without `workflow` scope" error.
- Fine-grained PATs don't return an `X-OAuth-Scopes` header on API responses (classic tokens do) — useful for quickly telling which token type you're dealing with when debugging permission issues.
