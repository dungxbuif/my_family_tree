# Dùng khóa API với cây gia phả

## Tạo, lưu và thu hồi khóa

Mở **Tài khoản → Khóa API** trong tài khoản đang hoạt động. Mỗi khóa mang quyền của tài khoản tạo khóa trong từng cây. Chọn tên dễ nhận biết, các quyền cần dùng và thời điểm hết hạn nếu muốn. Biểu mẫu nhận thời điểm theo múi giờ của thiết bị. Danh sách hiển thị theo giờ Việt Nam.

Sau khi chọn **Tạo khóa**, sao chép toàn bộ giá trị vào nơi lưu bí mật của tác nhân rồi chọn **Đã lưu khóa**. Ứng dụng chỉ hiển thị giá trị đầy đủ trong lần tạo. Danh sách sau đó hiển thị tiền tố công khai, quyền, hạn dùng, trạng thái và lần sử dụng gần nhất. Nếu đóng trang quá sớm hoặc mất kết nối khi tạo, kiểm tra danh sách, thu hồi khóa vừa tạo và tạo khóa mới. Để thay khóa đang sử dụng, tạo khóa mới, đổi thông tin xác thực của tác nhân rồi chọn **Thu hồi → Xác nhận thu hồi** trên khóa cũ.

| Quyền của khóa | Thao tác | Vai trò trong cây |
| --- | --- | --- |
| `read` | Liệt kê cây, đọc danh sách và từng hồ sơ | Chủ sở hữu, người chỉnh sửa hoặc người xem |
| `write` | Tạo và cập nhật hồ sơ | Chủ sở hữu hoặc người chỉnh sửa |
| `private` | Đọc hoặc ghi email, số điện thoại, nghề nghiệp, nơi ở | Chủ sở hữu, kèm `read` để đọc hoặc `write` để ghi |
| `delete` | Xóa hồ sơ | Chủ sở hữu hoặc người chỉnh sửa |

Ứng dụng kiểm tra trạng thái tài khoản và vai trò ở từng yêu cầu. Hạ quyền hoặc xóa quyền truy cập cây có hiệu lực với khóa hiện tại. Super Admin cũng cần có quyền trong cây.

## Gọi REST

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
| PATCH | `/api/v1/persons/<id>?familyTreeId=<tree-id>` | Chỉ cập nhật các trường đã gửi, trả 200 và ID |
| DELETE | `/api/v1/persons/<id>?familyTreeId=<tree-id>` | Xóa hồ sơ, trả 200 và ID. Cần gỡ Person Link và các quan hệ trước khi xóa |

Cả hai danh sách nhận `limit` từ 1 đến 100, mặc định 50, và `offset` từ 0, mặc định 0. Trang tiếp theo dùng `offset` tăng bằng số mục đã nhận. Kết thúc khi nhận được ít hơn `limit` mục. Thay đổi đồng thời trong cây có thể làm dịch chuyển vị trí trong danh sách.

Gửi JSON với `Content-Type: application/json`, tối đa 64 KiB cho mỗi thân yêu cầu. Ví dụ tạo hồ sơ với năm sinh và tình trạng sống chưa rõ.

```json
{"full_name":"Nguyễn An","birth_year":1950,"is_deceased":null}
```

- `full_name` bắt buộc khi tạo. Các trường văn bản khác gồm `other_names`, `note`, `avatar_url` và `gender` (`male`, `female`, `other`). Ảnh đại diện phải là ảnh đã tải lên và thuộc cây.
- Các thành phần ngày nhận số nguyên hoặc `null` để bỏ trống. Dùng `birth_year/month/day`, `death_year/month/day` hoặc `death_lunar_year/month/day`, chẳng hạn `birth_month`. Cặp năm/tháng được giữ nguyên độ chính xác khi chưa biết ngày.
- `is_deceased` nhận `true`, `false`, `null`. `is_in_law` nhận boolean. `birth_order` và `generation` nhận số nguyên hoặc `null`.
- Gửi `email`, `phone_number`, `occupation`, `current_residence` ở cấp ngoài của JSON để cập nhật thông tin riêng tư. Email khớp chính xác có thể thiết lập Person Link theo quy tắc của cây. Liên kết đã tồn tại được giữ theo ID tài khoản.

Lỗi trả về dạng `{"code":"FORBIDDEN","message":"Từ chối truy cập.","requestId":"…"}`. Dùng `requestId` khi báo lỗi và giữ kín khóa. Mã trạng thái gồm 400 `INVALID_INPUT`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT` và 500 `INTERNAL_ERROR`. Khóa hết hạn, thu hồi, sai hoặc thuộc tài khoản bị khóa/xóa đều trả 401.

## Vận hành

Chạy migration theo đường dẫn phát hành hiện tại qua `docs/schema.sql`. Migration tạo `api_keys` và `api_audit_logs` trong một giao dịch có khóa và có thể chạy lại. Cơ sở dữ liệu giữ SHA-256 của toàn bộ khóa và tiền tố công khai. Nhật ký giữ ID khóa, người dùng, cây, tài nguyên, thao tác, kết quả, thời gian và kênh truy cập. Các ID lịch sử vẫn tra cứu được sau khi tài khoản hoặc cây bị xóa.

Trong production, đặt máy chủ ứng dụng phía sau ingress kết thúc TLS, chặn kết nối trực tiếp từ mạng khách và cấu hình ingress **ghi đè** `X-Forwarded-Proto` từ giao thức kết nối thực. Sau đó đặt `AGENT_TRUST_TLS_PROXY=1` cho tiến trình ứng dụng. Yêu cầu HTTP hoặc header có nhiều giá trị bị từ chối. Cấu hình nhật ký ingress để loại bỏ header Authorization, thân yêu cầu và phản hồi chứa khóa. Chỉ truyền khóa bằng header.
