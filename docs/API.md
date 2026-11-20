# Dùng khóa API với cây gia phả

## Tạo, lưu và thu hồi khóa

Mở **Tài khoản → Khóa API** trong tài khoản đang hoạt động. Mỗi khóa mang quyền của tài khoản tạo khóa trong từng cây. Chọn tên dễ nhận biết, các quyền cần dùng và thời điểm hết hạn nếu muốn. Biểu mẫu nhận thời điểm theo múi giờ của thiết bị. Danh sách hiển thị theo giờ Việt Nam. Dùng **Trang trước** và **Trang sau** để duyệt mỗi lần tối đa 20 khóa, kể cả khóa đã thu hồi.

Sau khi chọn **Tạo khóa**, sao chép toàn bộ giá trị vào nơi lưu bí mật của tác nhân rồi chọn **Đã lưu khóa**. Ứng dụng chỉ hiển thị giá trị đầy đủ trong lần tạo. Danh sách sau đó hiển thị tiền tố công khai, quyền, hạn dùng, trạng thái và lần sử dụng gần nhất. Nếu đóng trang quá sớm hoặc mất kết nối khi tạo, kiểm tra danh sách, thu hồi khóa vừa tạo và tạo khóa mới. Để thay khóa đang sử dụng, tạo khóa mới, đổi thông tin xác thực của tác nhân rồi chọn **Thu hồi → Xác nhận thu hồi** trên khóa cũ.

| Quyền của khóa | Thao tác | Vai trò trong cây |
| --- | --- | --- |
| `read` | Liệt kê cây, đọc hồ sơ, quan hệ, sự kiện, thư viện ảnh và thống kê | Chủ sở hữu, người chỉnh sửa hoặc người xem |
| `write` | Tạo hồ sơ, quan hệ, sự kiện, ảnh và cập nhật hồ sơ, sự kiện | Chủ sở hữu hoặc người chỉnh sửa |
| `private` | Đọc hoặc ghi email, số điện thoại, nghề nghiệp, nơi ở | Chủ sở hữu, kèm `read` để đọc hoặc `write` để ghi |
| `delete` | Xóa hồ sơ, quan hệ, sự kiện và mục thư viện ảnh | Chủ sở hữu hoặc người chỉnh sửa |

Ứng dụng kiểm tra trạng thái tài khoản và vai trò ở từng yêu cầu. Hạ quyền hoặc xóa quyền truy cập cây có hiệu lực với khóa hiện tại. Super Admin cũng cần có quyền trong cây.

Để dùng cùng khóa qua một trình khách MCP, xem [hướng dẫn kết nối MCP](MCP.md).

## Gọi REST

Trên cùng máy chủ, `/api/openapi.json` cung cấp mô tả OpenAPI 3.1 của 18 thao tác REST. Tác nhân có thể đọc `/llms.txt` để tìm endpoint MCP, quyền và giới hạn. Hai tài liệu này cho phép truy cập ẩn danh. Mọi yêu cầu dữ liệu cần khóa.

Gửi khóa trong header `Authorization: Bearer <khóa>` qua HTTPS. Ví dụ sau đọc biến môi trường do trình quản lý bí mật cung cấp. Thay tên miền bằng máy chủ của bạn.

```sh
curl --fail-with-body \
  -H "Authorization: Bearer ${FAMILY_API_KEY}" \
  'https://family.example/api/v1/family-trees?limit=10'
```

| Phương thức | Đường dẫn | Kết quả |
| --- | --- | --- |
| GET | `/api/v1/family-trees` | `data` là danh sách cây đang truy cập được, mỗi cây có `id`, `name`, `role` |
| GET | `/api/v1/persons?familyTreeId=<tree-id>` | `data` là danh sách hồ sơ với các trường công khai |
| GET | `/api/v1/persons/<id>?familyTreeId=<tree-id>` | `data` là một hồ sơ. Chủ sở hữu có quyền `private` nhận thêm `email` và `privateData` |
| POST | `/api/v1/persons?familyTreeId=<tree-id>` | Tạo hồ sơ, trả 201 và `{"data":{"id":"…"}}` |
| PATCH | `/api/v1/persons/<id>?familyTreeId=<tree-id>` | Cập nhật một phần hồ sơ, trả 200 và ID. Sửa ngày có thể chuẩn hóa tháng âm lịch cũ như mô tả bên dưới |
| DELETE | `/api/v1/persons/<id>?familyTreeId=<tree-id>` | Xóa hồ sơ, trả 200 và ID. Cần gỡ Person Link và các quan hệ trước khi xóa |
| GET, POST | `/api/v1/relationships?familyTreeId=<tree-id>` | Liệt kê hoặc tạo quan hệ |
| DELETE | `/api/v1/relationships/<id>?familyTreeId=<tree-id>` | Gỡ quan hệ |
| GET, POST | `/api/v1/events?familyTreeId=<tree-id>` | Liệt kê hoặc tạo sự kiện tùy chỉnh |
| PATCH, DELETE | `/api/v1/events/<id>?familyTreeId=<tree-id>` | Cập nhật các trường đã gửi hoặc xóa sự kiện |
| GET, POST | `/api/v1/gallery?familyTreeId=<tree-id>` | Liệt kê hoặc thêm thông tin ảnh đã tải lên |
| DELETE | `/api/v1/gallery/<id>?familyTreeId=<tree-id>` | Gỡ mục khỏi thư viện |
| GET | `/api/v1/stats?familyTreeId=<tree-id>` | Số lượng `persons`, `relationships`, `events`, `gallery` trong cây |
| GET | `/api/v1/export?familyTreeId=<tree-id>` | Bản sao lưu JSON phiên bản 4, gồm trường riêng tư. Cần vai trò Chủ sở hữu và cả hai quyền `read`, `private` |

