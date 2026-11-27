-- The owner's rules (27 Nov 2026) let any goods be sold in the trading forum — official goods, collectibles,
-- photo trades — and drop the line against reselling tickets above face value; fakes stay banned.
UPDATE forums SET
  descr = 'ของ Official ของสะสม เทรดรูป',
  rules = 'ห้ามขายของปลอม · นัดรับที่งานปลอดภัยที่สุด อย่าโอนเงินก่อนได้ของ · โพสต์ที่มีเลขบัญชีหรือเบอร์โทรจะรอผู้ดูแลตรวจก่อน'
WHERE slug = 'trade';
