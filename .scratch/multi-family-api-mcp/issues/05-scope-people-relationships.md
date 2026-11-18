# 05: Cô lập Person và Relationship theo Family Tree

**What to build:** Làm cho toàn bộ luồng Person, private details và Relationship hoạt động end-to-end trong Family Tree hiện tại và không thể đọc hoặc sửa record của tree khác.

**Blocked by:** 03: Tạo và chuyển Family Tree trên mobile; 04: Thêm quyền bằng exact email và link Person–User

**Status:** ready-for-agent

- [ ] List, search, selector, detail, create, update và delete Person luôn scope theo tree đã xác thực.
- [ ] Private details chỉ hiện cho role/permission phù hợp và không rò rỉ qua object ID khác tree.
- [ ] Relationship create/delete và lineage updates từ chối Person thuộc tree khác.
- [ ] Editor có thể sửa, Viewer chỉ xem và Owner giữ toàn quyền dữ liệu.
- [ ] Hai trees có dữ liệu trùng tên/ID thử nghiệm vẫn hoàn toàn cô lập trong UI và server actions.