Mỗi phản hồi dữ liệu có giới hạn 1 MiB JSON, kể cả trường `data`. Trang chứa dữ liệu cũ quá lớn trả 400 `INVALID_INPUT` kèm `requestId`. Khi đó hãy giảm `limit`. Nếu một bản ghi vượt giới hạn, xem bản ghi trong giao diện cây.

Mỗi danh sách nhận `limit` từ 1 đến 100, mặc định 50, và `offset` từ 0, mặc định 0. Trang tiếp theo dùng `offset` tăng bằng số mục đã nhận. Kết thúc khi nhận được ít hơn `limit` mục. Thay đổi đồng thời trong cây có thể làm dịch chuyển vị trí trong danh sách.

Gửi JSON với `Content-Type: application/json`, tối đa 64 KiB cho mỗi thân yêu cầu. Ví dụ tạo hồ sơ với năm sinh và tình trạng sống chưa rõ.

```json
{"full_name":"Nguyễn An","birth_year":1950,"is_deceased":null}
```

- `full_name` bắt buộc khi tạo. Các trường văn bản khác gồm `other_names`, `note`, `avatar_url` và `gender` (`male`, `female`, `other`). Ảnh đại diện phải là ảnh đã tải lên và thuộc cây.
- Các thành phần ngày có thể bỏ qua hoặc nhận `null`. Năm nhận số nguyên từ 1 đến 9999. Tháng dương lịch nhận 1–12, ngày nhận 1–31 tùy tháng và năm nhuận. Tháng âm lịch nhận 1–12 cho tháng thường hoặc −1 đến −12 cho tháng nhuận, ngày nhận 1–30. Dùng `birth_year/month/day`, `death_year/month/day` hoặc `death_lunar_year/month/day`, chẳng hạn `birth_month`. Máy chủ kiểm tra ngày âm lịch đầy đủ theo lịch thực tế và thứ tự ngày sinh, ngày mất theo độ chính xác đã biết.
- Khi PATCH một thành phần ngày, máy chủ kiểm tra ngày sau khi ghép với hồ sơ hiện tại. Nếu ngày mất dương lịch đầy đủ xác nhận tháng nhuận tương ứng với ngày âm lịch đã lưu, máy chủ đổi `death_lunar_month` cũ từ số dương sang số âm, kể cả khi yêu cầu bỏ qua trường này.
- `is_deceased` nhận `true`, `false`, `null`. `is_in_law` nhận boolean. `birth_order` và `generation` nhận số nguyên hoặc `null`.
- Gửi `email`, `phone_number`, `occupation`, `current_residence` ở cấp ngoài của JSON để cập nhật thông tin riêng tư. Email khớp chính xác có thể thiết lập Person Link theo quy tắc của cây. Liên kết đã tồn tại được giữ theo ID tài khoản.

### Nội dung của các yêu cầu ghi

| Tài nguyên | Trường bắt buộc khi tạo | Trường khác |
| --- | --- | --- |
| Quan hệ | `person_a`, `person_b`, `type` | `note` |
| Sự kiện | `name`, `event_date` (ngày dương lịch `YYYY-MM-DD`) | `location`, `content` |
| Thư viện | `title`, `image_url` | `description`, `event_date` |

Khi cập nhật sự kiện, máy chủ ghép các trường đã gửi vào bản ghi hiện tại rồi lưu. Bước lưu chuẩn hóa tên bằng cách bỏ khoảng trắng hai đầu và chuyển chuỗi rỗng của `location`, `content` thành `null`. Quy tắc này áp dụng cả cho giá trị cũ khi bỏ qua trường đó trong PATCH.

