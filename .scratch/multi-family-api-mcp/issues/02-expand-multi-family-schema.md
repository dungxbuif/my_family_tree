# 02: Mở rộng schema và backfill production sang Family Tree

**What to build:** Mở rộng database để mọi dữ liệu gia phả thuộc một Family Tree, đồng thời chuyển toàn bộ dữ liệu production hiện có vào legacy tree mà không làm thay đổi hành vi người dùng hiện tại.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Migration transactionally tạo legacy tree, Tree Membership và backfill toàn bộ dữ liệu/quyền hiện có.
- [ ] Migration chạy lại an toàn, giữ nguyên row counts và không tạo legacy tree trên database thực sự trống.
- [ ] Preflight chặn normalized-email collision, orphan reference và dữ liệu không thể backfill trước khi mutation.
- [ ] Database từ chối cross-tree Relationship, Person Link trùng và mất Owner cuối cùng.
- [ ] Production deploy contract có entry point migration, backup, verification và rollback rõ ràng.

