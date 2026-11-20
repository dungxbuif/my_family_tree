# 10: Production cutover, tài liệu và mobile regression

**What to build:** Chứng minh toàn bộ multi-family/API/MCP release có thể migrate production an toàn, có tài liệu cho người và agent, và không regression trên mobile hoặc desktop.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09

**Status:** ready-for-agent

- [ ] Migration rehearsal trên production-shaped copy/fixture ghi nhận row counts, role mappings, relationships và access trước/sau.
- [ ] Runbook mô tả preflight, backup, deployment, verification và rollback bằng credential placeholders.
- [ ] Human API/MCP docs, OpenAPI và llms surfaces khớp route/tool/scopes đã ship.
- [ ] Full tests, migration smoke, lint và production build pass.
- [ ] Visual/accessibility checks pass tại 320×568, 430×932 và desktop, không horizontal overflow hoặc obscured actions.
- [ ] Security search không còn public signup/about, unscoped family query, plaintext key, email enumeration hoặc global-role tree bypass.
