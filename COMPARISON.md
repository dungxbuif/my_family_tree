# BÁO CÁO SO SÁNH TÍNH NĂNG & ĐỀ XUẤT NÂNG CẤP GIA PHẢ OS

Báo cáo này thực hiện so sánh các tính năng hiện tại của **Gia Phả OS** với dự án tham chiếu **AncestorTree** (lấy từ thư mục `references`). Dựa trên cơ sở đó, chúng tôi đề xuất danh sách các tính năng mới mang đậm bản sắc văn hóa Việt Nam và tối ưu hóa trải nghiệm người dùng để bổ sung vào Gia Phả OS.

---

## I. So sánh tính năng giữa Gia Phả OS và AncestorTree

| Nhóm tính năng | Gia Phả OS (Hiện tại) | AncestorTree (Tham chiếu) | Đánh giá & Khác biệt |
| :--- | :--- | :--- | :--- |
| **Cốt lõi & Cây gia phả** | • Sơ đồ phả hệ dạng Cây (Tree) và Sơ đồ tư duy (Mindmap).<br>• Quản lý thành viên bản giản lược.<br>• Quản lý quan hệ (đa thê, đa phu). | • Cây gia phả tương tác mạnh (zoom, pan, collapse/expand 10+ đời).<br>• Hồ sơ chi tiết (30+ trường thông tin).<br>• Cây lọc theo gốc (bắt đầu từ bất kỳ ai). | **AncestorTree** mạnh hơn về độ sâu thông tin hồ sơ và các tính năng tương tác cây (lọc cây theo gốc rất hữu ích cho dòng họ lớn). |
| **Văn hóa Việt Nam** | • Xác định danh xưng tự động (Bác, Chú, Cô, Dì...).<br>• Theo dõi ngày giỗ (lịch dương). | • Quản lý theo Chi/Nhánh dòng họ.<br>• Tự động tính đời (Generation).<br>• Chuyển đổi Lịch âm dương & xem Can Chi.<br>• Bảng vinh danh thành tích gia tộc.<br>• Hương ước/Gia huấn dòng họ. | **AncestorTree** vượt trội về chiều sâu văn hóa Việt Nam (âm lịch, chi nhánh, gia huấn, vinh danh). Gia Phả OS hiện chỉ có xác định danh xưng tự động và lịch giỗ cơ bản. |
| **Quản trị & Sự kiện** | • Thống kê nhân khẩu học & Sự kiện ngày giỗ cơ bản.<br>• Sao lưu (JSON, CSV, GEDCOM). | • Phân công trách nhiệm cúng giỗ ("Cầu đương") tự động bằng thuật toán DFS.<br>• Quỹ khuyến học & Quỹ dòng họ (thu, chi, học bổng).<br>• Trang Hội đồng (`/council`) và Nhà thờ họ (`/ancestral-hall`). | **AncestorTree** có tính năng phân công "Cầu đương" cực kỳ thực tế cho văn hóa cúng giỗ Việt Nam, kèm hệ thống Quỹ khuyến học rất bài bản. |
| **Cộng đồng & Giao lưu** | *Chưa có* | • Góc giao lưu dòng họ (Feed bài viết, bình luận, thả tim, đăng ảnh).<br>• Hệ thống thông báo tự động (DB Triggers). | **AncestorTree** giúp tăng tính gắn kết con cháu thông qua mạng xã hội thu nhỏ cho dòng họ. |
| **Bảo mật & Phân quyền** | • Phân quyền 3 cấp (Admin, Editor, Member) qua Supabase. | • Phân quyền 4 cấp (Admin, Editor, Viewer, Guest).<br>• Xác minh tài khoản 2 lớp (MFA/TOTP).<br>• Admin/Sub-admin duyệt đơn đăng ký của thành viên mới.<br>• Ẩn thông tin nhạy cảm (SĐT, Email) với tài khoản chưa duyệt. | **AncestorTree** thiết kế bảo mật chặt chẽ hơn, bảo vệ quyền riêng tư cực tốt (tránh lộ thông tin liên lạc của dòng họ ra ngoài). |
| **Nâng cao & Nền tảng** | • Bản Web tối ưu Mobile/Desktop.<br>• Triển khai qua Vercel/Supabase. | • Bản Desktop chạy Offline hoàn toàn (Electron + SQLite).<br>• Thuật toán tìm quan hệ & xưng hô (BFS) giữa 2 người bất kỳ.<br>• Phát hiện trùng lặp hồ sơ (Levenshtein + NFD).<br>• Chế độ người cao tuổi (chữ to, giao diện tối giản). | **AncestorTree** hỗ trợ chạy offline không cần cloud qua bản Desktop App, hỗ trợ người già rất tốt và có thuật toán thông minh tìm quan hệ giữa 2 người. |

