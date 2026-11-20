# 04: Thêm quyền bằng exact email và link Person–User

**What to build:** Cho phép Owner thêm một System User hiện có bằng email đầy đủ, quản lý owner/editor/viewer và liên kết tài khoản đó với đúng một Person trong Family Tree.

**Blocked by:** 01: Khóa đăng ký và bảo vệ quản trị tài khoản; 03: Tạo và chuyển Family Tree trên mobile

**Status:** ready-for-agent

- [ ] Email được trim/lower-normalize; không có search, autocomplete hoặc account listing.
- [ ] Partial/unknown email không tiết lộ account candidates hoặc trạng thái chi tiết.
- [ ] Owner có thể cấp owner/editor/viewer; editor/viewer không thể thay membership.
- [ ] Owner cuối cùng không thể bị xóa, rời tree hoặc hạ quyền, kể cả hai request đồng thời.
- [ ] Link một user chưa có membership tự tạo viewer membership.
- [ ] Auto-link chỉ áp dụng cho Person chưa liên kết; link hiện có không bị thay thế khi email đổi.

