# Doãn Đại Hiệp

Sảnh game trực tuyến mang phong cách võ hiệp, gồm Cờ Tướng và Ma Sói Online.

Sảnh game còn có **Ma Sói Online** cho 5–12 người. Mỗi người mở trang trên thiết bị riêng, nhập tên và tham gia bằng mã phòng sáu ký tự. Luna AI tự chia vai bí mật, điều phối các lượt ban đêm, kiểm phiếu ban ngày và công bố phe chiến thắng.

## Chạy đầy đủ chế độ online

```bash
npm install
npm start
```

Mở `http://localhost:8080` trên hai trình duyệt. Người thứ nhất chọn **Online → Tạo phòng mới**, sau đó gửi mã sáu ký tự cho người thứ hai để vào phòng.

Với Ma Sói, chọn game từ sảnh, tạo phòng rồi gửi mã cho ít nhất bốn người khác. Chủ phòng bắt đầu khi phòng có từ năm người.

Để hai người ở hai mạng khác nhau chơi với nhau, deploy toàn bộ dự án lên một dịch vụ chạy Node.js và mở biến môi trường `PORT`. Lệnh khởi động production là `npm start`. Máy chủ HTTP và WebSocket dùng chung cổng nên hoạt động trực tiếp sau reverse proxy HTTPS.

Nếu frontend được đặt ở tên miền khác máy chủ WebSocket, sao chép `.env.example` thành `.env` và đặt `VITE_WS_URL` thành địa chỉ `wss://` công khai của máy chủ trước khi build.

## Chỉ phát triển giao diện

Lệnh sau tự khởi động cả giao diện Vite và máy chủ phòng đấu:

```bash
npm run dev
```

Giao diện chạy ở cổng `5173`, WebSocket ở cổng `8080`. Có thể mở địa chỉ IP của máy tính ở cổng `5173` từ thiết bị khác trong cùng mạng Wi-Fi.

Nếu chỉ muốn chạy riêng từng tiến trình để gỡ lỗi, dùng `npm run dev:web` và `npm run server` trong hai terminal.
# doan-chi-binh
