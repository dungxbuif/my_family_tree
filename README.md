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
- **Bảo mật**: Hệ thống đăng nhập và phân quyền (Admin, Editor, Member) tích hợp sẵn.
- **Sao lưu & Phục hồi**: Xuất/nhập file JSON, CSV, GEDCOM dễ dàng.

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
docker-compose exec app bun scripts/migrate-local-dev.sh
```

## Tài khoản đầu tiên
- Truy cập vào trang web và chọn **Đăng ký**.
- Người đăng ký đầu tiên sẽ tự động được cấp quyền **Admin**.
- Các tài khoản sau đó sẽ cần được Admin kích hoạt trong mục **Quản lý Người dùng**.

## Triển khai homelab: `family.dungxbuif.com`

Production chạy ứng dụng trên Mac mini, PostgreSQL tại Pi5 và Traefik tại
Orange Pi làm HTTPS reverse proxy.
Không chạy database container cùng ứng dụng production.

```bash
# Tại source repository
docker build -t homelab/family-tree:local .

# Chuẩn bị thư mục deploy trên Mac mini
mkdir -p ~/production/family-tree/uploads
cp -R deployment/production/. ~/production/family-tree/
cp docs/schema.sql ~/production/family-tree/schema.sql
cp ~/production/family-tree/.env.example ~/production/family-tree/.env
# Điền DATABASE_URL và các biến S3_*; không commit file .env.

# Khởi tạo schema (an toàn để chạy lặp lại), rồi chạy app
cd ~/production/family-tree
set -a; source .env; set +a
./migrate.sh
docker compose up -d
docker compose ps
```

Ảnh avatar và gallery được browser tải trực tiếp lên RustFS S3 bằng URL ký.
Production dùng `S3_BUCKET=mac-ocr` với `S3_PREFIX=family-tree`; các object
vẫn là private và được app phục vụ qua `/api/storage/...`. Không đưa file ảnh
qua Server Action hay lưu credential trong mã nguồn.

Thêm router/service sau vào `/opt/edge/traefik/dynamic.yml` trên Orange Pi,
giữ nguyên các route khác:

```yaml
http:
  routers:
    family:
      rule: "Host(`family.dungxbuif.com`)"
      entryPoints: [websecure]
      service: family
      tls: *wildcard_tls
  services:
    family:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: "http://10.10.0.10:18085"
```

Sau khi Traefik nạp lại cấu hình, mở `https://family.dungxbuif.com/login` để tạo tài khoản
Admin đầu tiên và kiểm tra đăng nhập, thành viên, quan hệ, ảnh và export/import.

## Phân quyền người dùng
1. **Admin**: Toàn quyền hệ thống, quản lý người dùng và dữ liệu riêng tư.
2. **Editor**: Thêm, sửa, xóa thành viên và quan hệ.
3. **Member**: Chỉ xem thông tin công khai và sơ đồ.

## Quyền riêng tư
- **Dữ liệu của bạn thuộc về bạn**: Toàn bộ thông tin được lưu trữ cục bộ trên máy chủ của bạn.
- **Không theo dõi**: Không có mã theo dõi, analytics hay telemetry.

## Giấy phép
Mã nguồn được phân phối dưới giấy phép MIT.
