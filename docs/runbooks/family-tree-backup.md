# Sao lưu và phục hồi một cây gia phả

Chọn cây trong **Tài khoản → Cây gia phả của tôi**, rồi mở **Sao lưu & Phục hồi**. Chỉ chủ sở hữu hiện tại có thể tải tệp hoặc phục hồi. Tệp JSON và CSV có thể chứa email, số điện thoại, nghề nghiệp và nơi ở. Lưu tệp ở nơi chỉ người được phép có thể đọc.

1. Chọn **Toàn bộ dữ liệu** và **Xuất JSON** để có bản sao của cây trước khi thay đổi.
2. Để xuất một nhánh, chọn thành viên gốc. Bản xuất chứa người gốc, con cháu theo quan hệ con ruột hoặc con nuôi, vợ/chồng của những người này và các quan hệ giữa những người đã chọn. Sự kiện và thư viện ảnh thuộc cả cây nên vẫn có trong bản xuất nhánh.
3. Chọn tệp phục hồi, kiểm tra tên cây và tên tệp trong hộp xác nhận, rồi chọn **Xác nhận thay thế**. Phục hồi một nhánh cũng thay thế dữ liệu của cả cây đích. Có thể chọn **Hủy bỏ** trước khi xác nhận.
4. Sau khi thành công, đối chiếu thành viên, quan hệ, sự kiện và thư viện ảnh. Bản ghi ảnh thiếu nguồn hợp lệ vẫn giữ tiêu đề và mô tả. Mở mục ảnh để tải ảnh thay thế. Nếu có lỗi, cơ sở dữ liệu hoàn tác toàn bộ lần phục hồi. Sửa tệp hoặc kết nối rồi thử lại.

## Định dạng trao đổi

Bản xuất JSON phiên bản 4 có `version: 4`, thời điểm UTC `timestamp` và năm mảng bắt buộc. ID là UUID. Các mảng có thể rỗng. Khi nhập, trường dữ liệu ngoài định dạng phiên bản 4 gây lỗi. Bản CSV (Zip) có `manifest.json` có trường `version: 4` và năm tệp CSV UTF-8 mang tên các mảng. Manifest của bản xuất hiện tại còn có `textEscaping: "apostrophe-v1"`. Khi ghi CSV, ứng dụng thêm một dấu nháy đơn trước các chuỗi bắt đầu bằng dấu nháy đơn, tab, ký tự xuống dòng hoặc biểu thức bảng tính (kể cả biểu thức có khoảng trắng phía trước). Khi đọc đúng manifest này, ứng dụng gỡ một dấu nháy đã thêm. Chuỗi điện thoại giữ số 0 ở đầu.

| Mảng | Nội dung |
| --- | --- |
| `persons` | `id`, `full_name`, `gender`, `other_names`, `email`, `note`, `avatar_url`, `is_deceased`, `is_in_law`, `birth_order`, `generation` và các phần `year`, `month`, `day` của `birth`, `death`, `death_lunar`. Ngày thiếu thành phần giữ giá trị null. |
| `relationships` | `id`, `type`, `person_a`, `person_b`, `note`. Cả hai đầu quan hệ phải xuất hiện trong `persons`. |
| `person_details_private` | `person_id`, `phone_number`, `occupation`, `current_residence`. Mỗi người có tối đa một dòng. |
| `custom_events` | `id`, `name`, `content`, `event_date`, `location`. Ngày có dạng YYYY-MM-DD. |
| `gallery_items` | `id`, `title`, `description`, `event_date`, `image_url`. Ngày và ảnh có thể là null. |