---

## II. Đề xuất các tính năng mới bổ sung vào Gia Phả OS

Để nâng cấp Gia Phả OS trở thành một nền tảng quản lý gia phả toàn diện và chuyên sâu nhất cho người Việt, chúng tôi đề xuất bổ sung các tính năng được lấy cảm hứng và cải tiến từ dự án tham chiếu:

### 1. Nhóm tính năng Đậm đà bản sắc Việt (Vietnamese Culture)
*   **Quản lý Chi - Nhánh dòng họ:** Cho phép phân chia cây gia phả lớn thành các chi, nhánh nhỏ để dễ quản lý, tìm kiếm và hiển thị.
*   **Tích hợp Lịch Âm - Dương & Can Chi:** 
    *   Tự động đổi ngày giỗ âm lịch sang dương lịch hàng năm để thông báo cho con cháu.
    *   Hiển thị tuổi Can Chi (ví dụ: Giáp Tý, Nhâm Thân...) trong hồ sơ thành viên.
*   **Hương ước & Gia huấn dòng họ (`/charter`):** Trang lưu trữ những quy tắc ứng xử, lời dạy của tổ tiên, gia quy dòng họ dưới dạng bài viết trang trọng.
*   **Vinh danh & Khuyến học (`/achievements` & `/fund`):**
    *   Bảng vàng vinh danh các thành viên đỗ đạt, có thành tích xuất sắc hoặc đóng góp lớn cho dòng họ.
    *   Quản lý quỹ dòng họ, theo dõi thu chi minh bạch và phát học bổng khuyến học cho con cháu.

### 2. Nhóm tính năng Quản lý Nghi lễ & Thuật toán thông minh
*   **Thuật toán phân công Cúng giỗ ("Cầu đương"):** Tự động xoay vòng trách nhiệm chủ trì ngày giỗ/lễ tết giữa các gia đình/nhánh con cháu theo lịch âm một cách công bằng.
*   **Công cụ tìm kiếm quan hệ thông minh (`/relationship`):** 
    *   Áp dụng thuật toán BFS để tìm ra đường đi ngắn nhất giữa 2 người bất kỳ trên cây gia phả.
    *   Tự động diễn giải mối quan hệ bằng tiếng Việt (ví dụ: *"Nguyễn Văn A là bác họ bên ngoại của Trần Thị B"*).
*   **Cây gia phả lọc theo gốc:** Cho phép người dùng chọn một thành viên bất kỳ làm gốc (Root) để dựng lại cây gia phả chỉ tính từ người đó trở xuống, giúp giảm tải giao diện khi cây quá lớn.

### 3. Nhóm tính năng Bảo mật & Gắn kết Cộng đồng
*   **Hệ thống duyệt thành viên đăng ký trực tuyến:** 
    *   Con cháu tự đăng ký tài khoản qua Form công khai, nhưng phải được Admin hoặc Sub-admin (trưởng chi/nhánh) phê duyệt mới có quyền xem thông tin liên lạc nhạy cảm.
    *   Tránh rò rỉ dữ liệu cá nhân (số điện thoại, địa chỉ, email) ra ngoài Internet.
*   **Kho tư liệu dòng họ (`/documents`):** Nơi số hóa và lưu trữ các tài liệu quý như ảnh tư liệu cổ, bản đồ mộ phần, file PDF gia phả giấy, video quay cảnh cúng tế.
*   **Góc giao lưu dòng họ (`/feed`):** Mạng xã hội nội bộ nhỏ để con cháu đăng ảnh cưới, lễ tết, chúc mừng thọ hoặc chia sẻ tin buồn, có hệ thống thả tim và bình luận để kết nối con cháu ở xa.
*   **Chế độ người cao tuổi:** Nút chuyển đổi giao diện nhanh giúp phóng to chữ (font-size lớn) và đơn giản hóa bảng danh sách để các cụ lớn tuổi dễ dàng tra cứu.
