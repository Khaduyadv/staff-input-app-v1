# Staff Access ID — Pilot

Các ID dưới đây chỉ là định tuyến UX cho Pilot. Chúng không phải credential, không thay thế Supabase Auth và không cấp quyền dữ liệu.

| Nhóm test | STAFF_ACCESS_ID | Staff Link |
|---|---|---|
| TEST_CSKH_A | `stf_pilot_a_7f3c9b2d` | `https://khaduyadv.github.io/staff-input-app-v1/?staff=stf_pilot_a_7f3c9b2d` |
| TEST_CSKH_B | `stf_pilot_b_4a82e1c6` | `https://khaduyadv.github.io/staff-input-app-v1/?staff=stf_pilot_b_4a82e1c6` |
| TEST_CBLD | `stf_pilot_l_9d51c0a8` | `https://khaduyadv.github.io/staff-input-app-v1/?staff=stf_pilot_l_9d51c0a8` |
| TEST_ADMIN | `stf_pilot_admin_2e64a7f1` | `https://khaduyadv.github.io/staff-input-app-v1/?staff=stf_pilot_admin_2e64a7f1` |

Chỉ gán các ID này vào `profiles.staff_access_id` sau khi Auth user tương ứng đã được xác nhận. Không đưa email, token, OTP hoặc mật khẩu vào Staff Link/QR.
