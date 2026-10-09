# Triển khai online — Candidate/Pilot

## 1. Supabase
1. Tạo project Supabase.
2. Authentication > URL Configuration: đặt Site URL bằng URL GitHub Pages sau khi tạo.
3. Bật Email OTP/Magic Link.
4. SQL Editor: chạy `SUPABASE_BOOTSTRAP.sql`.
5. Storage: tạo bucket **private** tên `unc`.
6. Không đưa `service_role` key vào frontend/GitHub.

## 2. GitHub
1. Tạo repository private/public tùy lựa chọn.
2. Upload nội dung thư mục này.
3. Tạo `config.js` từ `config.example.js`; chỉ dùng Supabase URL + public anon key.
4. Settings > Pages > Deploy from branch > main/root.
5. Ghi URL Pages vào Supabase Auth redirect URLs.

## 3. Pilot data
Chưa nạp dữ liệu thật cho tới khi adapter MD/Assignment được chạy read-only.
Tạo profile Admin đầu tiên bằng SQL có kiểm soát sau khi tài khoản Auth đã tồn tại.

## 4. Hard gate
Không cut-over Excel. Chỉ pilot khi:
- RLS test CSKH/CBLĐ/Admin PASS
- Magic link/OTP PASS
- UNC private upload/retrieval PASS
- append-only history PASS
- mobile PASS
- backup/restore PASS

## Lưu ý
GitHub Pages chỉ host frontend. Dữ liệu nghiệp vụ nằm trong Supabase.
