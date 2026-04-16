# Recipe: GitHub Issues sink

No database, no admin UI. Bug reports open as GitHub Issues with a `bugkit` label. Admins triage in GitHub's web UI.

**Best for:** open-source projects, small teams already living in GitHub, projects without a backend DB.

---

## Prerequisites

- Project has a GitHub repo
- A GitHub Personal Access Token or GitHub App with `issues:write` scope, stored as `GITHUB_TOKEN` in env
- `GITHUB_OWNER` and `GITHUB_REPO` env vars

---

## What you'll build

1. `POST /api/bug-reports` endpoint that creates a GitHub Issue
2. Frontend modal (same as `web-app-full.md` — user sees no difference)
3. Label `bugkit` applied to every issue so they're filterable
4. "Copy Context for AI" is integrated directly into the issue body (see below)
5. Admin workflow: GitHub's own Issues UI

---

## The trick: bake the AI context into the issue body

Since there's no admin UI to add a "Copy Context" button later, **write the AI context into the issue body at creation time** inside a collapsible `<details>` block. Admins click to expand, copy, paste into Claude.

Issue body template:

```markdown
**Reporter:** @{reporter.name}
**Type:** {type}
**Page:** {page.url}
**Viewport:** {viewport}

## Description
{description}

<details>
<summary>🤖 Copy this into Claude Code</summary>

```
=== BUG REPORT #{issue_number} ===
Type: {type}
Status: open
Reported: {created_at} by @{reporter.name}

## Description
{description}

## Page
URL: {page.url}
Viewport: {viewport}
User Agent: {user_agent}

## Selected Element
Selector: {element.selector}
XPath: {element.xpath}
Tag: {element.tag}
Visible text: {element.text}
HTML:
{element.html}

## Instructions
{Fix this bug | Implement this feature}. When done:
1. Summarize root cause and files changed.
2. Provide a short "how to verify" note.
3. Close this issue with a comment using `/resolved <commit-sha>` or via:
   gh issue close {issue_number} --comment "<short note>"
   (Or `/wontfix <reason>` to refuse.)
```

</details>
```

**Note:** The `#{issue_number}` goes in AFTER GitHub assigns the number on creation. Easiest: create the issue with a placeholder `#PENDING`, then immediately edit the body substituting the real number. Or use the returned `issue.number` to construct a second request.

---

## Status in GitHub terms

GitHub Issues only have `open` and `closed`. Map bugkit statuses to GitHub labels:

| bugkit status | GitHub state | Label |
|---|---|---|
| open | open | `bugkit` |
| in_progress | open | `bugkit`, `in-progress` |
| resolved | closed | `bugkit`, `resolved` |
| closed | closed | `bugkit` |
| wontfix | closed | `bugkit`, `wontfix` |

Create these labels once during install.

---

## Implementation sketch (Node)

```ts
import { Octokit } from '@octokit/rest'
const gh = new Octokit({ auth: process.env.GITHUB_TOKEN })

export async function createBugReport(input: BugReportInput) {
  const issue = await gh.issues.create({
    owner: process.env.GITHUB_OWNER!,
    repo: process.env.GITHUB_REPO!,
    title: `[${input.type}] ${extractTitle(input.description)}`,
    body: renderIssueBody({ ...input, issue_number: 'PENDING' }),
    labels: ['bugkit', input.type === 'feature' ? 'feature' : 'bug'],
  })

  // Second pass: replace PENDING with real issue number
  await gh.issues.update({
    owner: process.env.GITHUB_OWNER!,
    repo: process.env.GITHUB_REPO!,
    issue_number: issue.data.number,
    body: issue.data.body!.replace(/#PENDING/g, `#${issue.data.number}`),
  })

  return { id: issue.data.number, url: issue.data.html_url }
}
```

---

## Closing the loop

Admin workflow:
1. Triage in github.com → expand `🤖 Copy this into Claude Code` details → copy → paste into Claude Code
2. Claude fixes, commits, references the issue (`Fixes #42`)
3. Merging the PR auto-closes the issue
4. Reporter is notified by GitHub (they're subscribed automatically as the issue author)

Notifications are free — GitHub handles them.

---

## Voice transcription (optional)

The frontend modal is identical to the full web-app recipe. To add voice — Web Speech API default, local Whisper opt-in — follow the "Voice transcription (optional)" section in [`web-app-full.md`](./web-app-full.md). No backend changes needed; the description just arrives pre-populated from the mic.

---

## Acceptance checklist

- [ ] Submitting a report creates an issue with `bugkit` label
- [ ] Issue title has `[bug]` or `[feature]` prefix
- [ ] Issue body has the `<details>` block with the AI context, and `#{issue_number}` has been replaced with the real number
- [ ] Labels `bugkit`, `bug`, `feature`, `resolved`, `wontfix`, `in-progress` all exist in the repo
- [ ] Reporter can open the issue on github.com and see it
