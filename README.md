# Staff Input App V1 — Candidate/Pilot

Candidate mobile-first đã dựng theo baseline đã chốt.

## Có sẵn
- Shared Staff Workspace: một URL chung, chọn nhân viên phụ trách rồi chọn Shop.
- Owner/CSKH/CBLĐ lấy từ Assignment; người nhập hộ không đổi attribution.
- Danh sách Shop + tìm kiếm/lọc.
- MD/Nợ PS hiển thị chỉ đọc (demo).
- Tạo/sửa kế hoạch theo event, không mất lịch sử.
- Hủy thay vì xóa.
- Payment Signal có phân loại và chọn UNC.
- `PROJECT_ID + SHOP_ID`.
- Auth bảo vệ App; session bền vững và logout.
- PWA manifest/icon cho Add to Home Screen; không cache dữ liệu nhạy cảm.
- Schema Supabase cho Auth/Postgres/Storage integration.
- Staff Dataset Contract khởi tạo.

## Candidate hiện tại
Mở `index.html`; dữ liệu demo lưu localStorage khi không có Supabase. Bản online dùng Supabase Auth/Postgres/private Storage.

## Production target
GitHub = code/deploy. Supabase = email magic link/OTP + Postgres + private Storage + RLS.
MD/Assignment ingestion chỉ đọc. Forecast Rule là lớp dùng chung Primary/Control Tower; Staff không quyết định Signal Eligible.

## Hard gate trước cut-over
Assignment/Shop identity, Plan/Payment reconciliation, Primary & Control Tower shadow, double-count, history, UNC retrieval, role access, mobile, backup/restore đều phải PASS.
Excel production vẫn là fallback cho tới khi các gate PASS.
