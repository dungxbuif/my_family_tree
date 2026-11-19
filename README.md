<p align="center">
  <img src="public/icon.png" alt="Personal Family Tree Icon" width="100" height="100" style="border-radius: 22%; border: 0.5px solid rgba(0,0,0,0.1);" />
</p>

# Personal Family Tree (Tự Lưu Trữ)

Đây là mã nguồn cho ứng dụng quản lý gia phả dòng họ cá nhân, được thiết kế để tự lưu trữ (self-host) hoàn toàn trên hạ tầng riêng.

Dự án này giúp gia đình bạn nắm trọn quyền kiểm soát dữ liệu nhạy cảm trên máy chủ riêng của mình.

## Các tính năng chính

- **Sơ đồ trực quan**: Xem gia phả dạng Cây (Tree) và Sơ đồ tư duy (Mindmap).
- **Tìm danh xưng**: Tự động xác định cách gọi tên chính xác.
- **Quản lý thành viên**: Lưu trữ thông tin, avatar và sắp xếp thứ tự nhánh dòng họ.
- **Lưu trữ nội bộ**: Tất cả dữ liệu và hình ảnh được lưu trữ trực tiếp trong cơ sở dữ liệu PostgreSQL và hệ thống tệp của bạn.
- **Bảo mật**: Đăng nhập bằng tài khoản do Quản trị viên hệ thống cấp.
- **Sao lưu & Phục hồi**: Xuất/nhập file JSON, CSV, GEDCOM dễ dàng.

## Giao diện responsive

Dashboard dùng cùng một giao diện trên web và mobile. Trên màn hình nhỏ, bốn
chế độ xem thành viên nằm trong thanh điều hướng cố định phía dưới, bộ lọc mở
trong vùng thao tác rộng theo chiều ngang, còn sơ đồ cây hỗ trợ kéo chạm,
phóng to và thu nhỏ trong vùng canvas riêng. Các thẻ thành viên và cửa sổ chi
tiết có vùng chạm tối thiểu 44px, giữ khoảng đệm an toàn trên thiết bị có
notch, và tắt chuyển động không cần thiết khi người dùng bật reduced motion.

Giao diện dùng hệ thống **Heritage Modern**: nền kem ấm, xanh rừng làm màu
thương hiệu và vàng cổ làm điểm nhấn. Tài liệu thiết kế, token máy đọc được,
icon, illustration và mockup tham chiếu được lưu đầy đủ tại
[`docs/design/`](docs/design/README.md).

Ứng dụng không có landing page công khai; truy cập `/` sẽ chuyển thẳng tới
`/login` để người trong gia đình đăng nhập.

## Cài đặt và Chạy dự án

Cách tốt nhất để chạy ứng dụng là sử dụng **Docker Compose**.

