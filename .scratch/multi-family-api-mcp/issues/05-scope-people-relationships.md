# 05: Cô lập Person và Relationship theo Family Tree

**What to build:** Làm cho toàn bộ luồng Person, private details và Relationship hoạt động end-to-end trong Family Tree hiện tại, bao gồm thêm Person ngay trên view cây, và không thể đọc hoặc sửa record của tree khác.

**Blocked by:** 03: Tạo và chuyển Family Tree trên mobile; 04: Thêm quyền bằng exact email và link Person–User

**Status:** ready-for-agent

- [ ] List, search, selector, detail, create, update và delete Person luôn scope theo tree đã xác thực.
- [ ] Private details chỉ hiện cho role/permission phù hợp và không rò rỉ qua object ID khác tree.
- [ ] Relationship create/delete và lineage updates từ chối Person thuộc tree khác.
- [ ] Editor có thể sửa, Viewer chỉ xem và Owner giữ toàn quyền dữ liệu.
- [ ] Hai trees có dữ liệu trùng tên/ID thử nghiệm vẫn hoàn toàn cô lập trong UI và server actions.
- [ ] Editor/Owner có nút “Thêm thành viên” ngay trong Family Tree view; Viewer không có mutation action và gọi trực tiếp vẫn bị từ chối.
- [ ] Khi một node đang được chọn, form mang Person đó làm context và cho lưu relationship hợp lệ cùng Person mới; không chọn node thì tạo Person chưa nối.
- [ ] Sau khi lưu, graph refresh và focus Person mới; cancel giữ nguyên focus/zoom/pan trước đó.
- [ ] Mobile form dùng bottom sheet hoặc full-screen layout theo Heritage Modern, không che action cuối, không overflow tại 320×568 và 430×932.

