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

## Kiểm tra trước khi deploy

```bash
npm test
npm run build
```

Bộ test dùng Node.js test runner, gồm luật chơi, phòng WebSocket và vòng đời lượt máy Caro. Test tự chạy máy chủ trên cổng ngẫu nhiên, không dùng phòng đang chơi.

Ma Sói lưu mã kết nối riêng trong phiên trình duyệt. Khi mất mạng, chọn **Kết nối lại** trong vòng 60 giây để giữ chỗ; hết thời gian, người chơi rời ván để không chặn lượt bỏ phiếu. Đóng toàn bộ kết nối vẫn kết thúc phòng như trước. Dùng lại cùng tab để giữ mã kết nối; không chia sẻ mã này.

Thợ Săn được chọn một người còn sống để bắn khi bị loại ban đêm hoặc do bỏ phiếu. Có thể bỏ qua; hết 60 giây, ván tự tiếp tục. Rời ván do mất kết nối không kích hoạt phát bắn. Thuốc của Phù Thủy được cấp lại mỗi ván.

Ba độ khó Caro dùng cùng bộ kiểm tra thắng/chặn thua tức thì, với mức ưu tiên phòng thủ tăng dần từ Dễ đến Khó.

Kiểm tra bố cục trình duyệt trong `npm test` dùng Chrome headless ở các chiều rộng 360, 768, 1024 và 1280 px. Cài Chrome hoặc đặt `CHROME_BIN` tới trình duyệt Chromium; nếu không có, riêng bài kiểm tra này sẽ được bỏ qua. Ảnh Caro sau khi đặt quân được lưu ở thư mục tạm dưới tên `xiangqi-caro-<chiều rộng>.png`.

## Đấu Trí IQ online

Mở **Đấu Trí IQ**, nhập tên, chọn 5/10/15 câu rồi bấm **Tạo phòng mới**. Gửi mã sáu ký tự cho bạn bè; mỗi người mở IQ trên thiết bị riêng, nhập tên và mã để **Tham gia**. Phòng hỗ trợ 2–6 người, chủ phòng bấm **Bắt đầu so tài** khi đủ người.

Cả phòng trả lời cùng một câu trong 20 giây. Mỗi đáp án chỉ được khóa một lần. Khi mọi người đã trả lời hoặc hết giờ, máy chủ công bố đáp án và điểm: 100 điểm nếu đúng, cộng 5 điểm cho mỗi giây còn lại, tối đa 200 điểm. Chủ phòng chuyển câu và có thể mở ván mới sau bảng xếp hạng.

Mất kết nối có thể kết nối lại từ cùng tab, giữ chỗ và điểm bằng mã riêng lưu trong phiên trình duyệt. Đồng hồ vẫn chạy; người mất mạng không chặn cả phòng. Chủ phòng rời đi sẽ chuyển quyền cho người còn kết nối. Phòng đóng khi tất cả rời đi hoặc chủ phòng kết thúc phòng. Máy chủ khởi động lại sẽ mất các phòng đang chơi.

Chọn **Chơi cùng máy** ở đầu trang IQ để dùng chế độ chuyền thiết bị như trước. Chế độ online cần chạy `npm run dev` khi phát triển, hoặc `npm run build` rồi `npm start` khi chạy bản build; `npm run dev:web` riêng chỉ phục vụ giao diện.


IQ có 120 câu thuộc 10 nhóm: suy luận số, logic, toán ứng dụng, quan sát, mật mã, không gian, xác suất, ngôn ngữ, thời gian và tư duy nhanh. Mỗi ván ưu tiên câu chưa gặp và trộn chủ đề, đồng thời đảo thứ tự đáp án.

Phòng ghi nhớ các câu đã chọn qua các ván; trình duyệt lưu các câu đã gặp để tránh lặp khi tạo hoặc vào phòng khác và khi chơi cùng máy. Khi đã dùng hết bộ câu, hệ thống dùng lại các câu gặp lâu nhất trước. Xóa dữ liệu trình duyệt sẽ đặt lại lịch sử cá nhân; nếu trình duyệt chặn lưu trữ, lịch sử trong phòng vẫn hoạt động.
