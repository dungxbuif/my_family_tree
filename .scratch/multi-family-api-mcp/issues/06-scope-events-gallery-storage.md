# 06: Cô lập Event, Gallery và Storage theo Family Tree

**What to build:** Làm cho Event, Gallery và uploaded media chỉ có thể được tạo, xem và xóa trong Family Tree hiện tại.

**Blocked by:** 03: Tạo và chuyển Family Tree trên mobile

**Status:** ready-for-agent

- [ ] Event CRUD luôn filter và authorize bằng Family Tree hiện tại.
- [ ] Gallery metadata và object storage key mang tree ownership rõ ràng.
- [ ] URL, object key hoặc record ID của tree khác không thể đọc/xóa qua proxy hay presign route.
- [ ] Response/cache policy không biến media riêng tư thành public cross-tree resource.
- [ ] Gallery/Event UI giữ layout mobile-first và permission states đúng role.

