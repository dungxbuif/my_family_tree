# 07: Cô lập Import/Export, Stats, Lineage và Kinship

**What to build:** Hoàn thiện các công cụ dữ liệu phụ trợ để chỉ xử lý Family Tree hiện tại, bao gồm import transactional không ảnh hưởng tree khác.

**Blocked by:** 05: Cô lập Person và Relationship theo Family Tree; 06: Cô lập Event, Gallery và Storage theo Family Tree

**Status:** ready-for-agent

- [ ] Import chỉ xóa/thay dữ liệu của target tree, chạy trong transaction và rollback toàn bộ khi lỗi.
- [ ] UUID/import references va chạm tree khác được remap hoặc từ chối an toàn.
- [ ] Export không chứa record, private detail hoặc storage reference của tree khác.
- [ ] Stats, lineage, kinship và generation calculations chỉ dùng target tree.
- [ ] User không đủ role không thể import hoặc chạy mutation hàng loạt.

