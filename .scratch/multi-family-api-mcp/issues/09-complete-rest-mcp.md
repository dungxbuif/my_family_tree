# 09: Hoàn thiện REST và MCP cho toàn bộ Family Tree

**What to build:** Mở rộng shared family service sang Relationships, Events, Gallery, Stats và Export, rồi cung cấp cùng capability qua REST và stateless MCP.

**Blocked by:** 06: Cô lập Event, Gallery và Storage theo Family Tree; 07: Cô lập Import/Export, Stats, Lineage và Kinship; 08: Agent Credential và REST tracer bullet

**Status:** ready-for-agent

- [ ] REST collections được bound/paginate và có stable JSON error codes/request IDs.
- [ ] MCP client thực initialize, list tools và call tools thành công qua Streamable HTTP.
- [ ] Mỗi tool nhận Family Tree ID nhưng server tự resolve key owner và current membership.
- [ ] Read/private/write/delete scopes giao với role hiện tại; annotations không thay thế authorization.
- [ ] MCP/REST không nhận base64 image và không expose account/key management.
- [ ] Host/Origin validation, safe errors và payload limits được kiểm thử.