Quan hệ nhận `marriage`, `biological_child` hoặc `adopted_child`. Với quan hệ cha mẹ và con, `person_a` là cha/mẹ. Cả hai ID phải thuộc cây đang thao tác. Quan hệ trùng lặp hoặc tạo vòng lặp trả 409.

Tên, tên khác, nghề nghiệp, nơi ở và địa điểm tối đa 500 ký tự. Giới hạn của email là 320, số điện thoại 100, URL ảnh 2048, ghi chú, mô tả và nội dung sự kiện 8192. Ảnh cần đường dẫn `/api/storage/…` của ảnh đã tải lên bằng ứng dụng, thuộc đúng cây và đúng thư mục. Dữ liệu base64 hoặc URL ngoài trả 400.

Mỗi POST thành công trả 201, PATCH và DELETE trả 200 với `{"data":{"id":"…"}}`. Bản xuất chứa tối đa 100 bản ghi mỗi bảng và tối đa 1 MiB JSON. Nếu vượt giới hạn, yêu cầu trả 400. Chủ sở hữu có thể dùng công cụ sao lưu trong giao diện để xuất cây lớn hơn.

Lỗi trả về dạng `{"code":"FORBIDDEN","message":"Từ chối truy cập.","requestId":"…"}`. Dùng `requestId` khi báo lỗi và giữ kín khóa. Mã trạng thái gồm 400 `INVALID_INPUT`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT` và 500 `INTERNAL_ERROR`. Khóa hết hạn, thu hồi, sai hoặc thuộc tài khoản bị khóa/xóa đều trả 401.

## Vận hành

Chạy migration theo đường dẫn phát hành hiện tại qua `docs/schema.sql`. Migration tạo `api_keys` và `api_audit_logs` trong một giao dịch có khóa và có thể chạy lại. Cơ sở dữ liệu giữ SHA-256 của toàn bộ khóa và tiền tố công khai. Nhật ký giữ ID khóa, người dùng, cây, tài nguyên, thao tác, kết quả, thời gian và kênh truy cập. Các ID lịch sử vẫn tra cứu được sau khi tài khoản hoặc cây bị xóa.

Mọi môi trường đều yêu cầu HTTPS cho Bearer, kể cả phát triển và kiểm thử. Với proxy kết thúc TLS, chỉ bật `AGENT_TRUST_TLS_PROXY=1` khi cổng Next chỉ có thể được truy cập từ các máy và tiến trình đáng tin cậy. Ingress phải **ghi đè** `X-Forwarded-Proto` từ kết nối thực và chỉ chuyển tiếp lưu lượng HTTPS đến ứng dụng. Cấu hình nhật ký ingress để loại bỏ header Authorization, thân yêu cầu và phản hồi chứa khóa. Chỉ truyền khóa bằng header.

- Compose gắn cổng ứng dụng vào IPv4 loopback. Chạy proxy TLS trên máy chủ đó hoặc trong mạng backend riêng. Khi chạy Next trực tiếp để phát triển qua proxy, dùng `bun run dev --hostname 127.0.0.1` để giới hạn cổng backend. Các tiến trình trên máy chủ và các container cùng mạng phải đáng tin cậy. Với mạng dùng chung có tiến trình không đáng tin cậy, cô lập backend trước khi bật chế độ tin cậy.
- Trên Swarm, chỉ Traefik trên Pi5 và Family Tree dùng overlay riêng `family-ingress-net`. Route TLS `family.dungxbuif.com` chuyển tới `tasks.family-tree.family-ingress-net:3000`. Ứng dụng chỉ có thêm mạng dữ liệu riêng với PgBouncer. Ops kiểm tra các tiến trình đang kết nối, cấu hình dịch vụ Swarm và cả hai trạng thái cổng publish trước khi bật chế độ tin cậy. Trong bước chuyển tiếp khi mạng ingress cũ còn gắn vào ứng dụng, chế độ tin cậy phải tắt. Chỉ pipeline ops được triển khai Family Tree.
- Thời điểm “Dùng lần cuối” là lúc một yêu cầu được xác thực, kể cả khi thiếu quyền, sai dữ liệu hoặc không tìm thấy hồ sơ. Ghi nhận gộp tối đa một lần mỗi phút cho mỗi khóa. Khi hết kết nối rảnh, tranh chấp với yêu cầu thu hồi hoặc lỗi cơ sở dữ liệu, việc bỏ qua cập nhật có thể làm thời điểm hiển thị cũ hơn. Khi thu hồi hoàn tất, các thao tác đã được chấp nhận trước đó đã kết thúc và yêu cầu mới dùng khóa sẽ nhận 401.
