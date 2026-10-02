# Staff Input App V1 — Candidate/Pilot

Candidate mobile-first đã dựng theo baseline đã chốt.

## Có sẵn
- Danh sách Shop + tìm kiếm/lọc.
- MD/Nợ PS hiển thị chỉ đọc (demo).
- Tạo/sửa kế hoạch theo event, không mất lịch sử.
- Hủy thay vì xóa.
- Payment Signal có phân loại và chọn UNC.
- `PROJECT_ID + SHOP_ID`.
- Schema Supabase cho Auth/Postgres/Storage integration.
- Staff Dataset Contract khởi tạo.

## Candidate hiện tại
Mở `index.html`; dữ liệu demo lưu localStorage. Không có credential GitHub/Supabase trong phiên này nên chưa thể deploy online, magic-link thật hoặc upload UNC thật.

## Production target
GitHub = code/deploy. Supabase = email magic link/OTP + Postgres + private Storage + RLS.
MD/Assignment ingestion chỉ đọc. Forecast Rule là lớp dùng chung Primary/Control Tower; Staff không quyết định Signal Eligible.

## Hard gate trước cut-over
Assignment/Shop identity, Plan/Payment reconciliation, Primary & Control Tower shadow, double-count, history, UNC retrieval, role access, mobile, backup/restore đều phải PASS.
Excel production vẫn là fallback cho tới khi các gate PASS.