Phiên bản 4 thay thế cả năm tập dữ liệu. JSON phiên bản 1–3, tệp CSV cũ và GEDCOM cần có ít nhất một thành viên. Với ngày sự kiện, phiên bản 4 yêu cầu YYYY-MM-DD. Tệp cũ cũng có thể chứa thời điểm ISO do PostgreSQL và Node.js ghi từ nửa đêm địa phương. Trình nhập hiểu nửa đêm UTC, nửa đêm theo múi giờ máy chủ hiện tại và múi giờ Việt Nam. Nếu đã đổi múi giờ máy chủ và gặp ngày mơ hồ, chuyển trường này sang YYYY-MM-DD theo múi giờ gốc trước khi nhập. Với tệp cũ, thông tin riêng tư và sự kiện vắng mặt được coi là danh sách rỗng. Thư viện ảnh hiện tại được giữ nếu tệp cũ thiếu mảng ảnh. GEDCOM trao đổi phả hệ theo các trường được hỗ trợ, gồm người, ngày và quan hệ gia đình. Mỗi tham chiếu FAMS hoặc FAMC của thành viên phải có vai trò tương ứng trong bản ghi gia đình. Tệp GEDCOM bị cắt mất vai trò bị từ chối trước khi thay thế dữ liệu. Chọn JSON để phục hồi đầy đủ dữ liệu trong bảng trên.

## Quyền, mã hồ sơ và lưu trữ

Phục hồi giữ UUID đã tồn tại trong cây đích. Với UUID khác, ứng dụng tính UUID mới từ cây đích, loại bản ghi và mã nguồn, rồi đổi các tham chiếu nội bộ theo cùng ánh xạ. Các mã tự sinh khi đọc GEDCOM chỉ có hiệu lực cho lần đọc đó.

Liên kết tài khoản được bảo toàn theo mã đích đã ánh xạ. Có thể nhập lại cùng bản JSON hoặc CSV sau khi liên kết người vừa phục hồi. Nếu bản sao bỏ sót một người đang có liên kết, chủ sở hữu cần hủy liên kết rõ ràng trước khi phục hồi. Email trong tệp là dữ liệu liên hệ. Việc cấp quyền hoặc thiết lập liên kết tài khoản thực hiện tại trang quản lý quyền. Thông tin đăng nhập, mã người dùng hệ thống, người tạo bản ghi, mốc thời gian quản trị và quyền thành viên nằm ngoài định dạng.

Tệp chứa tham chiếu ảnh. Dữ liệu ảnh nằm trong kho riêng của máy chủ. Chỉ tham chiếu do cây đích sở hữu, đúng thư mục và còn có thể sử dụng mới được gắn lại. Máy chủ kiểm tra cả ảnh đang dùng và ảnh đã tách trước khi thay thế dữ liệu. Tối đa bốn yêu cầu kiểm tra chạy đồng thời, dùng chung thời hạn năm giây. Ảnh bị thiếu, không xác minh được, đang dọn dẹp hoặc thuộc nguồn khác được hiển thị dưới dạng chưa có ảnh; tiêu đề và mô tả vẫn còn. Khi khôi phục toàn hệ thống, dùng bản sao PostgreSQL cùng bản sao kho ảnh. [Quy trình phục hồi vận hành](multi-family-production-migration.md)

Mã ứng dụng dùng `familyPeople(actor, treeId).exportBackup(root?)` và `importBackup(input)`. Mỗi thao tác xác thực Tree Membership hiện tại. Trang phục hồi gửi `POST /dashboard/data/restore?tree=<UUID>` dưới dạng multipart với tệp `backup` và `confirmed=replace`. Trình duyệt cần phiên đăng nhập cùng nguồn gốc. Khi tắt JavaScript, chọn tệp, đánh dấu xác nhận rồi gửi biểu mẫu. Giới hạn chung khi xuất và phục hồi là **32 MiB (33.554.432 byte)** cho mỗi tệp. Giới hạn này cũng áp dụng cho tổng dung lượng UTF-8 của năm bảng CSV và manifest sau giải nén. Trình xuất kiểm tra kích thước thực của tệp trước khi tải xuống. Nếu vượt giới hạn, yêu cầu quản trị viên sao lưu PostgreSQL cùng kho ảnh theo quy trình phục hồi vận hành ở trên. Yêu cầu trả HTTP 413, mã `BACKUP_TOO_LARGE` cho máy khách JSON khi vượt giới hạn. Bộ kiểm tra ảnh chạy ngoài giao dịch. Ngay trước khi ghi, ứng dụng kiểm tra lại quyền chủ sở hữu và quyền sử dụng từng ảnh, rồi thay thế dữ liệu trong một giao dịch giữ khóa cây đích. Thống kê và tra cứu danh xưng dùng đồ thị của cây được chọn. Chủ sở hữu và người chỉnh sửa có thể xem trước rồi ghi thứ tự gia phả của cây đó.
