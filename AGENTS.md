# Ordio Backend — Codex Instructions

After completing any backend implementation or bug fix, use the
ordio-task-verifier skill located at:
.agents/skills/ordio-task-verifier/SKILL.md

Run its relevant post-task checks automatically before reporting
implementation complete. Follow its production, secrets, database,
and generated dist safety restrictions.

For read-only audits, explanations, or planning-only tasks, do not
run implementation verification unless explicitly requested.

Do not commit, push, deploy, or execute database migrations without
the user's explicit authorization.

Preserve existing user changes. Keep verification proportional to
the task and report checks that could not be executed.
