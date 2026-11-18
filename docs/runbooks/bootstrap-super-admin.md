# Khởi tạo Quản trị viên hệ thống

Người vận hành có quyền truy cập PostgreSQL thực hiện quy trình này sau khi
chạy migration, khi cơ sở dữ liệu chưa có Quản trị viên hệ thống đang hoạt động.
Tài khoản được tạo với email chuẩn hóa, mật khẩu đã băm và quyền quản trị tài khoản.

Chạy lệnh bên dưới trong Bash từ thư mục mã nguồn đã chạy `bun install`.
Đặt `DATABASE_URL` trỏ tới cơ sở dữ liệu đã chạy migration và dùng email chưa
có trong hệ thống.

```bash
(
  set -eu
  : "${DATABASE_URL:?Set and export DATABASE_URL to the migrated PostgreSQL database}"
  read -r -p 'Email: ' bootstrap_email
  read -r -s -p 'Mật khẩu: ' bootstrap_password
  printf '\n'
  printf '%s' "$bootstrap_password" | BOOTSTRAP_EMAIL="$bootstrap_email" bun -e '
    import { pool, withTransaction } from "./utils/db/client";
    import { hashPassword } from "./utils/auth/password";

    try {
      const password = await Bun.stdin.text();
      if (password.length < 6 || password.length > 1024) {
        throw new Error("Mật khẩu phải có từ 6 đến 1024 ký tự.");
      }
      const hash = await hashPassword(password);
      await withTransaction(async (db) => {
        await db.query("SELECT pg_advisory_xact_lock(917208342)");
        const { rows: [{ email }] } = await db.query(
          "SELECT public.normalize_email($1) AS email", [process.env.BOOTSTRAP_EMAIL],
        );
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("Email không hợp lệ.");
        }
        const { rowCount } = await db.query(`
          WITH account AS (
            INSERT INTO users (email, password_hash)
            SELECT $1, $2 WHERE NOT EXISTS (
              SELECT FROM profiles WHERE is_active AND is_super_admin
            )
            RETURNING id
          )
          INSERT INTO profiles (id, is_active, is_super_admin)
          SELECT id, true, true FROM account
        `, [email, hash]);
        if (!rowCount) throw new Error("Đã có Quản trị viên hệ thống đang hoạt động.");
      });
      console.log("Đã tạo Quản trị viên hệ thống.");
    } catch (error) {
      console.error(error.code
        ? "Không thể tạo tài khoản. Kiểm tra kết nối, migration và email đã dùng."
        : error.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  '
)
```

Đăng nhập tại `/login` rồi mở **Tài khoản → Quản lý người dùng** để cấp tài
khoản cho người dùng. Với email đã có, người vận hành có thể phục hồi tài
khoản Quản trị viên hệ thống đã xác minh bằng quy trình khôi phục cơ sở dữ liệu.
