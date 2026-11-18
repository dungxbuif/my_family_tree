# 08: Agent Credential và REST tracer bullet

**What to build:** Cho phép System User quản lý Agent Credential của chính mình và dùng credential đó để list Family Trees cùng CRUD Person qua REST với đúng quyền hiện tại.

**Blocked by:** 05: Cô lập Person và Relationship theo Family Tree

**Status:** ready-for-agent

- [ ] Secret có entropy mạnh, chỉ hiển thị một lần và database chỉ giữ hash cùng public prefix.
- [ ] User tạo/list/revoke key của chính mình; key hết hạn, revoked hoặc owner bị suspended trả 401.
- [ ] REST list accessible Family Trees và CRUD Person yêu cầu cả key scope lẫn current Tree Membership.
- [ ] Membership bị xóa/hạ quyền có hiệu lực ngay mà không cần rotate key.
- [ ] UI key management responsive, wrap secret/email và có copy/revoke controls dễ dùng trên mobile.
- [ ] Audit mutation không chứa plaintext key hoặc private payload.

