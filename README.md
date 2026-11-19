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
- **Sao lưu & Phục hồi**: Chủ sở hữu có thể xuất hoặc phục hồi cây đang chọn bằng JSON, CSV hoặc GEDCOM. [Định dạng và cách phục hồi](docs/runbooks/family-tree-backup.md)

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

### Kiểm thử trình chọn cây bằng Chrome

Chạy ứng dụng với `DATABASE_URL` trỏ đến PostgreSQL kiểm thử đã áp dụng
`docs/schema.sql`. Trong terminal thứ hai, đặt `FAMILY_TREE_TEST_DATABASE_URL`
trỏ đến cùng cơ sở dữ liệu và `FAMILY_TREE_TEST_APP_URL` trỏ đến ứng dụng đó.
Máy chạy kiểm thử cần Bun, npx và Google Chrome.

```sh
bun scripts/test-tree-selector-browser.mjs
bun scripts/test-tree-membership-browser.mjs
bun scripts/test-tree-add-browser.mjs
bun scripts/test-data-tools-browser.mjs
```

Script tạo tài khoản và cây tạm thời, chạy Playwright CLI ở 320×568, 430×932
và 1280×800, rồi dọn dữ liệu kiểm thử. Ảnh và số đo nằm trong
`output/playwright/tree-selector/`. Đặt `PLAYWRIGHT_CLI` nếu cần dùng đường dẫn
đến wrapper Playwright CLI đã cài. Kiểm thử quản lý quyền ghi kết quả vào
`output/playwright/tree-membership/`. Kiểm thử thêm thành viên ghi kết quả vào
`output/playwright/tree-add/`.

Khi mất kết nối lúc thêm người, lần thử lại dùng cùng mã biểu mẫu và cùng tệp ảnh. Nếu mở lại trang, chọn lại tệp và nhập lại nội dung đã gửi để nhận kết quả lần trước. Kiểm thử ảnh đại diện dùng API ký thật. Khởi chạy ứng dụng kiểm thử với `S3_ENDPOINT=http://127.0.0.1:33407`, `S3_BUCKET=family`, `S3_ACCESS_KEY_ID=test` và `S3_SECRET_ACCESS_KEY=test`. Tạo bucket kiểm thử ở endpoint loopback và cho phép PUT từ origin của ứng dụng. Playwright gửi các PUT thật, sau đó ứng dụng xác nhận đối tượng trong bucket khi lưu hồ sơ.

Khi thẻ khác chuyển cây, bản nháp đang mở cho phép sao chép nội dung. Chọn **Ở lại với bản nháp** rồi **Chọn lại cây của bản nháp** để xác thực lại quyền và tiếp tục lưu, hoặc bỏ bản nháp để xem cây mới.

GEDCOM dùng thẻ mở rộng `1 _LIVING Y` cho người được ghi rõ còn sống và `1 DEAT Y` cho người đã mất. Nếu thiếu cả hai thông tin, trạng thái là chưa rõ. Chỉ cần có dữ liệu ngày mất, bản xuất ghi `1 DEAT Y` kể cả khi cờ cũ ghi còn sống hoặc chưa rõ. Thông tin đã mất được ưu tiên nếu có cả hai thẻ. Bên dưới `DEAT`, thẻ `DATE` lưu ngày dương lịch chuẩn. Thẻ mở rộng `_SOLAR_DATE` lưu ngày dương lịch thiếu thành phần mà `DATE` không biểu diễn được, còn `_LUNAR_DATE` lưu ngày âm lịch. Hai thẻ mở rộng dùng thứ tự năm, tháng, ngày và dấu `?` cho phần chưa rõ. Tháng âm lịch nhuận được lưu bằng số âm. Ngày mất dương lịch đầy đủ có thể xác định tháng nhuận trong dữ liệu cũ ghi tháng không dấu.

Trong **Cây gia phả**, chủ sở hữu và người chỉnh sửa có thể chọn **Thêm thành viên**.
Mở một người trên sơ đồ rồi chọn **Thêm thành viên** để lưu hồ sơ mới cùng
quan hệ với người đó. Nút ở ngoài hồ sơ tạo người chưa có quan hệ. Trạng thái mặc định là **Chưa rõ**. Có thể ghi rõ **Sống** hoặc **Đã mất**. Sau khi
lưu, cả ba chế độ sơ đồ lấy người vừa tạo làm gốc. Nút **Hủy** giữ vị trí trước đó.
Chỉ chủ sở hữu có quyền đọc và sửa thông tin riêng tư, bao gồm email có
thể thiết lập liên kết tài khoản. Muốn xóa hồ sơ đã liên kết, chủ sở hữu
cần hủy liên kết trong phần quản lý quyền trước.

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

Trong cây đang chọn, Chủ sở hữu mở **Quản lý quyền truy cập → Thêm quyền truy
cập**, nhập đầy đủ email của tài khoản đang hoạt động và chọn vai trò. Vai trò
mặc định là Người xem. Bạn có thể đổi vai trò trong danh sách người đã có quyền.
Mỗi cây cần giữ ít nhất một Chủ sở hữu đang hoạt động. Trước khi gỡ quyền,
hạ quyền, khóa hoặc xóa tài khoản Chủ sở hữu cuối cùng đang hoạt động, hãy cấp
quyền này cho một tài khoản đang hoạt động khác trong mỗi cây bị ảnh hưởng.

Để gắn tài khoản với một người trong gia phả, chọn **Liên kết hồ sơ**, nhập
email đầy đủ và chọn hồ sơ. Mã bên cạnh tên giúp phân biệt các hồ sơ trùng tên.
Nếu kết nối gián đoạn khi lưu, hãy mở lại danh sách trong thẻ mới để kiểm tra
kết quả. Thẻ hiện tại giữ thông tin đã gửi. Mở lại địa chỉ biểu mẫu trong cùng
phiên đăng nhập để xem kết quả, kể cả sau khi tự gỡ quyền. Nếu sau 30 giây hệ
thống vẫn chưa xác nhận, địa chỉ đó tiếp tục hiển thị thông tin đã gửi để đối
chiếu. Khi hệ thống xác nhận đã từ chối, bạn có thể sửa và gửi biểu mẫu mới.
Nếu tài khoản chưa tham gia cây, hệ thống cấp quyền
Người xem. Mỗi tài khoản có thể liên kết với một hồ sơ trong mỗi cây. Gỡ liên
kết trước khi đổi sang tài khoản khác hoặc gỡ quyền truy cập. Thay đổi email
của hồ sơ đã liên kết vẫn giữ nguyên tài khoản gắn với hồ sơ.

Chức năng chọn cây hiện áp dụng trên trang **Cây gia phả của tôi** và trang quản lý quyền. Việc phát
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

### Ảnh và sự kiện theo cây gia phả

Chủ sở hữu và người chỉnh sửa có thể quản lý sự kiện và hình ảnh trong cây đang chọn. Người xem có thể đọc lịch và xem ảnh. Mỗi ảnh tải lên có khóa riêng theo cây. Máy chủ kiểm tra quyền hiện tại cho từng lần đọc hoặc tải lên, kể cả khi trình duyệt còn giữ đường dẫn cũ. Quy trình chuyển đổi ảnh cũ và dọn tệp không còn được sử dụng nằm trong [hướng dẫn triển khai](docs/runbooks/multi-family-production-migration.md#media-ownership-at-cutover).