### 1. Chuẩn bị
- Đã cài đặt [Docker](https://www.docker.com/) và [Docker Compose](https://docs.docker.com/compose/).
- Tải mã nguồn về máy.

### 2. Cấu hình
Sao chép file `.env.example` thành `.env.local` và điều chỉnh các giá trị nếu cần.
```bash
cp .env.example .env.local
```

### 3. Chạy với Docker
Chỉ cần chạy lệnh sau để khởi động cả ứng dụng và cơ sở dữ liệu PostgreSQL:
```bash
docker-compose up -d
```

Ứng dụng sẽ khả dụng tại: `http://localhost:3000`

### 4. Khởi tạo Database
Lần đầu tiên chạy, bạn cần khởi tạo cấu trúc bảng:
```bash
bash scripts/migrate-local-dev.sh
```

## Đăng nhập và quản lý tài khoản

Trang `/login` dành cho người đã có tài khoản. Quản trị viên hệ thống đang hoạt
động có thể tạo, kích hoạt, khóa hoặc xóa tài khoản trong **Tài khoản → Quản lý
người dùng**. Tài khoản mới được tạo ở trạng thái đang hoạt động theo mặc định.
Khi bị khóa, các phiên đăng nhập hiện tại kết thúc. Người dùng đăng nhập lại
sau khi tài khoản được kích hoạt.

Mỗi tài khoản đang hoạt động mở **Tài khoản → Cây gia phả của tôi** để tạo và
chuyển cây gia phả. Hệ thống tạo cây và cấp quyền Chủ sở hữu cho bạn trong
cùng một giao dịch, sau đó chọn cây mới. Bạn có thể tạo nhiều cây. Danh sách hiển thị
vai trò hiện tại của bạn trong từng cây còn hoạt động. Khi mở lại danh sách,
máy chủ kiểm tra lại quyền trước khi dùng lựa chọn đã lưu trong trình duyệt.
Nếu bạn mất quyền hoặc cây đã lưu trữ, hệ thống chọn cây còn truy cập được tạo
sớm nhất. Khi danh sách trống, bạn có thể tạo cây đầu tiên.

Chức năng chọn cây hiện áp dụng trên trang **Cây gia phả của tôi**. Việc phát
hành đa cây vẫn chờ kiểm thử cách ly dữ liệu trên các màn hình gia đình, chức
năng nhập/xuất và kho lưu trữ.

Quản trị viên hệ thống không thể tự khóa hoặc tự xóa tài khoản đang đăng nhập.
Trước khi xóa tài khoản còn liên kết với hồ sơ thành viên, cần gỡ liên kết.
Nếu tài khoản là Chủ sở hữu duy nhất của một cây gia phả, cần bổ sung Chủ sở hữu
khác trước khi xóa.

Khi nâng cấp, cơ sở dữ liệu giữ quyền Quản trị viên hệ thống cho những tài khoản
Admin đã có. Với cơ sở dữ liệu mới hoặc khi không còn Quản trị viên hệ thống
đang hoạt động, người vận hành khởi tạo tài khoản từ máy quản trị sau khi chạy
migration. [Quy trình khởi tạo Quản trị viên hệ thống](docs/runbooks/bootstrap-super-admin.md)

## Triển khai Homelab

Production chạy dịch vụ Swarm `family-tree` trên VM100 tại
`https://family.dungxbuif.com`. PostgreSQL và RustFS được cấu hình riêng.

1. Trước khi phát hành, xác nhận `homelab-ops` đã có job dành cho Family Tree.
2. Chủ repo tạo một tag được bảo vệ `prod-<semver>` từ `main` của GitLab
   `homelab/my-family-tree`. CI build image `linux/amd64`, kiểm tra `/readyz`,
   đẩy image và ghi digest vào `homelab-ops/main`. CI tạo tag nội bộ
   `my-family-tree-prod-<semver>` để khởi động pipeline triển khai.
3. Kiểm tra job triển khai của `homelab-ops`. Mở `/login`, rồi kiểm tra
   đăng nhập, dữ liệu thành viên và tải ảnh. `/readyz` kiểm tra tiến trình
   Next.js, còn các thao tác sau khi đăng nhập kiểm tra PostgreSQL và RustFS.

Cấu hình runtime cần `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET=family-tree`,
`S3_PREFIX=family-tree` và `S3_REGION=us-east-1`. Production dùng credential riêng
qua `S3_ACCESS_KEY_ID_FILE` và `S3_SECRET_ACCESS_KEY_FILE` trỏ tới Swarm secrets.
Mỗi biến file được ưu tiên hơn biến trực tiếp; file thiếu, rỗng hoặc không đọc
được sẽ báo lỗi. Local có thể dùng `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
khi không đặt biến file. Push/merge `main` không chạy CI; chỉ protected tag
`prod-<semver>` kích hoạt phát hành. Avatar và ảnh thư viện được tải
lên bằng URL ký và phục vụ qua `/api/storage/...`. Nếu còn dữ liệu ảnh cũ
trong `/app/uploads`, giữ bản sao và xác nhận kế hoạch chuyển dữ liệu sang
RustFS trước khi chuyển dịch vụ sang image mới.

[Quy trình phát hành và kiểm tra dữ liệu](docs/deployment/gitlab-homelab-migration.md)

## Phân quyền người dùng

Quản trị viên hệ thống quản lý vòng đời tài khoản. Quyền truy cập dữ liệu gia
phả do tư cách thành viên trong từng cây quyết định.

## Quyền riêng tư
- **Dữ liệu của bạn thuộc về bạn**: Toàn bộ thông tin được lưu trữ cục bộ trên máy chủ của bạn.
- **Không theo dõi**: Không có mã theo dõi, analytics hay telemetry.

## Giấy phép
Mã nguồn được phân phối dưới giấy phép MIT.
