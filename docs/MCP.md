# Kết nối tác nhân với cây gia phả qua MCP

Đặt địa chỉ máy chủ MCP thành `https://family.example/api/mcp`, chọn Streamable HTTP và gửi khóa của tài khoản trong header `Authorization: Bearer <khóa>`. Thay tên miền bằng địa chỉ triển khai. Tạo và thu hồi khóa trong **Tài khoản → Khóa API**. [Hướng dẫn về quyền và khóa API](API.md)

Máy chủ xử lý từng POST độc lập. Giao thức 2025 dùng `initialize`, giao thức 2026-07-28 dùng `server/discover`. GET và DELETE tại endpoint trả 405 với `Allow: POST`. Khóa đã bị thu hồi, hết hạn hoặc thuộc tài khoản không hoạt động trả 401, kể cả khi tác nhân đang kết nối.

## Chọn cây và gọi công cụ

Đọc `/llms.txt` trên cùng máy chủ để xem nhanh danh mục 18 công cụ và giới hạn. Tài liệu OpenAPI tại `/api/openapi.json` mô tả các trường dùng chung với REST. Máy chủ cho phép đọc hai tài liệu này trước khi tạo khóa. Khám phá công cụ qua giao thức MCP cần khóa còn hiệu lực.

Gọi `list_family_trees` với `{"limit":10}`. Chọn một `id` từ kết quả, rồi truyền nó qua `familyTreeId` trong **từng** lệnh thao tác dữ liệu. Ví dụ sử dụng SDK TypeScript chính thức phiên bản 2.4.0 với Node 20 trở lên.

```ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const client = new Client({ name: "family-reader", version: "1.0.0" });
const url = new URL("https://family.example/api/mcp");
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${process.env.FAMILY_API_KEY}` } },
});
await client.connect(transport);
try {
  const trees = await client.callTool({ name: "list_family_trees", arguments: { limit: 10 } });
  console.log(trees.content);
  // FAMILY_TREE_ID là ID người vận hành đã chọn từ danh sách cây.
  const people = await client.callTool({
    name: "list_people",
    arguments: { familyTreeId: process.env.FAMILY_TREE_ID, limit: 20 },
  });
  console.log(people.content);
} finally {
  await client.close();
}
```

| Công cụ | Đầu vào ngoài `familyTreeId` | Quyền của khóa |
| --- | --- | --- |
| `list_family_trees` | Không cần ID cây. Có thể gửi `limit` và `offset` | `read` |
| `list_people`, `list_relationships`, `list_events`, `list_gallery` | `limit`, `offset` tùy chọn | `read` |
| `get_person` | `id` | `read`. Chi tiết riêng tư cần thêm `private` và vai trò Chủ sở hữu |
| `get_family_stats` | — | `read` |
| `create_person`, `create_relationship`, `create_event`, `create_gallery_item` | `body` | `write` |
| `update_person`, `update_event` | `id` và `body` chứa các trường cần sửa | `write` |
| `delete_person`, `delete_relationship`, `delete_event`, `delete_gallery_item` | `id` | `delete` |
| `export_family_data` | — | `read`, `private` và vai trò Chủ sở hữu |

Ghi và xóa cần vai trò Chủ sở hữu hoặc Người chỉnh sửa. Ghi chi tiết riêng tư cần Chủ sở hữu với `write` và `private`. Máy chủ kiểm tra quyền hiện tại cho từng lệnh. Các trường của `body` giống REST, ví dụ `{"name":"Họp mặt","event_date":"2026-12-01"}` để tạo sự kiện. [Các trường dữ liệu và quy tắc quan hệ](API.md)

Danh sách mặc định 50 mục, tối đa 100. Dùng `offset` từ 0 để duyệt trang. Bản xuất chứa đầy đủ các bảng của cây, tối đa 100 bản ghi mỗi bảng và 1 MiB. Ảnh gửi qua `image_url` phải là đường dẫn `/api/storage/…` đã được ứng dụng cấp, thuộc thư mục Gallery của cây và đã tải lên thành công. Mỗi POST chứa một đối tượng JSON, tối đa 4 MiB.

`update_event` ghép thay đổi với sự kiện hiện tại. Khi lưu, tên được bỏ khoảng trắng hai đầu và chuỗi rỗng trong `location`, `content` được chuyển thành `null`, kể cả giá trị cũ của trường được bỏ qua.

Mỗi lần gọi công cụ nhận tối đa 100 trường và phần tử mảng, tính cả các cấp lồng nhau. Phần JSON chứa dữ liệu kết quả có giới hạn 1 MiB trước khi SDK đóng gói nội dung văn bản và dữ liệu có cấu trúc. Nếu một trang dữ liệu lớn trả `INVALID_INPUT`, giảm `limit`. Nếu chỉ một hồ sơ đã vượt giới hạn, xem hồ sơ đó trong ứng dụng. Danh mục công cụ cố định trong suốt kết nối.

Kết quả thành công gồm `structuredContent.data` và nội dung văn bản JSON tương ứng. Kiểm tra `isError` khi gọi công cụ. Lỗi ứng dụng gồm `code`, `message` và `requestId`. Khi cần hỗ trợ, gửi mã yêu cầu và tên công cụ. Giữ kín khóa và thông tin riêng tư trong phản hồi.

## Cấu hình máy chủ

Đặt `MCP_ALLOWED_ORIGINS=https://family.example` trong môi trường chạy ứng dụng. Nhiều tên miền phân cách bằng dấu phẩy. Mỗi giá trị là origin HTTPS chuẩn, gồm cổng nếu khác 443, không kèm đường dẫn hoặc dấu gạch chéo cuối. Danh sách trống từ chối mọi POST với mã 403.

Proxy phải giữ nguyên `Host` công khai. Nếu trình khách gửi `Origin`, giá trị phải đúng origin tương ứng với Host đó. Yêu cầu từ tác nhân ngoài trình duyệt có thể bỏ `Origin`. Khi proxy kết thúc TLS, áp dụng cấu hình ingress riêng và `AGENT_TRUST_TLS_PROXY` đã mô tả trong [hướng dẫn vận hành API](API.md#vận-hành).

SDK chính thức dùng cùng Web-standard handler cho hai phiên bản giao thức. [Tài liệu SDK TypeScript](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard)
